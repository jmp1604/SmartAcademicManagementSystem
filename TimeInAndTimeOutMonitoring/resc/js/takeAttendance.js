/* ============================================================
   takeAttendance.js
   Path: TimeInAndTimeOutMonitoring/resc/js/takeAttendance.js
============================================================ */

// ══════════════════════════════════════════════════
// GLOBAL ELEMENTS & STATE
// ══════════════════════════════════════════════════
const bootEngineBtn = document.getElementById('bootEngineBtn');
const startBtn      = document.getElementById('startBtn');
const stopBtn       = document.getElementById('stopBtn');
const stopEngineBtn = document.getElementById('stopEngineBtn'); // In the nav bar
const videoWrap     = document.getElementById('videoWrap');
const videoStream   = document.getElementById('videoStream');
const stripStatus   = document.getElementById('stripStatus');
const sessionState  = document.getElementById('sessionState');

let isBooting = false; 
let isEngineOnline = false;

// ══════════════════════════════════════════════════
// NEW: DYNAMIC BUTTON CONTROLLER
// ══════════════════════════════════════════════════
function updateSessionButtonState() {
    // If the session is already running (button hidden), don't change anything
    if (startBtn.style.display === 'none') return;

    if (isBooting) {
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Engine Booting...';
    } else if (!isEngineOnline) {
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fa-solid fa-power-off" style="color:#fca5a5;"></i> Please Start Engine First';
    } else {
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start Session';
    }
}

// Set the initial state as soon as the page loads
updateSessionButtonState();

// ══════════════════════════════════════════════════
// Real-time clock & Output Box
// ══════════════════════════════════════════════════
function updateTime() {
    const now = new Date();
    document.getElementById('timestamp').textContent =
        now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
        + ' · ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateTime, 1000);
updateTime();

function setOutput(type, icon, msg) {
    const box = document.getElementById('outputBox');
    box.className = 'output-box show ' + type;
    box.querySelector('i').className = 'fa-solid ' + icon;
    document.getElementById('outputText').innerHTML = msg;
}

// ══════════════════════════════════════════════════
// ENGINE POLLING & STOP
// ══════════════════════════════════════════════════
setInterval(async () => {
    if (isBooting) {
        updateSessionButtonState();
        return; 
    }

    try {
        const res = await fetch('http://127.0.0.1:5000/', { method: 'GET' });
        isEngineOnline = (res.ok || res.status === 200);
        
        if (isEngineOnline) {
            if (stopEngineBtn) stopEngineBtn.style.display = 'inline-flex';
            bootEngineBtn.style.display = 'none';
        }
    } catch (_) {
        isEngineOnline = false;
        if (stopEngineBtn) stopEngineBtn.style.display = 'none';
        
        // Force reset the boot button to original state if engine dies
        bootEngineBtn.style.display = 'inline-flex';
        bootEngineBtn.disabled = false;
        bootEngineBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> Start Engine';
        
        // If the engine crashes while a session is running, force stop the session
        if (startBtn.style.display === 'none') {
            stopAttendanceSession();
        }
    }
    
    updateSessionButtonState(); // Update the "Start Session" button every 3 seconds
}, 3000);

// Hardware Boot Listener
bootEngineBtn.addEventListener('click', async () => {
    isBooting = true;
    updateSessionButtonState(); // Forces "Booting..." state on the Start Session button
    
    bootEngineBtn.disabled = true;
    bootEngineBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Booting Engine...';
    setOutput('info', 'fa-solid fa-microchip fa-spin', '<span class="spin"></span> Starting Facial Recognition Engine...');

    try {
        await fetch('http://localhost/INTEG%20SYSTEM/SmartAcademicManagementSystem/TimeInAndTimeOutMonitoring/students/trigger_attendance.php', { method: 'POST' });
        
        await waitForFlask(60, 1000); 

        bootEngineBtn.style.display = 'none';
        setOutput('success', 'fa-solid fa-check', 'Engine Online! You can now start the session.');
        if (stopEngineBtn) stopEngineBtn.style.display = 'inline-flex';
    } catch (err) {
        if (bootEngineBtn.disabled) {
            alert("Failed to start engine: " + err.message);
        }
        setOutput('error', 'fa-solid fa-circle-exclamation', '❌ ' + err.message);
        bootEngineBtn.disabled = false;
        bootEngineBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> Start Engine';
    } finally {
        isBooting = false;
        updateSessionButtonState(); // Unlocks the Start Session button
    }
});

// Manual Stop Engine Function
async function stopEngine() {
    const confirmed = confirm('Are you sure you want to stop the engine?');
    if (!confirmed) return;

    isBooting = false; 

    try {
        await fetch('http://127.0.0.1:5000/shutdown', { method: 'POST' });
    } catch (_) {}

    if (stopEngineBtn) stopEngineBtn.style.display = 'none';
    bootEngineBtn.style.display = 'inline-flex';
    bootEngineBtn.disabled = false;
    bootEngineBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> Start Engine';
    
    stopAttendanceSession(); // Resets the UI if a session was active
    isEngineOnline = false;
    updateSessionButtonState(); 
}

async function waitForFlask(retries = 60, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch('http://127.0.0.1:5000/', { method: 'GET' });
            if (res.ok || res.status === 200) return true;
        } catch (_) {}
        
        const msg = `<span class="spin"></span> Downloading database & starting camera... (${i + 1}/${retries})`;
        setOutput('info', 'fa-solid fa-circle-notch fa-spin', msg);
        await new Promise(r => setTimeout(r, delayMs));
    }
    throw new Error('Engine did not respond. Check Task Manager for pythonw.exe');
}

// ══════════════════════════════════════════════════
// Start / Stop Class Session
// ══════════════════════════════════════════════════
startBtn.addEventListener('click', async () => {
    if (!isEngineOnline) return;

    startBtn.disabled = true;
    sessionState.textContent = 'Active';
    
    videoWrap.style.display  = 'block';
    videoStream.src = 'http://127.0.0.1:5000/video_feed?t=' + Date.now();
    
    startBtn.style.display   = 'none';
    stopBtn.style.display    = 'inline-flex';
    stripStatus.innerHTML    = '<div class="pulse"></div>Live';
    
    setOutput('success', 'fa-solid fa-circle-check', 'Attendance session is live! Ready for scans.');
});

stopBtn.addEventListener('click', () => {
    if (!confirm('Stop the current attendance session? Camera will close.')) return;
    stopAttendanceSession();
    setOutput('info', 'fa-solid fa-circle-info', 'Session ended. Click Start to resume.');
});

function stopAttendanceSession() {
    videoWrap.style.display = 'none';
    videoStream.src = "";
    stopBtn.style.display = 'none';
    startBtn.style.display = 'inline-flex';
    sessionState.textContent = 'Idle';
    stripStatus.innerHTML = 'Ready';
    updateSessionButtonState(); // Ensures the button resets to the correct text
}

// ══════════════════════════════════════════════════
// NOTIFICATION HELPERS & SSE
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
    if (remaining > 0) {
        notifCountdown.textContent = `Auto-dismiss in ${remaining}s`;
        countdownInterval = setInterval(() => {
            remaining--;
            notifCountdown.textContent = remaining > 0 ? `Auto-dismiss in ${remaining}s` : '';
            if (remaining <= 0) clearInterval(countdownInterval);
        }, 1000);
        autoDismissTimer = setTimeout(closeNotif, autoDismiss * 1000);
    } else {
        notifCountdown.textContent = '';
    }

    overlay.classList.add('show');
}

function closeNotif() {
    clearTimeout(autoDismissTimer);
    clearInterval(countdownInterval);
    overlay.classList.remove('show');
    notifCountdown.textContent = '';
}

overlay.addEventListener('click', e => { if (e.target === overlay) closeNotif(); });

// Listen to Face Recognition Events
if (window.EventSource) {
    const src = new EventSource('http://127.0.0.1:5000/attendee_stream');
    src.onmessage = (e) => {
        try {
            const d = JSON.parse(e.data);
            d.role === 'student' ? handleStudentEvent(d) : handleProfessorEvent(d);
        } catch (err) { console.error('SSE parse error:', err); }
    };
}

// ══════════════════════════════════════════════════
// STUDENT & PROFESSOR HANDLERS
// ══════════════════════════════════════════════════
function handleStudentEvent(d) {
    const name = d.name || 'Student';
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    switch (d.action) {
        case 'IN':
            showNotif({ 
                icon: d.is_late ? '⚠️' : '🟢',
                title: d.is_late ? 'Saving Time IN — Late...' : 'Saving Time IN...',
                msg: `${name}\nTime: ${time}`,
                lateTxt: d.is_late ? `You are LATE by ${d.late_minutes} minute${d.late_minutes !== 1 ? 's' : ''}` : null,
                buttons: [],   
                autoDismiss: 2 
            });
            confirmStudent(d); 
            break;
        case 'OUT':
            showNotif({ 
                icon: '🔵', title: 'Saving Time OUT...', msg: `${name}\nTime: ${time}`,
                buttons: [], autoDismiss: 2 
            });
            confirmStudent(d); 
            break;
        case 'COMPLETED':
            showNotif({ 
                icon: '✅', title: 'Attendance Complete', 
                msg: `${name}\nYou have already timed in and timed out for this session.`, 
                buttons: [{ label: 'Dismiss', color: 'gray' }], autoDismiss: 4 
            });
            break;
        case 'NOT_ENROLLED':
            showNotif({ icon: '📋', title: 'Not Enrolled', msg: d.error, buttons: [{ label: 'Dismiss', color: 'gray' }], autoDismiss: 4 });
            break;
        case 'SESSION_NOT_STARTED':
            showNotif({ icon: '⏳', title: 'Session Not Started Yet', 
                msg: d.error || 'Your professor has not started the session yet. Please wait.',
                buttons: [{ label: 'OK', color: 'orange' }], autoDismiss: 8 });
        break;

        case 'ALL_DONE':
             showNotif({ icon: '✅', title: 'All Classes Done', 
              msg: d.error || 'You have no more classes for today. Great job!',
               buttons: [{ label: 'OK', color: 'gray' }], autoDismiss: 5 });
             break;
        case 'CANNOT_TIME_OUT':
            showNotif({ icon: '🔐', title: 'Cannot Time Out', msg: name, cannotTimeOutTxt: d.error, buttons: [{ label: 'Dismiss', color: 'gray' }], autoDismiss: 6 });
            break;
        case 'SESSION_CANCELLED':
            showNotif({ icon: '🚫', title: 'Session Voided', msg: d.error, buttons: [{ label: 'Dismiss', color: 'red' }], autoDismiss: 4 });
            break;
        case 'SESSION_ENDED':
            showNotif({ icon: '⏹', title: 'Session Ended', msg: d.error, buttons: [{ label: 'Dismiss', color: 'gray' }], autoDismiss: 4 });
            break;
    }
}
function handleProfessorEvent(d) {
    const name = d.name || 'Professor';
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    
    switch (d.action) {
        case 'START':
            // ... (keep existing)
            break;
        case 'DISMISS':
            // ... (keep existing)
            break;
        case 'END':
            // ... (keep existing)
            break;
            
        // ── ERROR HANDLERS ──
        case 'NO_SCHEDULE':
        case 'NO_VALID_SCHEDULE':
            // ... (keep existing)
            break;
        case 'TOO_EARLY':
            // ... (keep existing)
            break;
            
        // ── NEW: SMART JUMP HANDLERS FOR PROFESSOR ──
        case 'ALL_DONE':
            showNotif({ 
                icon: '🎉', title: 'All Done!', msg: d.error, 
                buttons: [{ label: 'Dismiss', color: 'gray' }], autoDismiss: 4 
            });
            break;
        case 'SESSION_ENDED':
            showNotif({ 
                icon: '✅', title: 'Session Completed', msg: d.error, 
                buttons: [{ label: 'Dismiss', color: 'gray' }], autoDismiss: 4 
            });
            break;
        case 'SESSION_CANCELLED':
            showNotif({ 
                icon: '🚫', title: 'Session Voided', msg: d.error, 
                buttons: [{ label: 'Dismiss', color: 'red' }], autoDismiss: 5 
            });
            break;
    }
}

function confirmStudent(d) {
    fetch('http://127.0.0.1:5000/confirm_attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d)
    })
    .then(r => r.json())
    .then(res => showToast(res.message, d.is_late ? 'amber' : 'green'))
    .catch(() => showToast('❌ Error saving attendance', 'red'));
}

function confirmProfessor(d) {
    fetch('http://127.0.0.1:5000/confirm_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d)
    })
    .then(r => r.json())
    .then(res => showToast(res.message, 'purple'))
    .catch(() => showToast('❌ Error updating session', 'red'));
}