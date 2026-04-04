import cv2
import os
import time
import face_recognition
import numpy as np
import mediapipe as mp 
import mediapipe as mp

mp_selfie_segmentation = mp.solutions.selfie_segmentation
from flask import Flask, Response, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
import threading
import sys
import signal
from dotenv import load_dotenv 

# Load the hidden variables from the .env file
load_dotenv()

# ==========================================
# CONFIGURATION
# ==========================================
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase credentials! Please check your .env file.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
BUCKET_NAME = "facial_data"

app = Flask(__name__)
CORS(app)

cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

# Initialize MediaPipe Selfie Segmentation (Runs once globally for speed)
mp_selfie_segmentation = mp.solutions.selfie_segmentation
segmentor = mp_selfie_segmentation.SelfieSegmentation(model_selection=0)

session = {
    "id_number": None,
    "first_name": "",
    "last_name": "",
    "role": "student",   
    "count": 0,
    "active": False,
    "syncing": False,
    "completed": False,  
    "paths": [],
    "last_t": 0,
    "done_t": 0          
}

def upload_to_supabase():
    global session
    role = session.get("role", "student")

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
                    file_options={"content-type": "image/png", "upsert": "true"}
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
    frame_count = 0        
    process_every_n = 3    
    last_locs = []         

    while True:
        success, frame = cap.read()
        if not success: break

        display = frame.copy()
        h, w = frame.shape[:2]

        if session["completed"]:
            if time.time() - session["done_t"] < 3.0:
                overlay = display.copy()
                cv2.rectangle(overlay, (0, 0), (w, h), (0, 150, 0), -1) 
                cv2.addWeighted(overlay, 0.3, display, 0.7, 0, display)
                
                cv2.putText(display, "REGISTRATION COMPLETE!", (w//2 - 180, h//2),
                            cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 3)
                cv2.putText(display, "Database Updated Successfully", (w//2 - 160, h//2 + 40),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 255, 200), 2)
            else:
                session["completed"] = False
                session["active"] = False

        elif session["syncing"]:
            overlay = display.copy()
            cv2.rectangle(overlay, (0, 0), (w, h), (0, 0, 0), -1)
            cv2.addWeighted(overlay, 0.4, display, 0.6, 0, display)
            
            cv2.putText(display, "SYNCING TO CLOUD...", (w//2 - 140, h//2),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
            
            bar_w = int((time.time() * 200) % 200)
            cv2.rectangle(display, (w//2 - 100, h//2 + 30), (w//2 - 100 + bar_w, h//2 + 40), (0, 255, 0), -1)

        elif session["active"]:
            if session["count"] < 5:
                
                if frame_count % process_every_n == 0:
                    small = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
                    rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
                    locs = face_recognition.face_locations(rgb, model="hog")
                    last_locs = [(t*4, r*4, b*4, l*4) for (t, r, b, l) in locs]
                
                frame_count += 1

                cx, cy = w // 2, h // 2
                rx, ry = int(w * 0.22), int(h * 0.38) 
                axes = (rx, ry)
                
                is_aligned = False
                aligned_face = None

                if last_locs:
                    for (t, r, b, l) in last_locs:
                        face_cx = (l + r) // 2
                        face_cy = (t + b) // 2
                        
                        if rx > 0 and ry > 0:
                            normalized_dist = ((face_cx - cx)**2 / (rx**2)) + ((face_cy - cy)**2 / (ry**2))
                            if normalized_dist <= 0.85:  
                                is_aligned = True
                                aligned_face = (t, r, b, l)
                                break
                
                guide_color = (0, 255, 0) if is_aligned else (255, 255, 255)
                cv2.ellipse(display, (cx, cy), axes, 0, 0, 360, guide_color, 2)
                
                if not is_aligned:
                    cv2.putText(display, "Align face within the oval", (cx - 130, cy - ry - 20), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                    
                    for (t, r, b, l) in last_locs:
                        cv2.rectangle(display, (l, t), (r, b), (0, 0, 255), 2)

                # --- CAPTURE LOGIC (AI BACKGROUND REMOVAL) ---
                else:
                    t, r, b, l = aligned_face
                    cv2.rectangle(display, (l, t), (r, b), (0, 255, 0), 2)
                    cv2.putText(display, f"PHOTO {session['count']+1}/5", (l, t-10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

                    if time.time() - session.get("last_t", 0) > 1.5:
                        for _ in range(3): cap.grab() 
                        
                        _, fresh_frame = cap.read()
                        
                        crop_t = max(0, cy - ry)
                        crop_b = min(h, cy + ry)
                        crop_l = max(0, cx - rx)
                        crop_r = min(w, cx + rx)
                        
                        cropped_rect = fresh_frame[crop_t:crop_b, crop_l:crop_r]
                        
                        if cropped_rect.size != 0:
                            # 1. Ask MediaPipe where the person is
                            rgb_crop = cv2.cvtColor(cropped_rect, cv2.COLOR_BGR2RGB)
                            result = segmentor.process(rgb_crop)
                            
                            # 2. Create a mask: White where the person is, Black for background
                            person_mask = (result.segmentation_mask > 0.5).astype(np.uint8) * 255
                            
                            # 3. Create the Oval mask (so the person is still trimmed to the oval shape)
                            oval_mask = np.zeros(cropped_rect.shape[:2], dtype=np.uint8)
                            local_cx = cropped_rect.shape[1] // 2
                            local_cy = cropped_rect.shape[0] // 2
                            cv2.ellipse(oval_mask, (local_cx, local_cy), (rx, ry), 0, 0, 360, 255, -1)
                            
                            # 4. Combine the masks: Must be inside the oval AND be the person
                            final_mask = cv2.bitwise_and(person_mask, oval_mask)
                            
                            # 5. Apply the transparent alpha mask to the image
                            cropped_bgra = cv2.cvtColor(cropped_rect, cv2.COLOR_BGR2BGRA)
                            cropped_bgra[:, :, 3] = final_mask  
                            
                            p = f"{session['count'] + 1}.png"
                            cv2.imwrite(p, cropped_bgra)
                            
                            session["paths"].append(p)
                            session["count"] += 1
                            session["last_t"] = time.time()

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
    session['completed'] = False 
    
    for i in range(1, 6):
        for ext in [".jpg", ".png"]:
            if os.path.exists(f"{i}{ext}"):
                try: os.remove(f"{i}{ext}")
                except: pass

    data = request.json
    session.update({
        "id_number": data['id_number'],
        "first_name": data['firstName'],
        "last_name": data['lastName'],
        "role": data.get('role', 'student'),
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