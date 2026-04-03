import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import os, signal, warnings, datetime, queue, threading, json  # ← signal added
import numpy as np
import cv2
import face_recognition
from concurrent.futures import ThreadPoolExecutor

from flask import Flask, Response, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client

warnings.filterwarnings("ignore", category=UserWarning, module="pkg_resources")
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

# ==========================================
# CONFIGURATION
# ==========================================
SUPABASE_URL = "https://wjyoruvcyjnwsimeqrgl.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqeW9ydXZjeWpud3NpbWVxcmdsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc0MjExOCwiZXhwIjoyMDg3MzE4MTE4fQ.gWuZCPZeJmPy_hskmFkzNc9dHlGHKXDHDqyFNBciKKc"
BUCKET_NAME = "facial_data"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print("✓ Supabase client ready")

app = Flask(__name__)
CORS(app)

attendee_queue = queue.Queue()
recently_seen  = {}
COOLDOWN_SECS  = 5

PROFESSOR_START_WINDOW = 45
STUDENT_GRACE_MINUTES  = 15

thread_pool = ThreadPoolExecutor(max_workers=3)

# ─────────────────────────────────────────────
# Timezone-safe datetime parser
# FIX: Supabase returns timestamptz as "2024-01-15T08:30:00+00:00"
# datetime.fromisoformat() in Python < 3.11 cannot parse the "+HH:MM"
# offset form reliably, so we normalize it first.
# ─────────────────────────────────────────────
def parse_dt(value) -> datetime.datetime:
    """Parse a Supabase timestamptz string into a naive local datetime."""
    if value is None:
        return None
    s = str(value)
    # Normalize Z → +00:00 for compatibility
    s = s.replace('Z', '+00:00')
    try:
        dt = datetime.datetime.fromisoformat(s)
    except ValueError:
        # Last-resort fallback: strip timezone and treat as-is
        dt = datetime.datetime.fromisoformat(s[:19])
        return dt
    # Convert to local time and strip timezone info
    if dt.tzinfo is not None:
        dt = dt.astimezone().replace(tzinfo=None)
    return dt

# ─────────────────────────────────────────────
# Face loading from Supabase Storage
# ─────────────────────────────────────────────
known_encodings    = []
known_meta         = []
known_encodings_np = None

def load_encodings_from_storage(cloud_folder, meta):
    try:
        files = supabase.storage.from_(BUCKET_NAME).list(cloud_folder)
        if not files:
            print(f"    ✗ No files in: {cloud_folder}")
            return 0

        images = [f for f in files if f['name'].lower().endswith(('.jpg', '.jpeg', '.png'))]
        if not images:
            print(f"    ✗ No images in: {cloud_folder}")
            return 0

        count = 0
        for img_file in sorted(images, key=lambda x: x['name'])[:3]:
            file_path = f"{cloud_folder}/{img_file['name']}"
            try:
                img_bytes = supabase.storage.from_(BUCKET_NAME).download(file_path)
                nparr     = np.frombuffer(img_bytes, np.uint8)
                img       = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if img is None:
                    continue
                rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                encs    = face_recognition.face_encodings(rgb_img, num_jitters=1)
                if encs:
                    known_encodings.append(encs[0])
                    known_meta.append(meta)
                    count += 1
            except Exception as e:
                print(f"    ⚠ Error loading {img_file['name']}: {e}")
        return count
    except Exception as e:
        print(f"    ✗ Error accessing {cloud_folder}: {e}")
        return 0

def load_all_faces():
    global known_encodings_np

    # ── Students ──
    result = supabase.table("students")\
        .select("student_id, id_number, first_name, middle_name, last_name, facial_dataset_path")\
        .not_.is_("facial_dataset_path", "null")\
        .neq("facial_dataset_path", "")\
        .execute()

    rows = result.data or []
    print(f"\n── Students with facial path: {len(rows)}")
    for row in rows:
        mid  = row.get("middle_name") or ""
        meta = {
            "role":      "student",
            "id":        row["student_id"],
            "id_number": row["id_number"],
            "name":      f"{row['first_name']} {mid} {row['last_name']}".strip()
        }
        n      = load_encodings_from_storage(row["facial_dataset_path"], meta)
        status = f"✓ {n} enc" if n else "✗ 0 enc"
        print(f"    [{status}] {meta['name']} → {row['facial_dataset_path']}")

    # ── Professors ──
    result = supabase.table("professors")\
        .select("professor_id, employee_id, first_name, middle_name, last_name, facial_dataset_path")\
        .not_.is_("facial_dataset_path", "null")\
        .neq("facial_dataset_path", "")\
        .execute()

    rows = result.data or []
    print(f"\n── Professors with facial path: {len(rows)}")
    for row in rows:
        mid  = row.get("middle_name") or ""
        meta = {
            "role":        "professor",
            "id":          row["professor_id"],
            "employee_id": row["employee_id"],
            "name":        f"Prof. {row['first_name']} {mid} {row['last_name']}".strip()
        }
        n      = load_encodings_from_storage(row["facial_dataset_path"], meta)
        status = f"✓ {n} enc" if n else "✗ 0 enc"
        print(f"    [{status}] {meta['name']} → {row['facial_dataset_path']}")

    if known_encodings:
        known_encodings_np = np.array(known_encodings)
        print(f"\n✓ Total encodings loaded: {len(known_encodings)}")
    else:
        print("\n⚠ NO encodings loaded — face recognition will show 'Unknown' for everyone")
    print("=" * 60)

load_all_faces()

# ─────────────────────────────────────────────
# Time helper
# Handles both datetime.timedelta (rare) and "HH:MM:SS" strings
# returned by Supabase for "time without time zone" columns
# ─────────────────────────────────────────────
def td_to_secs(td):
    if isinstance(td, datetime.timedelta):
        return int(td.total_seconds())
    if isinstance(td, str):
        parts = td.split(':')
        return int(parts[0])*3600 + int(parts[1])*60 + int(parts[2]) if len(parts) == 3 else 0
    return 0

# ─────────────────────────────────────────────
# Supabase DB helpers
# ─────────────────────────────────────────────
def find_professor_schedule(professor_id, today):
    day_name = today.strftime("%A")

    result = supabase.table("lab_schedules")\
        .select("schedule_id, section, start_time, end_time, subjects(subject_code), laboratory_rooms(lab_code)")\
        .eq("professor_id", professor_id)\
        .eq("day_of_week", day_name)\
        .eq("status", "active")\
        .order("start_time")\
        .execute()

    schedules = result.data or []
    output    = []

    for sch in schedules:
        sess_result = supabase.table("lab_sessions")\
            .select("session_id, status")\
            .eq("schedule_id", sch["schedule_id"])\
            .eq("session_date", str(today))\
            .execute()

        session = sess_result.data[0] if sess_result.data else None

        output.append({
            "schedule_id":    sch["schedule_id"],
            "section":        sch["section"],
            "subject_code":   sch["subjects"]["subject_code"] if sch.get("subjects") else "N/A",
            "lab_code":       sch["laboratory_rooms"]["lab_code"] if sch.get("laboratory_rooms") else "N/A",
            "start_time":     sch["start_time"] or "00:00:00",
            "end_time":       sch["end_time"]   or "00:00:00",
            "session_id":     session["session_id"] if session else None,
            "session_status": session["status"]     if session else "not_created",
        })

    return output

def find_student_schedule(student_id, today):
    day_name = today.strftime("%A")

    # Get enrolled schedule IDs
    enroll_result = supabase.table("schedule_enrollments")\
        .select("schedule_id")\
        .eq("student_id", student_id)\
        .eq("status", "enrolled")\
        .execute()

    enrolled_ids = [e["schedule_id"] for e in (enroll_result.data or [])]
    if not enrolled_ids:
        return None

    # Get active schedules today
    sched_result = supabase.table("lab_schedules")\
        .select("schedule_id, start_time, end_time")\
        .in_("schedule_id", enrolled_ids)\
        .eq("day_of_week", day_name)\
        .eq("status", "active")\
        .order("start_time")\
        .execute()

    schedules = sched_result.data or []
    if not schedules:
        return None

    # Get today's sessions for these schedules
    schedule_ids = [s["schedule_id"] for s in schedules]
    sess_result  = supabase.table("lab_sessions")\
        .select("session_id, schedule_id, status")\
        .in_("schedule_id", schedule_ids)\
        .eq("session_date", str(today))\
        .execute()

    sessions_by_schedule = {s["schedule_id"]: s for s in (sess_result.data or [])}

    best, priority = None, 99
    for sch in schedules:
        sess           = sessions_by_schedule.get(sch["schedule_id"])
        session_status = sess["status"] if sess else "not_created"

        if session_status == "cancelled":
            continue

        rank = {'ongoing': 1, 'dismissing': 1, 'scheduled': 2,
                'not_created': 2, 'completed': 3}.get(session_status, 4)
        if rank < priority:
            priority = rank
            best     = (sch["schedule_id"], sch["start_time"], sch["end_time"])
        if priority == 1:
            break

    return best

def get_or_create_session(schedule_id, today):
    result = supabase.table("lab_sessions")\
        .select("session_id, status")\
        .eq("schedule_id", schedule_id)\
        .eq("session_date", str(today))\
        .execute()

    if result.data:
        return result.data[0]["session_id"], result.data[0]["status"]

    insert_result = supabase.table("lab_sessions").insert({
        "schedule_id":  schedule_id,
        "session_date": str(today),
        "status":       "scheduled",
        "created_at":   datetime.datetime.now().isoformat()
    }).execute()

    return insert_result.data[0]["session_id"], "scheduled"

# ─────────────────────────────────────────────
# Shared state for threading
# ─────────────────────────────────────────────
frame_lock         = threading.Lock()
result_lock        = threading.Lock()
latest_frame       = None
recognition_result = {"locations": [], "labels": [], "colors": []}

# ─────────────────────────────────────────────
# Recognition worker thread
# ─────────────────────────────────────────────
def recognition_worker():
    global latest_frame
    skip = 0
    while True:
        with frame_lock:
            if latest_frame is None:
                continue
            frame = latest_frame.copy()

        skip += 1
        if skip % 5 != 0:
            continue

        small = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
        rgb   = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
        locs  = face_recognition.face_locations(rgb, model="hog")

        if not locs:
            with result_lock:
                recognition_result.update({"locations": [], "labels": [], "colors": []})
            continue

        encs = face_recognition.face_encodings(rgb, locs, num_jitters=1)
        new_locs, new_labels, new_colors = [], [], []

        for (top, right, bottom, left), enc in zip(locs, encs):
            top *= 4; right *= 4; bottom *= 4; left *= 4

            if known_encodings_np is None or len(known_encodings_np) == 0:
                new_locs.append((top, right, bottom, left))
                new_labels.append("No faces registered")
                new_colors.append((0, 0, 255))
                continue

            dists    = np.linalg.norm(known_encodings_np - enc, axis=1)
            best_idx = int(np.argmin(dists))
            best_d   = float(dists[best_idx])

            if best_d < 0.5:
                meta  = known_meta[best_idx]
                key   = f"{meta['role']}_{meta['id']}"
                last  = recently_seen.get(key)
                label = meta["name"]
                color = (0, 255, 0) if meta["role"] == "student" else (0, 255, 255)

                if not last or (datetime.datetime.now() - last).total_seconds() >= COOLDOWN_SECS:
                    recently_seen[key] = datetime.datetime.now()
                    thread_pool.submit(handle_recognized, meta,
                                       datetime.date.today(), datetime.datetime.now())
            else:
                label = "Unknown"
                color = (0, 0, 255)

            new_locs.append((top, right, bottom, left))
            new_labels.append(label)
            new_colors.append(color)

        with result_lock:
            recognition_result.update({"locations": new_locs,
                                        "labels":    new_labels,
                                        "colors":    new_colors})

threading.Thread(target=recognition_worker, daemon=True).start()

# ─────────────────────────────────────────────
# Handle recognized face
# ─────────────────────────────────────────────
def handle_recognized(meta, today, now):
    try:
        if meta["role"] == "professor":
            _handle_professor(meta, today, now)
        else:
            _handle_student(meta, today, now)
    except Exception as e:
        print(f"[ERROR] handle_recognized: {e}")
        import traceback; traceback.print_exc()

def _push(payload):
    attendee_queue.put(json.dumps(payload))
    print(f"  → PUSH [{payload['action']}] {payload['name']}")

# ─────────────────────────────────────────────
# Professor flow
# ─────────────────────────────────────────────
def _handle_professor(meta, today, now):
    pid, emp_id, name = meta["id"], meta["employee_id"], meta["name"]
    print(f"\n[PROF] {name} @ {now:%H:%M:%S} | today={today.strftime('%A')}")

    all_schedules = find_professor_schedule(pid, today)
    if not all_schedules:
        print(f"  → No active schedule on {today.strftime('%A')}")
        return _push({"role":"professor","professor_id":pid,"employee_id":emp_id,
                       "name":name,"action":"NO_SCHEDULE","session_id":None,
                       "error":"You have no class scheduled today.",
                       "timestamp":now.strftime("%Y-%m-%d %H:%M:%S")})

    closest_future_schedule = None
    closest_future_time     = None

    for sched in all_schedules:
        schedule_id    = sched["schedule_id"]
        session_id     = sched["session_id"]
        session_status = sched["session_status"]

        s = datetime.datetime.combine(today, datetime.time()) + datetime.timedelta(seconds=td_to_secs(sched["start_time"]))
        e = datetime.datetime.combine(today, datetime.time()) + datetime.timedelta(seconds=td_to_secs(sched["end_time"]))
        w = s - datetime.timedelta(minutes=30)
        void_cutoff = s + datetime.timedelta(minutes=PROFESSOR_START_WINDOW)

        print(f"  → Checking {sched['subject_code']} {s:%I:%M %p}–{e:%I:%M %p} | status={session_status}")

        if session_status == "cancelled":
            print(f"     → Cancelled, skipping")
            continue

        if now < w:
            mins = int((w - now).total_seconds() / 60)
            print(f"     → Too early ({mins} min until window opens)")
            if closest_future_time is None or s < closest_future_time:
                closest_future_schedule = sched
                closest_future_time     = s
            continue

        if now > e:
            print(f"     → Already ended")
            continue

        # Create session if not yet created
        if not session_id:
            insert_result = supabase.table("lab_sessions").insert({
                "schedule_id":  schedule_id,
                "session_date": str(today),
                "status":       "scheduled",
                "created_at":   datetime.datetime.now().isoformat()
            }).execute()
            session_id     = insert_result.data[0]["session_id"]
            session_status = "scheduled"

        # Auto-void if past start window
        if session_status == "scheduled" and now > void_cutoff:
            print(f"     → AUTO-VOID (past {PROFESSOR_START_WINDOW}-min window)")
            supabase.table("lab_sessions").update({
                "status":     "cancelled",
                "notes":      f"Auto-voided: professor did not start within {PROFESSOR_START_WINDOW} minutes",
                "updated_at": datetime.datetime.now().isoformat()
            }).eq("session_id", session_id).execute()
            print(f"     → Voided session {session_id}, continuing...")
            continue

        # Determine action
        if session_status in ("scheduled", "not_created"):
            action = "START"
        elif session_status == "ongoing":
            dismiss_result = supabase.table("lab_sessions")\
                .select("actual_dismiss_time")\
                .eq("session_id", session_id)\
                .execute()
            dismiss_row = dismiss_result.data[0] if dismiss_result.data else None

            if dismiss_row and dismiss_row.get("actual_dismiss_time") is not None:
                action = "END"
                print(f"     → STAY IN detected (dismissed at {dismiss_row['actual_dismiss_time']})")
            else:
                action = "DISMISS"
        elif session_status == "dismissing":
            action = "END"
        elif session_status == "completed":
            print(f"     → Already completed, checking next schedule...")
            continue
        else:
            action = "START"

        print(f"     ✓ Action={action} session_id={session_id}")
        return _push({"role":"professor","professor_id":pid,"employee_id":emp_id,
                       "name":name,"action":action,"session_id":session_id,"schedule":sched,
                       "timestamp":now.strftime("%Y-%m-%d %H:%M:%S")})

    # No valid schedule in current window
    print(f"  → No valid schedule in current window")
    if closest_future_schedule:
        window_open = closest_future_time - datetime.timedelta(minutes=30)
        mins_until  = int((window_open - now).total_seconds() / 60)
        return _push({"role":"professor","professor_id":pid,"employee_id":emp_id,
                       "name":name,"action":"TOO_EARLY","session_id":None,
                       "schedule":closest_future_schedule,
                       "error":f"Next class {closest_future_schedule['subject_code']} starts at {closest_future_time:%I:%M %p}. Window opens at {window_open:%I:%M %p} ({mins_until} min from now).",
                       "timestamp":now.strftime("%Y-%m-%d %H:%M:%S")})
    return _push({"role":"professor","professor_id":pid,"employee_id":emp_id,
                   "name":name,"action":"NO_VALID_SCHEDULE","session_id":None,
                   "error":"No valid schedule available. All classes have ended or been voided.",
                   "timestamp":now.strftime("%Y-%m-%d %H:%M:%S")})

# ─────────────────────────────────────────────
# Student flow
# ─────────────────────────────────────────────
def _handle_student(meta, today, now):
    sid, id_num, name = meta["id"], meta["id_number"], meta["name"]
    print(f"\n[STUDENT] {name} @ {now:%H:%M:%S} | today={today.strftime('%A')}")

    row = find_student_schedule(sid, today)
    if not row:
        print(f"  → No enrolled schedule on {today.strftime('%A')}")
        return _push({"role":"student","student_id":sid,"id_number":id_num,
                       "name":name,"action":"NOT_ENROLLED","session_id":None,
                       "error":"You are not enrolled in any subject with a schedule today.",
                       "timestamp":now.strftime("%Y-%m-%d %H:%M:%S")})

    schedule_id, start_td, end_td = row
    s = datetime.datetime.combine(today, datetime.time()) + datetime.timedelta(seconds=td_to_secs(start_td))
    e = datetime.datetime.combine(today, datetime.time()) + datetime.timedelta(seconds=td_to_secs(end_td))
    print(f"  → Schedule {s:%I:%M %p}–{e:%I:%M %p}")

    session_id, status = get_or_create_session(schedule_id, today)
    print(f"  → session_id={session_id} status={status}")

    if status == "scheduled":
        return _push({"role":"student","student_id":sid,"id_number":id_num,
                       "name":name,"action":"SESSION_NOT_STARTED","session_id":None,
                       "error":f"Professor has not started the session yet. Class starts at {s:%I:%M %p}.",
                       "timestamp":now.strftime("%Y-%m-%d %H:%M:%S")})

    if status == "completed":
        return _push({"role":"student","student_id":sid,"id_number":id_num,
                       "name":name,"action":"SESSION_ENDED","session_id":session_id,
                       "error":"The session has already ended.",
                       "timestamp":now.strftime("%Y-%m-%d %H:%M:%S")})

    # Late detection
    sess_result = supabase.table("lab_sessions")\
        .select("actual_start_time")\
        .eq("session_id", session_id)\
        .execute()
    sess_row = sess_result.data[0] if sess_result.data else None

    is_late      = False
    late_minutes = 0
    if sess_row and sess_row.get("actual_start_time") is not None:
        actual_start_secs = td_to_secs(sess_row["actual_start_time"])
        session_start_dt  = datetime.datetime.combine(today, datetime.time()) + datetime.timedelta(seconds=actual_start_secs)
        grace_cutoff      = session_start_dt + datetime.timedelta(minutes=STUDENT_GRACE_MINUTES)
        if now > grace_cutoff:
            is_late      = True
            late_minutes = int((now - session_start_dt).total_seconds() / 60)
            print(f"  → LATE by {late_minutes} min (grace cutoff was {grace_cutoff:%I:%M %p})")
        else:
            print(f"  → ON TIME (grace cutoff {grace_cutoff:%I:%M %p})")

    # Check attendance record
    att_result = supabase.table("lab_attendance")\
        .select("attendance_id, time_in, time_out")\
        .eq("session_id", session_id)\
        .eq("student_id", sid)\
        .execute()
    rec = att_result.data[0] if att_result.data else None

    if rec is None:
        action = "IN"
    elif rec["time_in"] and not rec["time_out"]:
        if status == "ongoing":
            print(f"  → CANNOT_TIME_OUT — session is 'ongoing', not yet dismissing")
            return _push({"role":"student","student_id":sid,"id_number":id_num,
                           "name":name,"action":"CANNOT_TIME_OUT","session_id":session_id,
                           "error":"Professor has not allowed dismissal yet. Please wait until the professor enables time-out.",
                           "timestamp":now.strftime("%Y-%m-%d %H:%M:%S")})
        action = "OUT"
    else:
        action = "COMPLETED"

    print(f"  → Attendance action: {action}")
    _push({"role":"student","student_id":sid,"id_number":id_num,
           "name":name,"action":action,"session_id":session_id,
           "is_late":is_late,"late_minutes":late_minutes,
           "timestamp":now.strftime("%Y-%m-%d %H:%M:%S")})

# ─────────────────────────────────────────────
# Camera + frame generator
# ─────────────────────────────────────────────
camera = cv2.VideoCapture(0)
camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)
camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
camera.set(cv2.CAP_PROP_FPS, 30)

def generate_frames():
    global latest_frame
    while True:
        ok, frame = camera.read()
        if not ok:
            break
        with frame_lock:
            latest_frame = frame.copy()
        with result_lock:
            locs   = list(recognition_result["locations"])
            labels = list(recognition_result["labels"])
            colors = list(recognition_result["colors"])
        for (top, right, bottom, left), label, color in zip(locs, labels, colors):
            cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
            cv2.rectangle(frame, (left, top-30), (right, top), color, cv2.FILLED)
            cv2.putText(frame, label, (left+5, top-8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
        ret, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
        yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buf.tobytes() + b'\r\n')

# ─────────────────────────────────────────────
# /confirm_attendance
# ─────────────────────────────────────────────
@app.route('/confirm_attendance', methods=['POST'])
def confirm_attendance():
    data       = request.get_json()
    student_id = data.get("student_id")
    session_id = data.get("session_id")
    action     = data.get("action")
    now        = datetime.datetime.now()

    no_db = {"NO_SCHEDULE","NOT_ENROLLED","SESSION_NOT_STARTED","SESSION_ENDED",
             "CANNOT_TIME_OUT","SESSION_CANCELLED","COMPLETED"}
    if action in no_db:
        return jsonify({"success": True, "message": data.get("error", action)})
    if not session_id:
        return jsonify({"success": False, "message": "Missing session_id"}), 400

    try:
        # Block time-out if session is still 'ongoing'
        if action == "OUT":
            sess_result = supabase.table("lab_sessions")\
                .select("status")\
                .eq("session_id", session_id)\
                .execute()
            if sess_result.data and sess_result.data[0]["status"] == "ongoing":
                return jsonify({"success": False,
                                "message": "❌ Time-out blocked — professor has not enabled dismissal yet."})

        att_result = supabase.table("lab_attendance")\
            .select("attendance_id, time_in, time_out")\
            .eq("session_id", session_id)\
            .eq("student_id", student_id)\
            .execute()
        rec = att_result.data[0] if att_result.data else None

        if rec is None:
            is_late      = data.get("is_late", False)
            late_minutes = int(data.get("late_minutes", 0))
            time_status  = "late" if is_late else "on-time"
            supabase.table("lab_attendance").insert({
                "session_id":                     session_id,
                "student_id":                     student_id,
                "time_in":                        now.isoformat(),
                "time_in_status":                 time_status,
                "late_minutes":                   late_minutes,
                "verified_by_facial_recognition": True,
                "created_at":                     now.isoformat()
            }).execute()
            msg = f"Time IN recorded ✅ — {'⚠ LATE by '+str(late_minutes)+' min' if is_late else 'On Time'}"
            return jsonify({"success": True, "message": msg})

        if rec["time_in"] and not rec["time_out"]:
            # FIX: use parse_dt() instead of fromisoformat() directly
            # to safely handle Supabase timestamptz strings on all Python versions
            time_in_dt = parse_dt(rec["time_in"])
            duration   = int((now - time_in_dt).total_seconds() / 60)
            supabase.table("lab_attendance").update({
                "time_out":         now.isoformat(),
                "duration_minutes": duration,
                "updated_at":       now.isoformat()
            }).eq("attendance_id", rec["attendance_id"]).execute()
            return jsonify({"success": True, "message": "Time OUT recorded ✅"})

        return jsonify({"success": True, "message": "Attendance already complete ✔"})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

# ─────────────────────────────────────────────
# /confirm_session
# ─────────────────────────────────────────────
@app.route('/confirm_session', methods=['POST'])
def confirm_session():
    data       = request.get_json()
    session_id = data.get("session_id")
    action     = data.get("action")
    now        = datetime.datetime.now()

    no_db = {"NO_SCHEDULE","TOO_EARLY","SCHEDULE_ENDED","SESSION_VOIDED",
             "SESSION_ALREADY_ENDED","NO_VALID_SCHEDULE"}
    if action in no_db:
        return jsonify({"success": True, "message": data.get("error", action)})
    if not session_id:
        return jsonify({"success": False, "message": "Missing session_id"}), 400

    try:
        if action == "START":
            supabase.table("lab_sessions").update({
                "status":            "ongoing",
                "actual_start_time": now.time().isoformat(),
                "updated_at":        now.isoformat()
            }).eq("session_id", session_id).execute()
            return jsonify({"success": True,
                            "message": f"✅ Session started — Students have {STUDENT_GRACE_MINUTES} min grace period"})

        if action == "DISMISS":
            supabase.table("lab_sessions").update({
                "status":              "dismissing",
                "actual_dismiss_time": now.time().isoformat(),
                "updated_at":          now.isoformat()
            }).eq("session_id", session_id).execute()
            return jsonify({"success": True,
                            "message": "✅ Dismissal mode ON — Students may now time out"})

        if action == "END":
            supabase.table("lab_sessions").update({
                "status":          "completed",
                "actual_end_time": now.time().isoformat(),
                "updated_at":      now.isoformat()
            }).eq("session_id", session_id).execute()

            # Auto time-out remaining students
            att_result = supabase.table("lab_attendance")\
                .select("attendance_id, time_in")\
                .eq("session_id", session_id)\
                .not_.is_("time_in", "null")\
                .is_("time_out", "null")\
                .execute()

            for att in (att_result.data or []):
                # FIX: use parse_dt() for safe timestamptz handling
                time_in_dt = parse_dt(att["time_in"])
                duration   = int((now - time_in_dt).total_seconds() / 60)
                supabase.table("lab_attendance").update({
                    "time_out":         now.isoformat(),
                    "duration_minutes": duration,
                    "updated_at":       now.isoformat()
                }).eq("attendance_id", att["attendance_id"]).execute()

            return jsonify({"success": True,
                            "message": "✅ Session ended — remaining students timed out"})

        return jsonify({"success": True, "message": "No action"})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

# ─────────────────────────────────────────────
# SSE + Video
# ─────────────────────────────────────────────
@app.route('/attendee_stream')
def attendee_stream():
    def stream():
        while True:
            yield f"data: {attendee_queue.get()}\n\n"
    return Response(stream(), mimetype="text/event-stream")

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

# ─────────────────────────────────────────────
# /shutdown
# Mirrors face_capture.py pattern.
# Called by takeAttendance.js stopEngine() and the Stop Engine button.
# ─────────────────────────────────────────────
@app.route('/shutdown', methods=['POST'])
def shutdown():
    print("--- Shutdown request received: Cleaning up ---")
    try:
        # 1. Release the camera so other apps (or the next session) can use it
        if camera.isOpened():
            camera.release()
            print("✓ Camera hardware released")
        
        # 2. Kill the thread pool
        thread_pool.shutdown(wait=False)
        
        # 3. Kill the process
        print("✓ Terminating process...")
        os.kill(os.getpid(), signal.SIGTERM)
        return jsonify({"success": True})
    except Exception as e:
        print(f"Error during shutdown: {e}")
        return jsonify({"success": False, "error": str(e)})

# ─────────────────────────────────────────────
# Scanner UI (unchanged)
# ─────────────────────────────────────────────
SCANNER_HTML = r"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Lab Attendance Scanner</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#0a0e1a;color:#fff;
     min-height:100vh;display:flex;flex-direction:column;align-items:center;
     justify-content:center;gap:14px;padding:20px}
h2{color:#22c55e;font-size:1.25rem;letter-spacing:1px;display:flex;align-items:center;gap:8px}
#pulse{width:10px;height:10px;border-radius:50%;background:#22c55e;
       animation:blink 1.2s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
#videoWrap{border:3px solid #166534;border-radius:14px;overflow:hidden;
           box-shadow:0 0 40px rgba(34,197,94,.25)}
#videoWrap img{display:block;width:640px;max-width:93vw}
#overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);
         z-index:100;justify-content:center;align-items:center}
#overlay.on{display:flex}
#card{background:#161b2e;border-radius:18px;padding:30px 28px 26px;
      max-width:400px;width:92%;border:2px solid #1e3a5f;text-align:center;
      box-shadow:0 16px 48px rgba(0,0,0,.7);
      animation:pop .28s cubic-bezier(.34,1.56,.64,1)}
@keyframes pop{from{opacity:0;transform:scale(.82) translateY(18px)}
               to  {opacity:1;transform:scale(1)  translateY(0)}}
#card.green{border-color:#166534}
#card.amber{border-color:#92400e}
#card.red  {border-color:#7f1d1d}
#card.blue {border-color:#1e3a5f}
#card.orange{border-color:#c2410c}
.avatar{width:60px;height:60px;border-radius:50%;margin:0 auto 14px;
        display:flex;align-items:center;justify-content:center;font-size:26px}
.av-student{background:#166534}.av-prof{background:#1e3a5f}
.av-warn{background:#78350f}.av-err{background:#7f1d1d}
.av-dismiss{background:#92400e}
#cardName{font-size:1.15rem;font-weight:700;margin-bottom:3px;color:#f1f5f9}
#cardRole{font-size:.82rem;color:#94a3b8;margin-bottom:14px}
#cardMsg{padding:11px 14px;border-radius:9px;font-size:.9rem;line-height:1.5;margin-bottom:18px}
.ms{background:#14532d;color:#bbf7d0}.mw{background:#78350f;color:#fde68a}
.me{background:#7f1d1d;color:#fca5a5}.mi{background:#1e3a5f;color:#bae6fd}
.mo{background:#7c2d12;color:#fed7aa}
.btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.btn{padding:10px 24px;border-radius:8px;border:none;font-size:13px;
     font-weight:700;cursor:pointer;transition:all .18s}
#btnOk{background:#166534;color:#fff}
#btnOk:hover{background:#14532d;transform:translateY(-1px)}
#btnOk.dismiss-btn{background:#b45309;color:#fff}
#btnOk.dismiss-btn:hover{background:#92400e}
#btnOk.end-btn{background:#991b1b;color:#fff}
#btnOk.end-btn:hover{background:#7f1d1d}
#btnX{background:#2d3748;color:#cbd5e1}
#btnX:hover{background:#4a5568}
#bar{font-size:.78rem;color:#4ade80;letter-spacing:.4px}
#countdown{font-size:.75rem;color:#64748b;margin-top:6px}
</style>
</head>
<body>
<h2><span id="pulse"></span>Lab Attendance — Face Scanner</h2>
<div id="videoWrap">
  <img src="/video_feed" alt="Live feed">
</div>
<div id="bar">● Scanning...</div>
<div id="overlay">
  <div id="card">
    <div id="av" class="avatar av-student">👤</div>
    <div id="cardName"></div>
    <div id="cardRole"></div>
    <div id="cardMsg" class="ms"></div>
    <div class="btns">
      <button id="btnOk" class="btn" onclick="doConfirm()">✅ Confirm</button>
      <button id="btnX"  class="btn" onclick="dismiss()">Dismiss</button>
    </div>
    <div id="countdown"></div>
  </div>
</div>
<script>
let payload=null,timer=null,cd=null,remaining=0;
const ERR_ACTIONS=new Set(['NO_SCHEDULE','NOT_ENROLLED','SESSION_NOT_STARTED','SESSION_ENDED',
  'TOO_EARLY','SCHEDULE_ENDED','COMPLETED','SESSION_VOIDED',
  'SESSION_ALREADY_ENDED','NO_VALID_SCHEDULE','CANNOT_TIME_OUT','SESSION_CANCELLED']);
const es=new EventSource('/attendee_stream');
es.onmessage=e=>show(JSON.parse(e.data));
function show(data){
  clearInterval(cd);clearTimeout(timer);
  payload=data;
  const action=data.action||'',role=data.role||'student',isErr=ERR_ACTIONS.has(action);
  const av=document.getElementById('av');
  if(action==='DISMISS'){av.className='avatar av-dismiss';av.textContent='🚪';}
  else if(action==='END'){av.className='avatar av-err';av.textContent='⏹';}
  else if(isErr&&action==='SESSION_NOT_STARTED'){av.className='avatar av-warn';av.textContent='⏳';}
  else if(isErr&&action==='CANNOT_TIME_OUT'){av.className='avatar av-warn';av.textContent='🚫';}
  else if(isErr){av.className='avatar av-err';av.textContent='⚠️';}
  else{av.className='avatar '+(role==='professor'?'av-prof':'av-student');
       av.textContent=role==='professor'?'👨‍🏫':'🎓';}
  document.getElementById('cardName').textContent=data.name||'';
  document.getElementById('cardRole').textContent=role==='professor'?'Professor':'Student';
  const card=document.getElementById('card');
  if(action==='DISMISS')card.className='orange';
  else if(action==='END')card.className='amber';
  else if(action==='SESSION_NOT_STARTED'||action==='CANNOT_TIME_OUT')card.className='amber';
  else if(isErr)card.className='red';
  else card.className='green';
  const msgEl=document.getElementById('cardMsg');
  card.dataset.isLate=data.is_late?'1':'0';
  card.dataset.lateMinutes=data.late_minutes||0;
  const{txt,cls}=resolveMsg(data,isErr);
  msgEl.textContent=txt;msgEl.className=cls;
  const ok=document.getElementById('btnOk');
  if(isErr){ok.style.display='none';}
  else{ok.style.display='inline-block';ok.textContent=label(action);
       ok.className='btn'+(action==='DISMISS'?' dismiss-btn':action==='END'?' end-btn':'');}
  document.getElementById('overlay').classList.add('on');
  remaining=15;updateCD();
  cd=setInterval(()=>{remaining--;updateCD();if(remaining<=0)dismiss();},1000);
  timer=setTimeout(dismiss,15000);
}
function updateCD(){
  document.getElementById('countdown').textContent=remaining>0?`Auto-dismiss in ${remaining}s`:'';
}
function resolveMsg(d,isErr){
  d.is_late=d.is_late||(document.getElementById('card').dataset.isLate==='1');
  d.late_minutes=d.late_minutes||document.getElementById('card').dataset.lateMinutes||0;
  if(d.error)return{txt:d.error,
    cls:(d.action==='SESSION_NOT_STARTED'||d.action==='CANNOT_TIME_OUT')?'mw':(isErr?'me':'mw')};
  const map={
    IN:{txt:d.is_late?`⚠ You are LATE by ${d.late_minutes} min. Tap Confirm to record TIME IN.`
                     :'Tap Confirm to record TIME IN.',cls:d.is_late?'mw':'ms'},
    OUT:{txt:'Tap Confirm to record TIME OUT.',cls:'ms'},
    START:{txt:'Tap Confirm to START the session. Students can then time in.',cls:'ms'},
    DISMISS:{txt:'🚪 Allow students to TIME OUT and leave the lab. New time-ins are still allowed.',cls:'mo'},
    END:{txt:'⏹ End the session completely. Remaining students will be auto timed-out.',cls:'mw'},
    COMPLETED:{txt:'Attendance already complete for this session.',cls:'mi'},
  };
  return map[d.action]||{txt:d.action,cls:'mi'};
}
function label(a){
  return{IN:'✅ Time IN',OUT:'✅ Time OUT',START:'▶ Start Session',
         DISMISS:'🚪 Allow Time Out',END:'⏹ End Session'}[a]||'✅ Confirm';
}
async function doConfirm(){
  if(!payload)return;
  const d=payload;dismiss();
  const ep=d.role==='professor'?'/confirm_session':'/confirm_attendance';
  try{
    const r=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
    const json=await r.json();
    const bar=document.getElementById('bar');
    bar.textContent='● '+(json.message||'Done');
    setTimeout(()=>{bar.textContent='● Scanning...';},3000);
  }catch(e){console.error(e);}
}
function dismiss(){
  clearInterval(cd);clearTimeout(timer);
  document.getElementById('overlay').classList.remove('on');
  payload=null;
}
</script>
</body>
</html>"""

@app.route('/scanner')
def scanner():
    return SCANNER_HTML

@app.route('/')
def index():
    return ('<h2 style="font-family:sans-serif;padding:20px">Lab Attendance ✓ &nbsp;'
            '<a href="/scanner">Open Scanner →</a></h2>')

if __name__ == '__main__':
    print("=" * 60)
    print("Lab Attendance — Supabase Edition ✓")
    print(f"Encodings loaded  : {len(known_encodings)}")
    print(f"Grace period      : {STUDENT_GRACE_MINUTES} min after professor starts")
    print("Scanner UI        : http://127.0.0.1:5000/scanner")
    print("=" * 60)
    app.run(host='127.0.0.1', port=5000, debug=False, threaded=True, use_reloader=False)