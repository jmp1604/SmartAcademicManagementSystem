/* ============================================================
   takeAttendance.js
   Path: TimeInAndTimeOutMonitoring/resc/js/takeAttendance.js

   Pattern applied (mirrors accountRegistration.js):
   ─ start_takeattendance.php  → waitForFlask() + direct video feed
   ─ stop_takeattendance.php   → fetch('http://127.0.0.1:5000/shutdown')
   ─ Engine status polling     → shows/hides Stop Engine button
   ============================================================ */

// ══════════════════════════════════════════════════
// Real-time clock
// ══════════════════════════════════════════════════
function updateTime() {
    const now = new Date();
    document.getElementById('timestamp').textContent =
        now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
        + ' · ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateTime, 1000);
updateTime();

// ══════════════════════════════════════════════════
// Output box helper
// ══════════════════════════════════════════════════
function setOutput(type, icon, msg) {
    const box = document.getElementById('outputBox');
    box.className = 'output-box show ' + type;
    box.querySelector('i').className = 'fa-solid ' + icon;
    document.getElementById('outputText').innerHTML = msg;
}

// ══════════════════════════════════════════════════
// Engine status polling
// Mirrors accountRegistration.js: polls every 3s,
// shows/hides the Stop Engine button based on Flask availability.
// ══════════════════════════════════════════════════
const stopEngineBtn = document.getElementById('stopEngineBtn');

setInterval(async () => {
    try {
        const res = await fetch('http://127.0.0.1:5000/video_feed', { method: 'HEAD' });
        if (stopEngineBtn) stopEngineBtn.style.display = res.ok ? 'inline-flex' : 'none';
    } catch (_) {
        if (stopEngineBtn) stopEngineBtn.style.display = 'none';
    }
}, 3000);

async function stopEngine() {
    const confirmed = confirm('Are you sure you want to stop the attendance engine?');
    if (!confirmed) return;

    try {
        await fetch('http://127.0.0.1:5000/shutdown', { method: 'POST' });
    } catch (_) {
        // Fetch error is expected — server shuts down mid-response
    }

    if (stopEngineBtn) stopEngineBtn.style.display = 'none';

    // Reset UI to idle state
    videoStream.src = '';
    videoWrap.style.display  = 'none';
    startBtn.style.display   = 'inline-flex';
    startBtn.disabled        = false;
    stopBtn.style.display    = 'none';
    sessionState.textContent = 'Idle';
    stripStatus.innerHTML    = '<div class="pulse"></div>Ready';
    setOutput('warn', 'fa-circle-info', 'Engine stopped. Run START_ENGINE.bat to restart.');
}

// ══════════════════════════════════════════════════
// waitForFlask
// Mirrors accountRegistration.js: polls /video_feed HEAD
// until Flask responds, then resolves.
// ══════════════════════════════════════════════════
async function waitForFlask(retries = 15, delayMs = 800) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch('http://127.0.0.1:5000/video_feed', { method: 'HEAD' });
            if (res.ok || res.status === 200) return true;
        } catch (_) {
            // Still booting, keep waiting
        }
        await new Promise(r => setTimeout(r, delayMs));
    }
    throw new Error('Engine did not respond after ' + retries + ' attempts. Make sure you ran START_ENGINE.bat');
}

// ══════════════════════════════════════════════════
// Start / Stop session
// ══════════════════════════════════════════════════
const startBtn     = document.getElementById('startBtn');
const stopBtn      = document.getElementById('stopBtn');
const videoWrap    = document.getElementById('videoWrap');
const videoStream  = document.getElementById('videoStream');
const stripStatus  = document.getElementById('stripStatus');
const sessionState = document.getElementById('sessionState');

startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    sessionState.textContent = 'Initializing…';
    setOutput('info', 'fa-solid fa-microchip fa-spin', '<span class="spin"></span> Starting Facial Recognition Engine…');

    try {
        // STEP 1: Launch Python automatically via PHP
        await fetch('http://localhost/INTEG%20SYSTEM/SmartAcademicManagementSystem/TimeInAndTimeOutMonitoring/students/trigger_attendance.php', {
            method: 'POST'
        });

        // STEP 2: Wait for Flask to boot up
        // flash_attendance.py takes a few seconds to load faces from Supabase
        setOutput('info', 'fa-solid fa-circle-notch fa-spin', '<span class="spin"></span> Downloading face database from Supabase…');
        await waitForFlask(20, 1000); // Increased retries because loading faces is slow

        // STEP 3: Connect the stream
        videoWrap.style.display  = 'block';
        videoStream.src = 'http://127.0.0.1:5000/video_feed?t=' + Date.now();
        
        startBtn.style.display   = 'none';
        stopBtn.style.display    = 'inline-flex';
        sessionState.textContent = 'Active';
        stripStatus.innerHTML    = '<div class="pulse"></div>Live';
        
        if (stopEngineBtn) stopEngineBtn.style.display = 'inline-flex';
        
        setOutput('success', 'fa-solid fa-circle-check', 'Attendance engine is live! Ready for scans.');

    } catch (err) {
        setOutput('error', 'fa-solid fa-circle-exclamation', '❌ ' + err.message);
        sessionState.textContent = 'Idle';
        startBtn.disabled = false;
    }
});

stopBtn.addEventListener('click', () => {
    if (!confirm('Are you sure you want to stop the attendance session?')) return;

    setOutput('info', 'fa-circle-notch fa-spin', '<span class="spin"></span> Stopping session…');

    // Mirrors accountRegistration stopEngine — direct Flask shutdown call
    fetch('http://127.0.0.1:5000/shutdown', { method: 'POST' })
        .catch(() => {
            // Expected — server shuts down mid-response
        })
        .finally(() => {
            videoStream.src          = '';
            videoWrap.style.display  = 'none';
            startBtn.style.display   = 'inline-flex';
            startBtn.disabled        = false;
            stopBtn.style.display    = 'none';
            sessionState.textContent = 'Idle';
            stripStatus.innerHTML    = '<div class="pulse"></div>Ready';
            if (stopEngineBtn) stopEngineBtn.style.display = 'none';
            setOutput('warn', 'fa-circle-info', 'Session stopped. Run START_ENGINE.bat to start a new session.');
        });
});

// ══════════════════════════════════════════════════
// Notification helpers
// ══════════════════════════════════════════════════
const overlay           = document.getElementById('notifOverlay');
const notifIcon         = document.getElementById('notifIcon');
const notifTitle        = document.getElementById('notifTitle');
const notifMsg          = document.getElementById('notifMsg');
const notifBtns         = document.getElementById('notifBtns');
const lateBadge         = document.getElementById('lateBadge');
const dismissInfo       = document.getElementById('dismissInfo');
const cannotTimeOutInfo = document.getElementById('cannotTimeOutInfo');
const notifCountdown    = document.getElementById('notifCountdown');
const toast             = document.getElementById('toast');

let autoDismissTimer  = null;
let countdownInterval = null;

function showToast(msg, colorClass, duration = 4000) {
    toast.textContent   = msg;
    toast.className     = colorClass;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, duration);
}

function showNotif({ icon, title, msg, lateTxt, dismissTxt, cannotTimeOutTxt, buttons, autoDismiss = 15 }) {
    clearTimeout(autoDismissTimer);
    clearInterval(countdownInterval);

    notifIcon.textContent  = icon;
    notifTitle.textContent = title;
    notifMsg.textContent   = msg;

    if (lateTxt) { lateBadge.innerHTML = `⚠️ ${lateTxt}`; lateBadge.classList.add('show'); }
    else         { lateBadge.classList.remove('show'); lateBadge.innerHTML = ''; }

    if (dismissTxt) { dismissInfo.innerHTML = dismissTxt; dismissInfo.classList.add('show'); }
    else            { dismissInfo.classList.remove('show'); dismissInfo.innerHTML = ''; }

    if (cannotTimeOutTxt) { cannotTimeOutInfo.innerHTML = cannotTimeOutTxt; cannotTimeOutInfo.classList.add('show'); }
    else                  { cannotTimeOutInfo.classList.remove('show'); cannotTimeOutInfo.innerHTML = ''; }

    notifBtns.innerHTML = '';
    buttons.forEach(btn => {
        const el       = document.createElement('button');
        el.className   = 'notif-confirm-btn ' + btn.color;
        el.textContent = btn.label;
        el.onclick     = () => { closeNotif(); if (btn.action) btn.action(); };
        notifBtns.appendChild(el);
    });

    let remaining = autoDismiss;
    notifCountdown.textContent = `Auto-dismiss in ${remaining}s`;
    countdownInterval = setInterval(() => {
        remaining--;
        notifCountdown.textContent = remaining > 0 ? `Auto-dismiss in ${remaining}s` : '';
        if (remaining <= 0) clearInterval(countdownInterval);
    }, 1000);
    autoDismissTimer = setTimeout(closeNotif, autoDismiss * 1000);

    overlay.classList.add('show');
}

function closeNotif() {
    clearTimeout(autoDismissTimer);
    clearInterval(countdownInterval);
    overlay.classList.remove('show');
    notifCountdown.textContent = '';
}

overlay.addEventListener('click', e => { if (e.target === overlay) closeNotif(); });

// ══════════════════════════════════════════════════
// SSE — listen to face recognition events
// ══════════════════════════════════════════════════
if (window.EventSource) {
    const src  = new EventSource('http://127.0.0.1:5000/attendee_stream');
    src.onmessage = function (e) {
        try {
            const d = JSON.parse(e.data);
            d.role === 'student' ? handleStudentEvent(d) : handleProfessorEvent(d);
        } catch (err) { console.error('SSE parse error:', err, e.data); }
    };
    src.onerror = () => console.warn('SSE connection error — is face_recognize_lab.py running?');
}

// ══════════════════════════════════════════════════
// STUDENT events
// ══════════════════════════════════════════════════
function handleStudentEvent(d) {
    const name = d.name || 'Student';
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

   switch (d.action) {
    case 'NOT_ENROLLED':
        showNotif({ icon: '📋', title: 'Not Enrolled',
            msg: d.error || 'You are not enrolled in any subject with a schedule today.',
            buttons: [{ label: 'OK', color: 'gray', action: null }] });
        break;

   case 'SESSION_NOT_STARTED':
    
    showNotif({ icon: '⏳', title: 'Session Not Started Yet',
        msg: d.error || 'Your professor has not started the session yet. Please wait.',
        buttons: [{ label: 'OK', color: 'orange', action: null }] });
    break;

       case 'SESSION_CANCELLED':
    showNotif({ icon: '🚫', title: 'Session Cancelled',
        msg: d.error || 'This session has been cancelled or voided.',
        buttons: [{ label: 'OK', color: 'gray', action: null }] });
    break;

case 'SESSION_VOIDED':
    showNotif({ icon: '⏰', title: 'Session Voided',
        msg: d.error || `Professor did not start within the required time window. Session has been voided.`,
        buttons: [{ label: 'OK', color: 'orange', action: null }] });
    break;

        case 'SESSION_ENDED':
            showNotif({ icon: '🔒', title: 'Session Already Ended',
                msg: d.error || 'The session has already ended.',
                buttons: [{ label: 'OK', color: 'gray', action: null }] });
            break;

        case 'COMPLETED':
            showNotif({ icon: '✅', title: 'Attendance Complete',
                msg: `${name}\nYou have already completed your attendance for this session.`,
                buttons: [{ label: 'OK', color: 'gray', action: null }] });
            break;

        case 'CANNOT_TIME_OUT':
            showNotif({ icon: '🔐', title: 'Cannot Time Out Yet', msg: name,
                cannotTimeOutTxt:
                    `<strong>⏳ Professor has not allowed dismissal yet.</strong><br><br>` +
                    `Please wait for your professor to scan their face to allow students to leave.`,
                buttons: [{ label: 'OK', color: 'gray', action: null }], autoDismiss: 10 });
            break;

        case 'IN':
            showNotif({ icon: d.is_late ? '⚠️' : '🟢',
                title: d.is_late ? 'Time IN — Late' : 'Time IN',
                msg: `${name}\nTime: ${time}`,
                lateTxt: d.is_late ? `You are LATE by ${d.late_minutes} minute${d.late_minutes !== 1 ? 's' : ''}` : null,
                buttons: [
                    { label: '✅ Confirm Time IN', color: d.is_late ? 'orange' : 'green', action: () => confirmStudent(d) },
                    { label: 'Cancel', color: 'gray', action: null }
                ] });
            break;

        case 'OUT':
            showNotif({ icon: '🔵', title: 'Time OUT', msg: `${name}\nTime: ${time}`,
                buttons: [
                    { label: '✅ Confirm Time OUT', color: 'blue', action: () => confirmStudent(d) },
                    { label: 'Cancel', color: 'gray', action: null }
                ] });
            break;
    }
}

// ══════════════════════════════════════════════════
// PROFESSOR events
// ══════════════════════════════════════════════════
function handleProfessorEvent(d) {
    const name  = d.name || 'Professor';
    const sched = d.schedule;
    const time  = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const info  = sched ? `${sched.subject_code} — ${sched.section} @ ${sched.lab_code}` : '';

    switch (d.action) {
        case 'NO_SCHEDULE':
            showNotif({ icon: '📅', title: 'No Class Today',
                msg: `${name}\nYou have no class scheduled for today.`,
                buttons: [{ label: 'OK', color: 'gray', action: null }] });
            break;

        case 'NO_VALID_SCHEDULE':
            showNotif({ icon: '📋', title: 'No Valid Schedule',
                msg: d.error || 'No valid schedule available.',
                buttons: [{ label: 'OK', color: 'gray', action: null }] });
            break;

        case 'SESSION_VOIDED':
            showNotif({ icon: '⚠️', title: 'Session Voided',
                msg: d.error || 'The window to start this session has expired.',
                buttons: [{ label: 'OK', color: 'orange', action: null }] });
            break;

        case 'SESSION_CANCELLED':
            showNotif({ icon: '🚫', title: 'Session Cancelled',
                msg: d.error || 'This session has been marked as cancelled.',
                buttons: [{ label: 'OK', color: 'gray', action: null }] });
            break;

        case 'SESSION_ALREADY_ENDED':
            showNotif({ icon: '🔒', title: 'Session Already Ended',
                msg: d.error || 'This session has already been ended.',
                buttons: [{ label: 'OK', color: 'gray', action: null }] });
            break;

        case 'TOO_EARLY': {
            const schedInfo = sched ? `\n\nClass: ${sched.subject_code}\nSection: ${sched.section}\nLab: ${sched.lab_code}` : '';
            showNotif({ icon: '⏰', title: 'Too Early to Start',
                msg: (d.error || 'You can start your session up to 30 minutes before class time.') + schedInfo,
                buttons: [{ label: 'OK', color: 'orange', action: null }] });
            break;
        }

        case 'SCHEDULE_ENDED':
            showNotif({ icon: '🔒', title: 'Class Schedule Ended',
                msg: d.error || 'Your class schedule has already ended.',
                buttons: [{ label: 'OK', color: 'gray', action: null }] });
            break;

        case 'START':
            showNotif({ icon: '🟣', title: 'Start Session',
                msg: `${name}\n${info}\n\nTime: ${time}`,
                buttons: [
                    { label: '▶ Start Session', color: 'purple', action: () => confirmProfessor(d) },
                    { label: 'Cancel', color: 'gray', action: null }
                ] });
            break;

        case 'DISMISS':
            showNotif({ icon: '🚪', title: 'Allow Student Time Out',
                msg: `${name}\n${info}\n\nTime: ${time}`,
                dismissTxt:
                    `✅ Students will be able to scan out and leave the lab.<br>` +
                    `⚠️ New time-ins will still be allowed.<br>` +
                    `📌 Scan your face again when ready to fully end the session.`,
                buttons: [
                    { label: '🚪 Allow Time Out', color: 'orange', action: () => confirmProfessor(d) },
                    { label: 'Cancel', color: 'gray', action: null }
                ] });
            break;

        case 'END':
            showNotif({ icon: '🔴', title: 'End Session',
                msg: `${name}\n${info}\n\nTime: ${time}\n\nAll remaining students will be automatically timed out.`,
                buttons: [
                    { label: '⏹ End Session', color: 'red', action: () => confirmProfessor(d) },
                    { label: 'Cancel', color: 'gray', action: null }
                ] });
            break;
    }
}

// ══════════════════════════════════════════════════
// Confirm student attendance
// ══════════════════════════════════════════════════
function confirmStudent(d) {
    fetch('http://127.0.0.1:5000/confirm_attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            student_id:   d.student_id,
            session_id:   d.session_id,
            action:       d.action,
            is_late:      d.is_late      || false,
            late_minutes: d.late_minutes || 0,
            error:        d.error        || ''
        })
    })
    .then(r => r.json())
    .then(res => {
        const isLate = d.is_late && d.action === 'IN';
        const color  = isLate     ? 'amber'
                     : d.action === 'IN'  ? 'green'
                     : d.action === 'OUT' ? 'blue'
                     : 'gray';
        showToast(res.message || 'Done', color);
    })
    .catch(() => showToast('❌ Error recording attendance', 'red'));
}

// ══════════════════════════════════════════════════
// Confirm professor session
// ══════════════════════════════════════════════════
function confirmProfessor(d) {
    fetch('http://127.0.0.1:5000/confirm_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            professor_id: d.professor_id,
            session_id:   d.session_id,
            action:       d.action,
            error:        d.error || ''
        })
    })
    .then(r => r.json())
    .then(res => {
        const color = { START: 'purple', DISMISS: 'orange', END: 'red' }[d.action] || 'gray';
        showToast(res.message || 'Done', color);
    })
    .catch(() => showToast('❌ Error updating session', 'red'));
}