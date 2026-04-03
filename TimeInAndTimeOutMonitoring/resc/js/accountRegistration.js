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
    if (params.get('role') === 'professor') switchRole('professor');
    
    const sid = params.get('student_id');
    if (sid && currentRole === 'student') {
        const idInput = document.getElementById('studentIdInput');
        idInput.value = sid.replace(/\D/g, '').slice(0, 7);
        idInput.dispatchEvent(new Event('input'));
    }
});

// ═══════════════════════════════════════════
// GLOBAL ELEMENTS & STATE
// ═══════════════════════════════════════════
let currentRole = 'student';
let studentData = null;
let professorData = null;
let studentTimer = null;

const opencvFeed      = document.getElementById('opencvFeed');
const cameraLoading   = document.getElementById('cameraLoading');
const cameraContainer = document.getElementById('cameraContainer');
const captureStatus   = document.getElementById('captureStatus');
const dots            = [1,2,3,4,5].map(i => document.getElementById('dot'+i));

const studentIdInput  = document.getElementById('studentIdInput');
const empIdInput      = document.getElementById('employeeIdInput');
const studentScanBtn  = document.getElementById('studentScanBtn');
const professorScanBtn = document.getElementById('professorScanBtn');
const studentInfoCard = document.getElementById('studentInfoCard');
const professorInfoCard = document.getElementById('professorInfoCard');

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
// CAMERA MODAL (Instant Background Connection)
// ═══════════════════════════════════════════
function resetDots() { dots.forEach(d => d.classList.remove('done')); }

function openCameraUI() {
    cameraContainer.style.display = 'flex';
    cameraLoading.style.display = 'block';
    opencvFeed.style.display = 'none';
    
    captureStatus.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Connecting to Background Engine...';

    // Instantly connect to the background stream
    opencvFeed.src = "http://localhost:5000/video_feed?t=" + new Date().getTime();

    opencvFeed.onload = () => {
        cameraLoading.style.display = 'none';
        opencvFeed.style.display = 'block';
        captureStatus.innerHTML = '<i class="fa-solid fa-bolt" style="color:var(--green-bright)"></i> OpenCV Feed Active';
         startProgressPolling(); // ← Add this line
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
    if (progressPoller) { clearInterval(progressPoller); progressPoller = null; } // ← Add this
}

cameraContainer.addEventListener('click', e => { if (e.target === cameraContainer) closeCameraUI(); });

// ═══════════════════════════════════════════
// BUTTON TRIGGER LOGIC (STUDENT)
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// REGISTRATION TRIGGER (With Ghost-Photo Fix)
// ═══════════════════════════════════════════
studentScanBtn.addEventListener('click', async () => {
    if (!studentData) return;

    const btn = document.getElementById('studentScanBtn');
    btn.disabled = true;
    cameraContainer.style.display = 'flex';
    
    try {
        // STEP 1: Wake up the engine via PHP
        captureStatus.innerHTML = '<i class="fa-solid fa-microchip fa-spin"></i> Initializing Engine...';
        await fetch('http://localhost/INTEG%20SYSTEM/SmartAcademicManagementSystem/TimeInAndTimeOutMonitoring/students/trigger_registration.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_number:  studentData.id_number,
                firstName:  studentData.first_name,
                lastName:   studentData.last_name
                
            })
        });

        // STEP 2: Wait for Flask to respond
        await waitForFlask();

        // STEP 3: Tell Flask to start registration and CLEAN OLD FILES
        captureStatus.innerHTML = '<i class="fa-solid fa-broom fa-spin"></i> Purging old data & warming up...';
        await fetch('http://localhost:5000/start_registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_number:  studentData.id_number,
                firstName:  studentData.first_name,
                lastName:   studentData.last_name, 
                role:       'student'   // ← Add this
                
               
                
            })
        });

        /**
         * CRITICAL FIX: 
         * We wait 1 full second here. This gives the Python script enough time to:
         * 1. Finish os.remove() on old 1.jpg, 2.jpg, etc.
         * 2. Flush the camera's internal hardware buffer.
         */
        await new Promise(resolve => setTimeout(resolve, 1000));

        // STEP 4: Now open the UI to see the fresh stream
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

            // Update dots based on count
            dots.forEach((dot, i) => {
                dot.classList.toggle('done', i < data.count);
            });

            if (data.syncing) {
                captureStatus.innerHTML = '<i class="fa-solid fa-cloud-arrow-up" style="color:var(--green-bright)"></i> Syncing to cloud...';
                dots.forEach(dot => dot.classList.add('done')); // All 5 green
            }

            // Complete: active is false, not syncing
            if (!data.active && !data.syncing && data.name !== '') {
                clearInterval(progressPoller);
                captureStatus.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--green-bright)"></i> Registration Complete!';
                setTimeout(() => closeCameraUI(), 3000);
            }

        } catch (_) {}
    }, 800);
}

async function waitForFlask(retries = 15, delayMs = 800) {
    for (let i = 0; i < retries; i++) {
        try {
            // A lightweight ping — just check if the server is up
            const res = await fetch('http://localhost:5000/video_feed', { method: 'HEAD' });
            if (res.ok || res.status === 200) return true;
        } catch (_) {
            // Still booting, keep waiting
        }
        await new Promise(r => setTimeout(r, delayMs));
    }
    throw new Error("Engine did not respond after " + retries + " attempts.");
}

// ═══════════════════════════════════════════
// STUDENT ID INPUT LOGIC
// ═══════════════════════════════════════════
studentIdInput.addEventListener('input', function() {
    // Remove non-digits and limit to 7 characters
    let raw = this.value.replace(/\D/g, '').slice(0, 7);
    
    // Format as YY-XXXXX (e.g., 23-12345)
    let formatted = raw.length > 2 ? raw.slice(0, 2) + '-' + raw.slice(2) : raw;
    this.value = formatted;

    // Reset UI State
    clearTimeout(studentTimer);
    document.getElementById('idError').textContent = '';
    document.getElementById('idSuccess').innerHTML = '';
    studentInfoCard.classList.remove('show');
    studentScanBtn.disabled = true;

    // Trigger search only when ID is complete (7 digits)
    if (raw.length === 7) {
        document.getElementById('idSuccess').innerHTML = 'Searching... <span class="loading"></span>';
        studentTimer = setTimeout(() => searchStudent(formatted), 600); 
    }
});

async function searchStudent(id) {
    try {
        const { data } = await supabaseClient.from('students').select('*').eq('id_number', id).maybeSingle();
        document.getElementById('idSuccess').innerHTML = '';
        if (data) {
            studentData = data;
            fillStudentFields(data);
            studentInfoCard.classList.add('show');
            studentScanBtn.disabled = false;
            document.getElementById('idSuccess').innerHTML = '<i class="fa-solid fa-check-circle"></i> Student found! Ready to scan.';
        } else {
            document.getElementById('idError').textContent = '⚠ Student not found.';
        }
    } catch (err) { console.error(err); }
}
function fillStudentFields(data) {
    // 1. Fill Hidden/Read-only Input Fields
    document.getElementById('s_firstName').value = data.first_name || '';
    document.getElementById('s_middleName').value = data.middle_name || '';
    document.getElementById('s_lastName').value = data.last_name || '';
    document.getElementById('s_course').value = data.course || '';
    document.getElementById('s_yearLevel').value = data.year_level || '';
    document.getElementById('s_section').value = data.section || '';
    document.getElementById('s_email').value = data.email || '';

    // 2. Update Display Labels in the "Info Card"
    document.getElementById('displayName').textContent = `${data.first_name} ${data.last_name}`;
    document.getElementById('displayCourse').textContent = data.course || 'N/A';
    
    // Combine Year and Section for the display badge (e.g., "3 - A")
    const year = data.year_level || '';
    const section = data.section || '';
    document.getElementById('displayYearSection').textContent = (year || section) ? `${year} - ${section}` : 'N/A';
    
    document.getElementById('displayEmail').textContent = data.email || 'N/A';

    // 3. Handle Registration Badge
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
// MODIFIED CLEAR LOGIC
// ═══════════════════════════════════════════
document.getElementById('studentClearBtn').addEventListener('click', () => {
    closeCameraUI();
    studentInfoCard.classList.remove('show');
    studentIdInput.value = '';
    studentData = null;
    studentScanBtn.disabled = true;

    // Clear all auto-filled inputs manually
    const inputs = ['s_firstName', 's_middleName', 's_lastName', 's_course', 's_yearLevel', 's_section', 's_email'];
    inputs.forEach(id => document.getElementById(id).value = '');
    
    // Clear display spans
    const spans = ['displayName', 'displayCourse', 'displayYearSection', 'displayEmail'];
    spans.forEach(id => document.getElementById(id).textContent = '');
});

// ═══════════════════════════════════════════
// PROFESSOR LOGIC
// ═══════════════════════════════════════════
empIdInput.addEventListener('input', function() {
    const val = this.value.trim();
    if (val.length >= 3) {
        setTimeout(() => searchProfessor(val), 600);
    }
});

async function searchProfessor(id) {
    const { data } = await supabaseClient
        .from('professors')
        .select('*, departments(department_name)')  // ← Join departments table
        .eq('employee_id', id)
        .maybeSingle();

    if (data) {
        professorData = data;
        fillProfessorFields(data);
        professorInfoCard.classList.add('show');
        professorScanBtn.disabled = false;
    }
}
function fillProfessorFields(data) {
    const departmentName = data.departments?.department_name || 'N/A';  // ← Read from join

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

professorScanBtn.addEventListener('click', async () => {
    if (!professorData) return;
    const btn = document.getElementById('professorScanBtn');
    btn.disabled = true;

    try {
        // STEP 1: Wake up the engine via PHP
        await fetch('http://localhost/INTEG%20SYSTEM/SmartAcademicManagementSystem/TimeInAndTimeOutMonitoring/students/trigger_registration.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_number:  professorData.employee_id,
                firstName:  professorData.first_name,
                lastName:   professorData.last_name
            })
        });

        // STEP 2: Wait for Flask to respond
        await waitForFlask();

        // STEP 3: Tell Flask to start registration
        await fetch('http://localhost:5000/start_registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_number:  professorData.employee_id,
                firstName:  professorData.first_name,
                lastName:   professorData.last_name,
                role:       'professor'   // ← Add this
            })
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        openCameraUI();

    } catch (err) {
        alert("❌ Registration Error: " + err.message);
    } finally {
        btn.disabled = false;
    }
});

// ═══════════════════════════════════════════
// CLEANUP / CLEAR
// ═══════════════════════════════════════════
document.getElementById('studentClearBtn').addEventListener('click', () => {
    closeCameraUI();
    studentInfoCard.classList.remove('show');
    studentIdInput.value = '';
    studentData = null;
    studentScanBtn.disabled = true;
});

document.getElementById('professorClearBtn').addEventListener('click', () => {
    closeCameraUI();
    professorInfoCard.classList.remove('show');
    empIdInput.value = '';
    professorData = null;
    professorScanBtn.disabled = true;

    // Clear all auto-filled inputs
    ['p_firstName', 'p_middleName', 'p_lastName', 'p_department', 'p_email']
        .forEach(id => document.getElementById(id).value = '');

    // Clear display spans
    ['p_displayName', 'p_displayDept', 'p_displayEmpId', 'p_displayEmail']
        .forEach(id => document.getElementById(id).textContent = '');
});