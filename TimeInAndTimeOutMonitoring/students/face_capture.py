import cv2
import os
import time
import face_recognition
from flask import Flask, Response, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
import threading
import sys
import signal

# ==========================================
# CONFIGURATION
# ==========================================
SUPABASE_URL = "https://wjyoruvcyjnwsimeqrgl.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqeW9ydXZjeWpud3NpbWVxcmdsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc0MjExOCwiZXhwIjoyMDg3MzE4MTE4fQ.gWuZCPZeJmPy_hskmFkzNc9dHlGHKXDHDqyFNBciKKc"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
BUCKET_NAME = "facial_data"

app = Flask(__name__)
CORS(app)

cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

session = {
    "id_number": None,
    "first_name": "",
    "last_name": "",
    "role": "student",   # ← Add this
    "count": 0,
    "active": False,
    "syncing": False,
    "completed": False,  # New flag
    "paths": [],
    "last_t": 0,
    "done_t": 0          # Timer for the final message
}

def upload_to_supabase():
    global session
    role = session.get("role", "student")

    # ← Dynamically set folder and table based on role
    if role == "professor":
        cloud_folder = f"professors/professor_{session['id_number']}"
        table_name   = "professors"
        id_column    = "employee_id"
    else:
        cloud_folder = f"students/student_{session['id_number']}"
        table_name   = "students"
        id_column    = "id_number"

    print(f"--- Syncing {session['first_name']} as {role} ---")
    valid_count = 0
    current_paths = list(session["paths"])

    for p in current_paths:
        if not os.path.exists(p): continue
        filename = os.path.basename(p)
        try:
            with open(p, 'rb') as f:
                supabase.storage.from_(BUCKET_NAME).upload(
                    file=f, path=f"{cloud_folder}/{filename}",
                    file_options={"content-type": "image/jpeg", "upsert": "true"}
                )
            valid_count += 1
            os.remove(p)
        except Exception as e:
            print(f"Upload Error: {e}")

    if valid_count >= 3:
        try:
            supabase.table(table_name).update({"facial_dataset_path": cloud_folder}).eq(id_column, session["id_number"]).execute()
            print("--- Registration Successful ---")
            session["completed"] = True
            session["done_t"] = time.time()
        except Exception as e:
            print(f"DB Update Error: {e}")

    session["syncing"] = False
    session["count"] = 0
    session["paths"] = []

def generate_frames():
    while True:
        success, frame = cap.read()
        if not success: break

        display = frame.copy()
        h, w = frame.shape[:2]

        # ─── CASE 1: REGISTRATION COMPLETE (Final Message) ───
        if session["completed"]:
            # Show for 3 seconds
            if time.time() - session["done_t"] < 3.0:
                overlay = display.copy()
                cv2.rectangle(overlay, (0, 0), (w, h), (0, 150, 0), -1) # Green tint
                cv2.addWeighted(overlay, 0.3, display, 0.7, 0, display)
                
                cv2.putText(display, "REGISTRATION COMPLETE!", (w//2 - 180, h//2),
                            cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 3)
                cv2.putText(display, "Database Updated Successfully", (w//2 - 160, h//2 + 40),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 255, 200), 2)
            else:
                session["completed"] = False
                session["active"] = False

        # ─── CASE 2: UPLOADING TO CLOUD ───
        elif session["syncing"]:
            overlay = display.copy()
            cv2.rectangle(overlay, (0, 0), (w, h), (0, 0, 0), -1)
            cv2.addWeighted(overlay, 0.4, display, 0.6, 0, display)
            
            cv2.putText(display, "SYNCING TO CLOUD...", (w//2 - 140, h//2),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
            
            # Animated Bar
            bar_w = int((time.time() * 200) % 200)
            cv2.rectangle(display, (w//2 - 100, h//2 + 30), (w//2 - 100 + bar_w, h//2 + 40), (0, 255, 0), -1)

        # ─── CASE 3: ACTIVE CAPTURING ───
        elif session["active"]:
            small = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
            rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
            locs = face_recognition.face_locations(rgb, model="hog")
            locs = [(t*4, r*4, b*4, l*4) for (t, r, b, l) in locs]

            if session["count"] < 5:
                if locs:
                    for (t, r, b, l) in locs:
                        cv2.rectangle(display, (l, t), (r, b), (0, 255, 0), 3)
                        cv2.putText(display, f"PHOTO {session['count']+1}/5", (l, t-10),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

                        if time.time() - session.get("last_t", 0) > 1.8:
                            for _ in range(20): cap.grab()
                            _, fresh_frame = cap.read()
                            p = f"{session['count'] + 1}.jpg"
                            cv2.imwrite(p, fresh_frame)
                            session["paths"].append(p)
                            session["count"] += 1
                            session["last_t"] = time.time()
                else:
                    cv2.putText(display, "CENTER YOUR FACE", (50, 50),
                                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

                # Progress bar
                progress_w = int((session["count"] / 5) * (w - 40))
                cv2.rectangle(display, (20, h-40), (20+progress_w, h-20), (0, 255, 0), -1)
                cv2.rectangle(display, (20, h-40), (w-20, h-20), (255, 255, 255), 2)

            elif session["count"] >= 5:
                session["syncing"] = True
                threading.Thread(target=upload_to_supabase).start()

        _, buffer = cv2.imencode('.jpg', display)
        yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

@app.route('/start_registration', methods=['POST'])
def start_reg():
    global session
    session['active'] = False 
    session['completed'] = False # Reset flag
    for i in range(1, 6):
        if os.path.exists(f"{i}.jpg"):
            try: os.remove(f"{i}.jpg")
            except: pass

    data = request.json
    session.update({
        "id_number": data['id_number'],
        "first_name": data['firstName'],
        "last_name": data['lastName'],
        "role": data.get('role', 'student'),  # ← Add this
        "count": 0,
        "active": True,
        "paths": [],
        "last_t": time.time() + 2.0 
    })
    return jsonify({"status": "ready"})

@app.route('/status')
def status(): 
    return jsonify(session)

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/shutdown', methods=['POST'])
def shutdown():
    print("--- Engine shutting down ---")
    os.kill(os.getpid(), signal.SIGTERM)
    return jsonify({"status": "shutting down"})

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, threaded=True)