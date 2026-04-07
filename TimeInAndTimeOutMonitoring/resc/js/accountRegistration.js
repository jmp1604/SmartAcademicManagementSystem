/* ============================================================
   resc/js/accountRegistration.js
   Integrative Programming — Face Registration Logic
============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    if (!supabaseClient) {
        console.error('Supabase client not initialized. Check config/.env.js');
        return;
    }

    const params = new URLSearchParams(window.location.search);

    // Auto-switch to professor tab if role=professor
    if (params.get('role') === 'professor') switchRole('professor');

    // Pre-fill student ID from URL
    const sid = params.get('student_id');
    if (sid && currentRole === 'student') {
        const raw = sid.replace(/\D/g, '').slice(0, 7);
        const formatted = raw.length > 2 ? raw.slice(0, 2) + '-' + raw.slice(2) : raw;
        const idInput = document.getElementById('studentIdInput');
        idInput.value = formatted;
        idInput.dispatchEvent(new Event('input'));
    }

    // Pre-fill Professor ID from URL
    const empId = params.get('employee_id');
    if (empId && currentRole === 'professor') {
        const empInput = document.getElementById('employeeIdInput');
        empInput.value = empId;
        empInput.dispatchEvent(new Event('input'));
    }
});

// ═══════════════════════════════════════════
// GLOBAL ELEMENTS & STATE
// ═══════════════════════════════════════════
let currentRole = 'student';
let studentData = null;
let professorData = null;
let studentTimer = null;
let isEngineOnline = false;
let isBooting = false; 

const opencvFeed      = document.getElementById('opencvFeed');
const cameraLoading   = document.getElementById('cameraLoading');
const cameraContainer = document.getElementById('cameraContainer');
const captureStatus   = document.getElementById('captureStatus');
const dots            = [1,2,3,4,5].map(i => document.getElementById('dot'+i));

const studentIdInput   = document.getElementById('studentIdInput');
const empIdInput       = document.getElementById('employeeIdInput');
const studentScanBtn   = document.getElementById('studentScanBtn');
const professorScanBtn = document.getElementById('professorScanBtn');
const studentInfoCard  = document.getElementById('studentInfoCard');
const professorInfoCard = document.getElementById('professorInfoCard');

// ═══════════════════════════════════════════
// NEW: DYNAMIC BUTTON STATE CONTROLLER
// ═══════════════════════════════════════════
function updateScanButtonsState() {
    const defaultText = '<i class="fa-solid fa-camera"></i> Scan & Register Face';
    
    const setBtnState = (btn, data) => {
        if (!btn) return;
        
        if (isBooting) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Engine Booting...';
        } else if (!isEngineOnline) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-power-off" style="color:#fca5a5;"></i> Please Start Engine First';
        } else if (!data) {
            btn.disabled = true;
            btn.innerHTML = defaultText; // Wait for student/professor data
        } else {
            btn.disabled = false;
            btn.innerHTML = defaultText; // Ready to scan!
        }
    };

    setBtnState(studentScanBtn, studentData);
    setBtnState(professorScanBtn, professorData);
}

// ═══════════════════════════════════════════
// ROLE SWITCHING
// ═══════════════════════════════════════════
function switchRole(role) {
    currentRole = role;
    document.getElementById('studentSection').style.display   = role === 'student'   ? '' : 'none';
    document.getElementById('professorSection').style.display = role === 'professor' ? '' : 'none';
    document.getElementById('btnStudent').classList.toggle('active',   role === 'student');
    document.getElementById('btnProfessor').classList.toggle('active', role === 'professor');

    const isProf = role === 'professor';
    document.getElementById('heroSub').textContent = isProf
        ? 'Look up your Employee ID, then launch the Lab Camera to register.'
        : 'Look up your Student ID, then launch the Lab Camera to register.';
}

// ═══════════════════════════════════════════
// CAMERA MODAL
// ═══════════════════════════════════════════
function resetDots() { dots.forEach(d => d.classList.remove('done')); }

function openCameraUI() {
    cameraContainer.style.display = 'flex';
    cameraLoading.style.display = 'block';
    opencvFeed.style.display = 'none';

    captureStatus.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Connecting to Background Engine...';
    opencvFeed.src = "http://localhost:5000/video_feed?t=" + new Date().getTime();

    opencvFeed.onload = () => {
        cameraLoading.style.display = 'none';
        opencvFeed.style.display = 'block';
        captureStatus.innerHTML = '<i class="fa-solid fa-bolt" style="color:var(--green-bright)"></i> OpenCV Feed Active';
        startProgressPolling();
    };

    opencvFeed.onerror = () => {
        cameraLoading.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:#ff4757"></i><p>Engine Offline.<br>Make sure you ran START_ENGINE.bat</p>';
        captureStatus.innerHTML = '';
    };
}

function closeCameraUI() {
    cameraContainer.style.display = 'none';
    opencvFeed.src = "";
    resetDots();
    if (progressPoller) { clearInterval(progressPoller); progressPoller = null; }
}

cameraContainer.addEventListener('click', e => { if (e.target === cameraContainer) closeCameraUI(); });

// ═══════════════════════════════════════════
// STUDENT SCAN BUTTON
// ═══════════════════════════════════════════
studentScanBtn.addEventListener('click', async () => {
    if (!studentData || !isEngineOnline) return;

    const btn = document.getElementById('studentScanBtn');
    btn.disabled = true;
    cameraContainer.style.display = 'flex';

    try {
        captureStatus.innerHTML = '<i class="fa-solid fa-broom fa-spin"></i> Purging old data & preparing camera...';
        
        await fetch('http://localhost:5000/start_registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_number: studentData.id_number,
                firstName: studentData.first_name,
                lastName:  studentData.last_name,
                role:      'student'
            })
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        openCameraUI();

    } catch (err) {
        cameraContainer.style.display = 'none';
        alert("❌ Registration Error: " + err.message);
    } finally {
        btn.disabled = false;
    }
});

let progressPoller = null;
function startProgressPolling() {
    progressPoller = setInterval(async () => {
        try {
            const res = await fetch('http://localhost:5000/status');
            const data = await res.json();

            dots.forEach((dot, i) => dot.classList.toggle('done', i < data.count));

            if (data.syncing) {
                captureStatus.innerHTML = '<i class="fa-solid fa-cloud-arrow-up" style="color:var(--green-bright)"></i> Syncing to cloud...';
                dots.forEach(dot => dot.classList.add('done'));
            }

            if (!data.active && !data.syncing && data.name !== '') {
                clearInterval(progressPoller);
                captureStatus.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--green-bright)"></i> Registration Complete!';
                setTimeout(() => closeCameraUI(), 3000);
            }
        } catch (_) {}
    }, 800);
}

async function waitForFlask(retries = 30, delayMs = 1500) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch('http://localhost:5000/status', {
                method: 'GET',
                signal: AbortSignal.timeout(1000)
            });
            if (res.ok) return true;
        } catch (_) {}

        captureStatus.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Starting camera engine... (${i + 1}/${retries})`;
        await new Promise(r => setTimeout(r, delayMs));
    }
    throw new Error("Engine did not respond after " + retries + " attempts. Try running START_ENGINE.bat manually.");
}

// ═══════════════════════════════════════════
// STUDENT ID INPUT LOGIC
// ═══════════════════════════════════════════
studentIdInput.addEventListener('input', function () {
    let raw = this.value.replace(/\D/g, '').slice(0, 7);
    let formatted = raw.length > 2 ? raw.slice(0, 2) + '-' + raw.slice(2) : raw;
    this.value = formatted;

    clearTimeout(studentTimer);
    document.getElementById('idError').textContent = '';
    document.getElementById('idSuccess').innerHTML = '';
    studentInfoCard.classList.remove('show');
    
    studentData = null; // Reset data
    updateScanButtonsState(); // Lock button

 if (raw.length === 7) {
        document.getElementById('idSuccess').innerHTML = 'Searching... <span class="loading"></span>';
        studentTimer = setTimeout(() => searchStudent(formatted), 600); // <--- FIXED: Sends "23-22222"
    }
});

async function searchStudent(rawId) {
    try {
        const { data } = await supabaseClient
            .from('students')
            .select('*')
            .eq('id_number', rawId)
            .maybeSingle();

        document.getElementById('idSuccess').innerHTML = '';
        if (data) {
            studentData = data;
            fillStudentFields(data);
            studentInfoCard.classList.add('show');
            document.getElementById('idSuccess').innerHTML = '<i class="fa-solid fa-check-circle"></i> Student found! Ready to scan.';
        } else {
            studentData = null;
            document.getElementById('idError').textContent = '⚠ Student not found.';
        }
        updateScanButtonsState(); // Unlock button if engine is ready
    } catch (err) { console.error(err); }
}

function fillStudentFields(data) {
    document.getElementById('s_firstName').value  = data.first_name  || '';
    document.getElementById('s_middleName').value = data.middle_name || '';
    document.getElementById('s_lastName').value   = data.last_name   || '';
    document.getElementById('s_course').value     = data.course      || '';
    document.getElementById('s_yearLevel').value  = data.year_level  || '';
    document.getElementById('s_section').value    = data.section     || '';
    document.getElementById('s_email').value      = data.email       || '';

    document.getElementById('displayName').textContent        = `${data.first_name} ${data.last_name}`;
    document.getElementById('displayCourse').textContent      = data.course || 'N/A';
    const year = data.year_level || '', section = data.section || '';
    document.getElementById('displayYearSection').textContent = (year || section) ? `${year} - ${section}` : 'N/A';
    document.getElementById('displayEmail').textContent       = data.email || 'N/A';

    const badge = document.getElementById('studentFaceBadge');
    if (data.facial_dataset_path) {
        badge.className = 'status-badge registered';
        badge.textContent = '✓ Face Registered';
    } else {
        badge.className = 'status-badge not-registered';
        badge.textContent = '⚠ Not Registered';
    }
}

// ═══════════════════════════════════════════
// STUDENT CLEAR
// ═══════════════════════════════════════════
document.getElementById('studentClearBtn').addEventListener('click', () => {
    closeCameraUI();
    studentInfoCard.classList.remove('show');
    studentIdInput.value = '';
    studentData = null;
    ['s_firstName','s_middleName','s_lastName','s_course','s_yearLevel','s_section','s_email']
        .forEach(id => document.getElementById(id).value = '');
    ['displayName','displayCourse','displayYearSection','displayEmail']
        .forEach(id => document.getElementById(id).textContent = '');
        
    updateScanButtonsState(); // Relock button
});

// ═══════════════════════════════════════════
// PROFESSOR LOGIC
// ═══════════════════════════════════════════
empIdInput.addEventListener('input', function () {
    const val = this.value.trim();
    professorData = null;
    updateScanButtonsState();
    
    if (val.length >= 3) setTimeout(() => searchProfessor(val), 600);
});

async function searchProfessor(id) {
    const { data } = await supabaseClient
        .from('professors')
        .select('*, departments(department_name)')
        .eq('employee_id', id)
        .maybeSingle();

    if (data) {
        professorData = data;
        fillProfessorFields(data);
        professorInfoCard.classList.add('show');
    } else {
        professorData = null;
    }
    updateScanButtonsState(); // Unlock button if engine is ready
}

function fillProfessorFields(data) {
    const departmentName = data.departments?.department_name || 'N/A';

    document.getElementById('p_firstName').value  = data.first_name  || '';
    document.getElementById('p_middleName').value = data.middle_name || '';
    document.getElementById('p_lastName').value   = data.last_name   || '';
    document.getElementById('p_department').value = departmentName;
    document.getElementById('p_email').value      = data.email       || '';

    document.getElementById('p_displayName').textContent  = `${data.first_name} ${data.last_name}`;
    document.getElementById('p_displayDept').textContent  = departmentName;
    document.getElementById('p_displayEmpId').textContent = data.employee_id || 'N/A';
    document.getElementById('p_displayEmail').textContent = data.email       || 'N/A';

    const badge = document.getElementById('professorFaceBadge');
    if (data.facial_dataset_path) {
        badge.className = 'status-badge registered';
        badge.textContent = '✓ Face Registered';
    } else {
        badge.className = 'status-badge not-registered';
        badge.textContent = '⚠ Not Registered';
    }
}

// ═══════════════════════════════════════════
// PROFESSOR SCAN BUTTON
// ═══════════════════════════════════════════
professorScanBtn.addEventListener('click', async () => {
    if (!professorData || !isEngineOnline) return;

    const btn = document.getElementById('professorScanBtn');
    btn.disabled = true;
    cameraContainer.style.display = 'flex';

    try {
        captureStatus.innerHTML = '<i class="fa-solid fa-broom fa-spin"></i> Purging old data & preparing camera...';

        await fetch('http://localhost:5000/start_registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_number: professorData.employee_id,
                firstName: professorData.first_name,
                lastName:  professorData.last_name,
                role:      'professor'
            })
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        openCameraUI();

    } catch (err) {
        cameraContainer.style.display = 'none';
        alert("❌ Registration Error: " + err.message);
    } finally {
        btn.disabled = false;
    }
});

// ═══════════════════════════════════════════
// PROFESSOR CLEAR
// ═══════════════════════════════════════════
document.getElementById('professorClearBtn').addEventListener('click', () => {
    closeCameraUI();
    professorInfoCard.classList.remove('show');
    empIdInput.value = '';
    professorData = null;
    ['p_firstName','p_middleName','p_lastName','p_department','p_email']
        .forEach(id => document.getElementById(id).value = '');
    ['p_displayName','p_displayDept','p_displayEmpId','p_displayEmail']
        .forEach(id => document.getElementById(id).textContent = '');
        
    updateScanButtonsState(); // Relock button
});

// ═══════════════════════════════════════════
// ENGINE STATUS POLLING
// ═══════════════════════════════════════════
setInterval(async () => {
    if (isBooting) {
        updateScanButtonsState();
        return; 
    }

    try {
        const res = await fetch('http://127.0.0.1:5000/status', { method: 'HEAD' });
        isEngineOnline = res.ok;
        document.getElementById('stopEngineBtn').style.display = isEngineOnline ? 'inline-flex' : 'none';
        document.getElementById('startEngineNavBtn').style.display = isEngineOnline ? 'none' : 'inline-flex';
    } catch (_) {
        isEngineOnline = false;
        document.getElementById('stopEngineBtn').style.display = 'none';
        document.getElementById('startEngineNavBtn').style.display = 'inline-flex';
    }
    
    updateScanButtonsState(); // Auto-update buttons every 3 seconds based on engine status
}, 3000);

async function bootRegistrationEngine() {
    const startBtn = document.getElementById('startEngineNavBtn');
    isBooting = true; 
    updateScanButtonsState(); // Forces "Booting..." state on scan buttons
    
    startBtn.disabled = true;
    startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Booting...';

    try {
        await fetch('http://localhost/INTEG%20SYSTEM/SmartAcademicManagementSystem/TimeInAndTimeOutMonitoring/students/trigger_registration.php', { method: 'POST' });
        await waitForFlask(25, 1000);
    } catch (err) {
        if (startBtn.disabled) {
            alert("Failed to start engine: " + err.message);
        }
    } finally {
        isBooting = false; 
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> Start Engine';
        updateScanButtonsState(); // Re-check buttons
    }
}

async function stopEngine() {
    const confirmed = confirm('Are you sure you want to stop the engine?');
    if (!confirmed) return;

    isBooting = false; 

    try {
        await fetch('http://127.0.0.1:5000/shutdown', { method: 'POST' });
    } catch (_) {}

    const startBtn = document.getElementById('startEngineNavBtn');
    const stopBtn = document.getElementById('stopEngineBtn');
    
    stopBtn.style.display = 'none';
    startBtn.style.display = 'inline-flex';
    startBtn.disabled = false;
    startBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> Start Engine';
    
    isEngineOnline = false;
    updateScanButtonsState(); // Locks buttons immediately
}