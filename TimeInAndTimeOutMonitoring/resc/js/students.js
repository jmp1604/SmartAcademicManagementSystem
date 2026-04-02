/* ============================================================
   resc/js/attendeesList.js
   Students List — Supabase migration
   Replaces: students.php, add_student.php, remove_student.php,
             search_student.php, check_Studentduplicate.php,
             import_students.php, save_report.php
   Uses: Supabase RLS policies (anon key, department-scoped)
============================================================ */

// ── State ──────────────────────────────────────────────────
let allStudents  = [];   // raw rows from Supabase
let reportRows   = [];   // enriched rows for the report modal
let META = { total: 0, registered: 0, pending: 0, date: '' };

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (!supabaseClient) {
        showToast('⚠️ Supabase not configured. Check config/.env.js', false);
        return;
    }
    await loadStudents();
    initFilters();
    initAddStudentForm();
    initDuplicateChecks();
});

// ══════════════════════════════════════════════════════════
// 1. LOAD STUDENTS FROM SUPABASE
// ══════════════════════════════════════════════════════════
async function loadStudents() {
    try {
        // Fetch all students
        const { data: students, error } = await supabaseClient
            .from('students')
            .select(`
                student_id,
                id_number,
                first_name,
                middle_name,
                last_name,
                course,
                year_level,
                section,
                email,
                facial_dataset_path,
                status,
                created_at
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        allStudents = students || [];

        // Compute stats
        const total      = allStudents.length;
        const registered = allStudents.filter(s => s.facial_dataset_path).length;
        const pending    = total - registered;

        META = {
            total,
            registered,
            pending,
            date: new Date().toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        };

        // Update stat badges
        document.getElementById('statTotal').textContent      = total;
        document.getElementById('statRegistered').textContent = registered;
        document.getElementById('statPending').textContent    = pending;

        renderTable(allStudents);
        await buildReportRows();

    } catch (err) {
        console.error('loadStudents error:', err);
        document.getElementById('studentsTableBody').innerHTML =
            `<tr><td colspan="10" style="text-align:center;padding:40px;color:#dc2626">
                <i class="fa-solid fa-circle-exclamation"></i> Failed to load students: ${err.message}
            </td></tr>`;
    }
}

// ══════════════════════════════════════════════════════════
// 2. RENDER TABLE
// ══════════════════════════════════════════════════════════
function renderTable(students) {
    const tbody = document.getElementById('studentsTableBody');

    if (!students.length) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:#9ca3af">
            <i class="fa-solid fa-users" style="font-size:32px;display:block;margin-bottom:10px;color:#dcfce7"></i>
            No students found.
        </td></tr>`;
        return;
    }

    tbody.innerHTML = students.map(s => {
        const hasFace    = !!s.facial_dataset_path;
        
        // UPDATED: Combined format like "3A"
        const yearSec    = `${s.year_level || ''}${s.section || ''}` || '-';
        
        const dateReg    = s.created_at
            ? new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
            : '-';
        const statusCls  = (s.status || 'active').toLowerCase();
        const faceData   = hasFace ? 'registered' : 'not-registered';

        return `<tr data-id="${s.student_id}" data-status="${statusCls}" data-face="${faceData}">
            <td style="font-weight:700;color:#166534">${escHtml(s.id_number)}</td>
            <td>${escHtml(s.first_name)}</td>
            <td>${escHtml(s.middle_name || '-')}</td>
            <td style="font-weight:600">${escHtml(s.last_name)}</td>
            <td>${escHtml(s.course || '-')}</td>
            <td>${escHtml(yearSec)}</td>
            <td style="font-size:12.5px">${escHtml(s.email || '-')}</td>
            <td>
                ${hasFace
                    ? `<span class="action-icon face-reg reg-done" title="Facial data registered"><i class="fas fa-check"></i></span>`
                    : `<span class="action-icon face-reg" title="Register facial data"
                         onclick="openFaceRegModal('${escHtml(s.id_number)}')">
                         <i class="fas fa-times"></i>
                       </span>`
                }
            </td>
            <td style="font-size:12.5px">${dateReg}</td>
            <td>
                <button class="btn-danger" onclick="removeStudent('${s.student_id}')" title="Remove Student">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ══════════════════════════════════════════════════════════
// 3. FILTERS & SEARCH
// ══════════════════════════════════════════════════════════
function initFilters() {
    const searchInput  = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const faceFilter   = document.getElementById('faceFilter');
    const sortFilter   = document.getElementById('sortFilter');

    [searchInput, statusFilter, faceFilter, sortFilter].forEach(el => {
        el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', applyFilters);
    });

    document.getElementById('clearFilters').addEventListener('click', () => {
        searchInput.value = '';
        statusFilter.value = '';
        faceFilter.value = '';
        sortFilter.value = '';
        applyFilters();
    });
}

function applyFilters() {
    const q   = document.getElementById('searchInput').value.toLowerCase().trim();
    const st  = document.getElementById('statusFilter').value;
    const fc  = document.getElementById('faceFilter').value;
    const so  = document.getElementById('sortFilter').value;

    let filtered = allStudents.filter(s => {
        const matchQ  = !q || s.id_number?.toLowerCase().includes(q)
                           || s.first_name?.toLowerCase().includes(q)
                           || s.last_name?.toLowerCase().includes(q);
        const matchSt = !st || (s.status || 'active').toLowerCase() === st;
        const matchFc = !fc || (fc === 'registered' ? !!s.facial_dataset_path : !s.facial_dataset_path);
        return matchQ && matchSt && matchFc;
    });

    if (so === 'az') filtered.sort((a, b) => a.last_name.localeCompare(b.last_name));
    if (so === 'za') filtered.sort((a, b) => b.last_name.localeCompare(a.last_name));

    renderTable(filtered);
}

// ══════════════════════════════════════════════════════════
// 4. ADD STUDENT
// ══════════════════════════════════════════════════════════

/**
 * generateUUID — crypto-safe UUID v4.
 * student_id is a UUID PK in Supabase (linked to auth.users).
 * Since we manage students directly (no auth signup flow here),
 * we generate the UUID on the client and insert it explicitly.
 * NOTE: Remove the FK constraint on students.student_id → auth.users(id)
 * in Supabase if you are adding students without creating auth accounts.
 */
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function initAddStudentForm() {
    document.getElementById('addStudentForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        // Block if any dup errors are showing
        if (document.querySelector('#addStudentModal .dup-msg.show')) {
            showToast('⚠️ Fix duplicate errors before saving.', false);
            return;
        }

        const btn = document.getElementById('addStudentBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        const fd = new FormData(this);

        // ── Mirror add_student.php validation ──────────────────
        const idNumber  = fd.get('id_number')?.trim() || '';
        const firstName = fd.get('first_name')?.trim() || '';
        const lastName  = fd.get('last_name')?.trim() || '';
        const email     = fd.get('email')?.trim() || '';

        if (!idNumber) {
            showToast('❌ Student ID is required.', false);
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-save"></i> Save Student';
            return;
        }
        if (!/^\d{7}$/.test(idNumber)) {
            showToast('❌ Student ID must be exactly 7 digits.', false);
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-save"></i> Save Student';
            return;
        }
        if (!firstName) {
            showToast('❌ First name is required.', false);
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-save"></i> Save Student';
            return;
        }
        if (!lastName) {
            showToast('❌ Last name is required.', false);
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-save"></i> Save Student';
            return;
        }
        if (email && !/^[a-z]+_[a-z]+@plpasig\.edu\.ph$/i.test(email)) {
            showToast('❌ Invalid email format. Must be: lastname_firstname@plpasig.edu.ph', false);
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-save"></i> Save Student';
            return;
        }
        // ───────────────────────────────────────────────────────

        const payload = {
            // ★ KEY FIX: supply student_id explicitly so the NOT NULL constraint is satisfied.
            // The students table has student_id UUID PK with a FK to auth.users(id).
            // For admin-managed students without an auth account, generate a standalone UUID.
            // You MUST drop/disable the FK: ALTER TABLE students DROP CONSTRAINT students_student_id_fkey;
            student_id:   generateUUID(),
            id_number:    idNumber,
            first_name:   firstName,
            middle_name:  fd.get('middle_name')?.trim() || null,
            last_name:    lastName,
            course:       fd.get('course')?.trim() || null,
            section:      fd.get('section')?.trim() || null,
            year_level:   fd.get('year_level') ? parseInt(fd.get('year_level')) : null,
            email:        email || null,
            status:       fd.get('status') || 'active',
            password:     'changeme123',  // hashed on the DB side ideally; placeholder for now
        };

        try {
            const { data, error } = await supabaseClient
                .from('students')
                .insert([payload])
                .select()
                .single();

            if (error) throw error;

            showToast('✅ Student added successfully!', false);
            closeModal('addStudentModal');
            this.reset();
            clearAddStudentDups();
            await loadStudents();

        } catch (err) {
            console.error('addStudent error:', err);
            // Surface a user-friendly message for common constraint errors
            let msg = err.message || 'Unknown error';
            if (msg.includes('student_id') && msg.includes('not-null')) {
                msg = 'student_id constraint error — see console. You may need to drop the FK to auth.users.';
            } else if (msg.includes('id_number') && msg.includes('unique')) {
                msg = `Student ID "${idNumber}" already exists.`;
            } else if (msg.includes('email') && msg.includes('unique')) {
                msg = `Email "${email}" is already registered.`;
            }
            showToast('❌ Error: ' + msg, false);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-save"></i> Save Student';
        }
    });
}

// ══════════════════════════════════════════════════════════
// 5. REMOVE STUDENT
// ══════════════════════════════════════════════════════════
async function removeStudent(studentId) {
    if (!confirm('Remove this student? This cannot be undone.')) return;

    try {
        const { error } = await supabaseClient
            .from('students')
            .delete()
            .eq('student_id', studentId);

        if (error) throw error;

        showToast('Student removed successfully.', false);
        await loadStudents();

    } catch (err) {
        console.error('removeStudent error:', err);
        showToast('❌ Error: ' + err.message, false);
    }
}

// ══════════════════════════════════════════════════════════
// 6. DUPLICATE CHECKS (replaces check_Studentduplicate.php)
// ══════════════════════════════════════════════════════════
function initDuplicateChecks() {
    const idField    = document.getElementById('field_id_number');
    const firstField = document.getElementById('field_first_name');
    const lastField  = document.getElementById('field_last_name');
    const emailField = document.getElementById('field_email');

    if (idField) {
        idField.addEventListener('input', debounce(async () => {
            const val = idField.value.trim();
            if (!val) { setDupState(idField, 'dup_id_number', false, ''); return; }
            const { count } = await supabaseClient
                .from('students').select('student_id', { count: 'exact', head: true })
                .eq('id_number', val);
            setDupState(idField, 'dup_id_number', count > 0, 'Student ID already exists.');
        }, 450));
    }

    const nameCheck = debounce(async () => {
        const first = firstField?.value.trim();
        const last  = lastField?.value.trim();
        if (!first || !last) { setDupState(lastField, 'dup_full_name', false, ''); return; }
        const { count } = await supabaseClient
            .from('students').select('student_id', { count: 'exact', head: true })
            .ilike('first_name', first).ilike('last_name', last);
        setDupState(lastField, 'dup_full_name', count > 0, 'A student with this name already exists.');
    }, 500);

    if (firstField) firstField.addEventListener('input', nameCheck);
    if (lastField)  lastField.addEventListener('input',  nameCheck);

    if (emailField) {
        emailField.addEventListener('input', debounce(async () => {
            const val = emailField.value.trim();
            const msgEl = document.getElementById('dup_email');

            if (val && !/^[a-z]+_[a-z]+@plpasig\.edu\.ph$/i.test(val)) {
                setDupState(emailField, 'dup_email', true, 'Format must be: <strong>lastname_firstname@plpasig.edu.ph</strong>');
                return;
            }
            if (!val) { setDupState(emailField, 'dup_email', false, ''); return; }

            const { count } = await supabaseClient
                .from('students').select('student_id', { count: 'exact', head: true })
                .eq('email', val);
            setDupState(emailField, 'dup_email', count > 0, 'Email already in use.');
        }, 500));
    }

    // Clear errors on modal close
    document.querySelectorAll('#addStudentModal .close-modal').forEach(btn => {
        btn.addEventListener('click', clearAddStudentDups);
    });
}

function setDupState(field, msgElId, isDup, msg) {
    const msgEl = document.getElementById(msgElId);
    if (!field || !msgEl) return;
    if (isDup) {
        field.classList.add('dup-error');
        field.classList.remove('dup-ok');
        msgEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${msg}`;
        msgEl.classList.add('show');
        msgEl.classList.remove('ok');
    } else {
        field.classList.remove('dup-error');
        msgEl.classList.remove('show', 'ok');
        msgEl.innerHTML = '';
    }
}

function clearAddStudentDups() {
    ['field_id_number', 'field_first_name', 'field_last_name', 'field_email'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('dup-error', 'dup-ok');
    });
    ['dup_id_number', 'dup_full_name', 'dup_email'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('show', 'ok'); el.innerHTML = ''; }
    });
}

// ══════════════════════════════════════════════════════════
// 7. FACE REGISTRATION SEARCH (replaces search_student.php)
// ══════════════════════════════════════════════════════════
async function searchStudent() {
    const studentId = document.getElementById('studentIdSearch').value.trim();
    const searchBtn = document.getElementById('searchBtn');
    const searchResult = document.getElementById('searchResult');

    if (!studentId) { showToast('Please enter a Student ID.', false); return; }

    searchBtn.disabled = true;
    searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching...';

    try {
        const { data: s, error } = await supabaseClient
            .from('students')
            .select('id_number, first_name, middle_name, last_name, course, year_level, section, email, facial_dataset_path')
            .eq('id_number', studentId)
            .single();

        if (error || !s) {
            showToast('Student not found.', false);
            searchResult.classList.remove('active');
            return;
        }

        const hasFace = !!s.facial_dataset_path;
        document.getElementById('faceStatus').className = 'face-status ' + (hasFace ? 'registered' : 'not-registered');
        document.getElementById('faceStatus').innerHTML = hasFace
            ? '<i class="fa-solid fa-check-circle"></i> Facial data already registered'
            : '<i class="fa-solid fa-exclamation-circle"></i> Facial data not registered yet';

        const rb = document.getElementById('registerFaceBtn');
        rb.style.display = hasFace ? 'none' : 'block';
        rb.dataset.studentId = studentId;

    document.getElementById('studentInfo').innerHTML = `
            <div class="info-item"><label>Student ID</label><div class="value">${escHtml(s.id_number)}</div></div>
            <div class="info-item"><label>Full Name</label><div class="value">${escHtml(s.first_name)} ${escHtml(s.middle_name || '')} ${escHtml(s.last_name)}</div></div>
            <div class="info-item"><label>Course</label><div class="value">${escHtml(s.course || '-')}</div></div>
            <div class="info-item"><label>Year &amp; Section</label><div class="value">${s.year_level || ''}${escHtml(s.section || '')}</div></div>
            <div class="info-item"><label>Email</label><div class="value">${escHtml(s.email || '-')}</div></div>
        `;
        searchResult.classList.add('active');

    } catch (err) {
        showToast('Error: ' + err.message, false);
    } finally {
        searchBtn.disabled = false;
        searchBtn.innerHTML = '<i class="fa-solid fa-search"></i> Search Student';
    }
}

function openFaceRegModal(idNumber) {
    openModal('faceRegModal');
    document.getElementById('studentIdSearch').value = idNumber;
    searchStudent();
}

function redirectToFaceReg() {
    const sid = document.getElementById('registerFaceBtn').dataset.studentId;
    window.top.location.href = '../attendee/accountRegistration.html?student_id=' + sid;
}

// ══════════════════════════════════════════════════════════
// 8a. DOWNLOAD EXCEL TEMPLATE (replaces download_template.php)
//     Generates the same template as PhpSpreadsheet version
//     using SheetJS entirely client-side — no server needed.
// ══════════════════════════════════════════════════════════
async function downloadExcelTemplate() {
    // Load SheetJS on demand if not already loaded
    if (typeof XLSX === 'undefined') {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    }

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Student Import Template ──────────────────
    const headers = ['Student ID', 'First Name', 'Middle Name', 'Last Name',
                     'Course', 'Year Level', 'Section', 'Email'];

    const sampleData = [
        ['2300221', 'Juan',  'Dela',   'Cruz',   'Computer Science',       '3', 'A', 'cruz_juan@plpasig.edu.ph'],
        ['2300222', 'Maria', 'Santos', 'Garcia', 'Information Technology', '2', 'B', 'garcia_maria@plpasig.edu.ph'],
        ['2300223', 'Pedro', '',       'Reyes',  'Computer Engineering',   '1', 'A', 'reyes_pedro@plpasig.edu.ph'],
    ];

    const wsData = [headers, ...sampleData];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths (mirrors PhpSpreadsheet version)
    ws['!cols'] = [
        { wch: 15 }, // A - Student ID
        { wch: 20 }, // B - First Name
        { wch: 20 }, // C - Middle Name
        { wch: 20 }, // D - Last Name
        { wch: 25 }, // E - Course
        { wch: 12 }, // F - Year Level
        { wch: 15 }, // G - Section
        { wch: 30 }, // H - Email
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Student Import Template');

    // ── Sheet 2: Instructions ──────────────────────────────
    const instructions = [
        ['STUDENT IMPORT TEMPLATE - INSTRUCTIONS'],
        [''],
        ['Column Definitions:'],
        ['A - Student ID',   'Required', 'Unique 7-digit identifier (e.g., 2300221)'],
        ['B - First Name',   'Required', "Student's first name"],
        ['C - Middle Name',  'Optional', "Student's middle name"],
        ['D - Last Name',    'Required', "Student's last name"],
        ['E - Course',       'Optional', 'e.g., Computer Science, Information Technology'],
        ['F - Year Level',   'Optional', 'Number from 1-5'],
        ['G - Section',      'Optional', 'e.g., A, B (Just the letter without the year)'],
        ['H - Email',        'Optional', 'Must follow lastname_firstname@plpasig.edu.ph'],
        [''],
        ['Important Notes:'],
        ['1. Do NOT delete the header row (row 1)'],
        ['2. Student ID must be unique and exactly 7 digits'],
        ['3. First Name and Last Name are required'],
        ['4. Year Level must be a number between 1-5'],
        ['5. Email must follow: lastname_firstname@plpasig.edu.ph'],
        ['6. Delete the sample data rows before importing your own data'],
        ['7. Duplicate Student IDs will update the existing record'],
        [''],
        ['Tips:'],
        ['- You can copy and paste data from other spreadsheets'],
        ['- Make sure there are no empty rows between student records'],
        ['- The system will skip empty rows automatically'],
    ];

    const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
    wsInstructions['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 55 }];
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

    // Trigger download
    XLSX.writeFile(wb, 'student_import_template.xlsx');
}


// Column layout mirrors import_students.php + download_template.php:
//   A(0) Student ID | B(1) First Name | C(2) Middle Name | D(3) Last Name
//   E(4) Course     | F(5) Year Level  | G(6) Section     | H(7) Email
// Mirrors PHP ON DUPLICATE KEY UPDATE behaviour via Supabase upsert.
// ══════════════════════════════════════════════════════════
async function handleImport() {
    const fileInput   = document.getElementById('excelFile');
    const importBtn   = document.getElementById('importBtn');
    const progressDiv = document.getElementById('importProgress');
    const progressFill = document.getElementById('progressFill');
    const summaryDiv  = document.getElementById('importSummary');

    if (!fileInput.files[0]) { showToast('Please select an Excel file.', false); return; }

    // Dynamically load SheetJS if not already loaded
    if (typeof XLSX === 'undefined') {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    }

    progressDiv.style.display = 'block';
    importBtn.disabled = true;
    importBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing...';

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const wb   = XLSX.read(e.target.result, { type: 'array' });
            const ws   = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

            // Skip header row; skip fully empty rows
            const dataRows = rows.slice(1).filter(r => String(r[0] || '').trim() !== '');
            let successCount = 0;
            let errorCount   = 0;
            const errors     = [];

            for (let i = 0; i < dataRows.length; i++) {
                const r       = dataRows[i];
                const rowNum  = i + 2;  // human-readable row number (1-indexed + header)
                const pct     = Math.round(((i + 1) / dataRows.length) * 100);
                progressFill.style.width = pct + '%';
                progressFill.textContent = pct + '%';

                // ── Parse columns (mirrors import_students.php) ──
                const idNumber   = String(r[0] || '').trim();
                const firstName  = String(r[1] || '').trim();
                const middleName = String(r[2] || '').trim() || null;
                const lastName   = String(r[3] || '').trim();
                const course     = String(r[4] || '').trim() || null;
                const yearRaw    = r[5] !== '' ? parseInt(r[5]) : null;
                const section    = String(r[6] || '').trim() || null;
                const email      = String(r[7] || '').trim() || null; // col H = index 7

                // ── Validate required fields ──
                if (!idNumber || !firstName || !lastName) {
                    errors.push(`Row ${rowNum}: Missing required fields (ID, First Name, or Last Name)`);
                    errorCount++;
                    continue;
                }

                // ── Validate year level ──
                if (yearRaw !== null && (isNaN(yearRaw) || yearRaw < 1 || yearRaw > 5)) {
                    errors.push(`Row ${rowNum}: Invalid year level "${r[5]}" (must be 1–5)`);
                    errorCount++;
                    continue;
                }

                // ── Validate PLP email format ──
                if (email && !/^[a-z]+_[a-z]+@plpasig\.edu\.ph$/i.test(email)) {
                    errors.push(`Row ${rowNum}: Invalid email "${email}". Must be lastname_firstname@plpasig.edu.ph`);
                    errorCount++;
                    continue;
                }

                // ── Check if id_number already exists (upsert approach) ──
                const { data: existing } = await supabaseClient
                    .from('students')
                    .select('student_id')
                    .eq('id_number', idNumber)
                    .maybeSingle();

                let opError;
                if (existing) {
                    // UPDATE existing record (mirrors ON DUPLICATE KEY UPDATE)
                    const { error } = await supabaseClient
                        .from('students')
                        .update({
                            first_name:  firstName,
                            middle_name: middleName,
                            last_name:   lastName,
                            course,
                            year_level:  yearRaw,
                            section,
                            email,
                        })
                        .eq('student_id', existing.student_id);
                    opError = error;
                } else {
                    // INSERT new record — generate UUID for student_id
                    const { error } = await supabaseClient
                        .from('students')
                        .insert([{
                            student_id:  generateUUID(),   // ★ fix NOT NULL constraint
                            id_number:   idNumber,
                            first_name:  firstName,
                            middle_name: middleName,
                            last_name:   lastName,
                            course,
                            year_level:  yearRaw,
                            section,
                            email,
                            status:      'active',
                            password:    'changeme123',
                        }]);
                    opError = error;
                }

                if (opError) {
                    errors.push(`Row ${rowNum}: ${opError.message}`);
                    errorCount++;
                } else {
                    successCount++;
                }
            }

            summaryDiv.innerHTML = `
                <div class="success"><i class="fa-solid fa-check-circle"></i> Import completed!</div>
                <p><strong>Processed:</strong> ${dataRows.length}</p>
                <p><strong>Imported / Updated:</strong> <span class="success">${successCount}</span></p>
                ${errorCount > 0
                    ? `<p><strong>Errors:</strong> <span class="error">${errorCount}</span></p>
                       <ul style="margin-top:6px;font-size:12px;color:#dc2626;max-height:120px;overflow-y:auto">
                           ${errors.map(err => `<li>${err}</li>`).join('')}
                       </ul>`
                    : ''}
            `;

            if (successCount > 0) {
                setTimeout(async () => {
                    closeModal('importModal');
                    await loadStudents();
                }, 2500);
            }

        } catch (err) {
            summaryDiv.innerHTML = `<div class="error"><i class="fa-solid fa-exclamation-circle"></i> Parse error: ${err.message}</div>`;
        } finally {
            importBtn.disabled = false;
            importBtn.innerHTML = '<i class="fa-solid fa-upload"></i> Import Students';
        }
    };
    reader.readAsArrayBuffer(fileInput.files[0]);
}

function loadScript(src) {
    return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
    });
}

// ══════════════════════════════════════════════════════════
// 9. REPORT MODAL
// ══════════════════════════════════════════════════════════
async function buildReportRows() {
    // Enrich students with enrollment + attendance counts
    const enriched = [];
    for (const s of allStudents) {
        // enrolled subjects count
        const { count: enrolled } = await supabaseClient
            .from('schedule_enrollments')
            .select('enrollment_id', { count: 'exact', head: true })
            .eq('student_id', s.student_id)
            .eq('status', 'enrolled');

        // total attendances count
        const { count: attendances } = await supabaseClient
            .from('lab_attendance')
            .select('attendance_id', { count: 'exact', head: true })
            .eq('student_id', s.student_id);

        const dateReg = s.created_at
            ? new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
            : '-';

        enriched.push({
            id_number:        s.id_number,
            first_name:       s.first_name,
            middle_name:      s.middle_name || '—',
            last_name:        s.last_name,
            course:           s.course || '—',
            year_level:       s.year_level || '—',
            section:          s.section || '—',
            email:            s.email || '—',
            face_status:      s.facial_dataset_path ? 'Registered' : 'Not Registered',
            status:           s.status || 'active',
            enrolled_subjects: enrolled || 0,
            total_attendances: attendances || 0,
            date_registered:  dateReg,
        });
    }
    reportRows = enriched;
}

function openReportModal() {
    // Update chips
    document.getElementById('rmGenDate').innerHTML =
        `Generated ${META.date} &nbsp;·&nbsp; <span id="rmTotal">${META.total}</span> students`;
    document.getElementById('rmChipTotal').textContent      = META.total;
    document.getElementById('rmChipRegistered').textContent = META.registered;
    document.getElementById('rmChipPending').textContent    = META.pending;

    // Render table
    const tbody = document.getElementById('rmTableBody');
    if (!reportRows.length) {
        tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:#9ca3af">No data available.</td></tr>`;
    } else {
        tbody.innerHTML = reportRows.map((r, i) => `<tr>
            <td style="color:#9ca3af;font-size:11px">${i + 1}</td>
            <td style="font-weight:700;color:#166534;font-size:12px">${escHtml(r.id_number)}</td>
            <td style="font-weight:600">${escHtml(r.last_name)}</td>
            <td>${escHtml(r.first_name)}</td>
            <td style="color:#6b7280">${escHtml(r.middle_name)}</td>
            <td style="font-size:12px">${escHtml(r.course)}</td>
            <td style="text-align:center">${escHtml(String(r.year_level))}</td>
            <td style="text-align:center">${escHtml(r.section)}</td>
            <td><span class="rm-badge ${r.face_status === 'Registered' ? 'registered' : 'not-registered'}">${r.face_status}</span></td>
            <td><span class="rm-badge ${r.status.toLowerCase()}">${capitalize(r.status)}</span></td>
            <td style="text-align:center"><strong>${r.enrolled_subjects}</strong></td>
            <td style="text-align:center"><strong>${r.total_attendances}</strong></td>
            <td style="font-size:11.5px;color:#6b7280">${escHtml(r.email)}</td>
            <td style="font-size:11.5px;color:#6b7280;white-space:nowrap">${r.date_registered}</td>
        </tr>`).join('');
    }

    document.getElementById('rmOverlay').classList.add('on');
}

function closeReportModal() {
    document.getElementById('rmOverlay').classList.remove('on');
}

// ── Print ──────────────────────────────────────────────────
function printReport() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const rows = reportRows.map((r, i) => `<tr class="${i % 2 === 1 ? 'even' : ''}">
        <td>${i + 1}</td>
        <td><strong>${r.id_number}</strong></td>
        <td><strong>${r.last_name}</strong></td>
        <td>${r.first_name}</td>
        <td>${r.middle_name}</td>
        <td>${r.course}</td>
        <td style="text-align:center">${r.year_level}</td>
        <td style="text-align:center">${r.section}</td>
        <td><span class="badge ${r.face_status.toLowerCase() === 'registered' ? 'b-green' : 'b-amber'}">${r.face_status}</span></td>
        <td><span class="badge ${r.status.toLowerCase() === 'active' ? 'b-green' : r.status.toLowerCase() === 'inactive' ? 'b-red' : 'b-blue'}">${r.status}</span></td>
        <td style="text-align:center">${r.enrolled_subjects}</td>
        <td style="text-align:center">${r.total_attendances}</td>
        <td style="font-size:9px">${r.email}</td>
        <td>${r.date_registered}</td>
    </tr>`).join('');

    const cols = ['#','Student ID','Last Name','First Name','Middle Name','Course','Year','Section','Face Status','Status','Subjects','Attendances','Email','Date Registered'];

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Students List Report</title>
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Nunito+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Nunito Sans',Arial,sans-serif;background:#fff;color:#1a2e1f;font-size:10px;line-height:1.5}
    .page-header{background:linear-gradient(135deg,#14532d 0%,#166534 60%,#15803d 100%);color:#fff;padding:16px 24px}
    .header-inner{display:flex;align-items:center;justify-content:center;gap:16px}
    .header-center{text-align:center}
    .school-label{font-size:7.5px;font-weight:600;letter-spacing:1.8px;text-transform:uppercase;color:rgba(255,255,255,0.65);margin-bottom:4px}
    .report-title{font-size:16px;font-weight:800;font-family:'Nunito',sans-serif;color:#fff;margin-bottom:3px}
    .report-sub{font-size:8.5px;color:rgba(255,255,255,0.6)}
    .meta-bar{display:flex;align-items:stretch;background:#f0fdf4;border-bottom:2px solid #bbf7d0;padding:0 24px}
    .meta-item{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:7px 14px;font-size:9px}
    .meta-item+.meta-item{border-left:1px solid #bbf7d0}
    .meta-item .lbl{color:#6b7280;font-weight:400;font-size:8px}
    .meta-item strong{color:#166534;font-size:9px}
    .table-wrap{padding:14px 24px 0}
    table{width:100%;border-collapse:collapse;font-size:9px}
    thead tr{background:linear-gradient(90deg,#14532d,#166534)}
    th{padding:8px 10px;text-align:left;font-size:8px;font-weight:700;letter-spacing:0.7px;text-transform:uppercase;color:#fff;white-space:nowrap}
    tbody tr{border-bottom:1px solid #e9f5ee}
    tbody tr.even{background:#f7fdf9}
    td{padding:6px 10px;color:#1a2e1f;vertical-align:middle}
    .badge{display:inline-block;padding:2px 7px;border-radius:20px;font-size:7.5px;font-weight:700}
    .b-green{background:#dcfce7;color:#166534;border:1px solid #bbf7d0}
    .b-red{background:#fee2e2;color:#dc2626;border:1px solid #fecaca}
    .b-amber{background:#fef3c7;color:#92400e;border:1px solid #fde68a}
    .b-blue{background:#dbeafe;color:#1d4ed8;border:1px solid #bfdbfe}
    .page-footer{margin-top:16px;border-top:2px solid #e9f5ee;padding:8px 24px;display:flex;justify-content:space-between;align-items:center;font-size:8px;color:#9ca3af}
    @page{size:A4 landscape;margin:8mm}
    @media print{thead tr,tbody tr.even,.badge{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <div class="page-header"><div class="header-inner"><div class="header-center">
        <div class="school-label">Pamantasan ng Lungsod ng Pasig &middot; College of Computer Studies</div>
        <div class="report-title">Students List Report</div>
        <div class="report-sub">Laboratory Attendance System &middot; Official Report Document</div>
    </div></div></div>
    <div class="meta-bar">
        <div class="meta-item"><span class="lbl">Date</span><strong>${dateStr}</strong></div>
        <div class="meta-item"><span class="lbl">Time</span><strong>${timeStr}</strong></div>
        <div class="meta-item"><span class="lbl">Total Students</span><strong>${META.total}</strong></div>
        <div class="meta-item"><span class="lbl">Face Registered</span><strong>${META.registered}</strong></div>
        <div class="meta-item"><span class="lbl">Pending Face</span><strong>${META.pending}</strong></div>
    </div>
    <div class="table-wrap"><table>
        <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
    </table></div>
    <div class="page-footer">
        <span>&copy; ${now.getFullYear()} Laboratory Attendance System &middot; Pamantasan ng Lungsod ng Pasig</span>
        <span>Generated: ${dateStr} at ${timeStr}</span>
    </div>
    <script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script>
    </body></html>`);
    w.document.close();
}

// ── PDF ────────────────────────────────────────────────────
function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;
    const margin = 10;
    const cx = pageW / 2;
    const headerH = 32;

    doc.setFillColor(20, 83, 45);
    doc.rect(0, 0, pageW, headerH, 'F');
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 220, 180);
    doc.text('PAMANTASAN NG LUNGSOD NG PASIG  ·  COLLEGE OF COMPUTER STUDIES', cx, 10, { align: 'center' });
    doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('Students List Report', cx, 20, { align: 'center' });
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 220, 180);
    doc.text('Laboratory Attendance System  ·  Official Report Document', cx, 27, { align: 'center' });

    const metaY = headerH;
    const metaH = 12;
    doc.setFillColor(240, 253, 244);
    doc.rect(0, metaY, pageW, metaH, 'F');
    doc.setDrawColor(187, 247, 208); doc.setLineWidth(0.4);
    doc.line(0, metaY + metaH, pageW, metaY + metaH);

    [['Date', dateStr], ['Time', timeStr], ['Total Students', String(META.total)],
     ['Face Registered', String(META.registered)], ['Pending Face', String(META.pending)]
    ].forEach(([lbl, val], i, arr) => {
        const mx = i * (pageW / arr.length) + (pageW / arr.length) / 2;
        doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
        doc.text(lbl, mx, metaY + 4.5, { align: 'center' });
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 101, 52);
        doc.text(val, mx, metaY + 9.5, { align: 'center' });
        if (i > 0) { doc.setDrawColor(187, 247, 208); doc.setLineWidth(0.3); doc.line(i * (pageW / arr.length), metaY + 1, i * (pageW / arr.length), metaY + metaH - 1); }
    });

    const head = [['#','Student ID','Last Name','First Name','Middle Name','Course','Year','Section','Face Status','Status','Subjects','Attendances','Email','Date Registered']];
    const body = reportRows.map((r, i) => [
        i + 1, r.id_number, r.last_name, r.first_name, r.middle_name,
        r.course, r.year_level, r.section, r.face_status, capitalize(r.status),
        r.enrolled_subjects, r.total_attendances, r.email, r.date_registered
    ]);

    doc.autoTable({
        head, body,
        startY: metaY + metaH + 3,
        margin: { left: margin, right: margin },
        theme: 'striped',
        headStyles: { fillColor: [20, 83, 45], fontSize: 7, fontStyle: 'bold', textColor: [255, 255, 255], cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } },
        alternateRowStyles: { fillColor: [247, 253, 249] },
        styles: { fontSize: 7.5, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, textColor: [26, 46, 31], lineColor: [233, 245, 238], lineWidth: 0.2 },
        didParseCell(d) {
            if (d.column.index === 8 && d.section === 'body') {
                const s = (d.cell.text[0] || '').toLowerCase();
                if (s === 'registered')     { d.cell.styles.fillColor = [220, 252, 231]; d.cell.styles.textColor = [22, 101, 52]; d.cell.styles.fontStyle = 'bold'; }
                if (s === 'not registered') { d.cell.styles.fillColor = [254, 243, 199]; d.cell.styles.textColor = [146, 64, 14]; d.cell.styles.fontStyle = 'bold'; }
            }
            if (d.column.index === 9 && d.section === 'body') {
                const s = (d.cell.text[0] || '').toLowerCase();
                if (s === 'active')    { d.cell.styles.fillColor = [220, 252, 231]; d.cell.styles.textColor = [22, 101, 52]; d.cell.styles.fontStyle = 'bold'; }
                if (s === 'inactive')  { d.cell.styles.fillColor = [254, 226, 226]; d.cell.styles.textColor = [185, 28, 28]; d.cell.styles.fontStyle = 'bold'; }
                if (s === 'graduated') { d.cell.styles.fillColor = [219, 234, 254]; d.cell.styles.textColor = [29, 78, 216]; d.cell.styles.fontStyle = 'bold'; }
            }
        }
    });

    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        const footY = pageH - 7;
        doc.setFillColor(249, 250, 251); doc.rect(0, footY - 4, pageW, 11, 'F');
        doc.setDrawColor(233, 245, 238); doc.setLineWidth(0.3); doc.line(0, footY - 4, pageW, footY - 4);
        doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(156, 163, 175);
        doc.text(`\u00a9 ${now.getFullYear()} Laboratory Attendance System  ·  Pamantasan ng Lungsod ng Pasig`, margin, footY);
        doc.text(`Generated: ${dateStr} at ${timeStr}  ·  Page ${i} of ${pages}`, pageW - margin, footY, { align: 'right' });
    }

    doc.save(`Students_Report_${now.toISOString().split('T')[0]}.pdf`);
}

// ── CSV ────────────────────────────────────────────────────
function exportCSV() {
    const cols = ['#','Student ID','Last Name','First Name','Middle Name','Course','Year Level',
                  'Section','Face Status','Status','Enrolled Subjects','Total Attendances',
                  'Email','Date Registered'];
    const lines = [
        cols.join(','),
        ...reportRows.map((r, i) => [
            i + 1, `"${r.id_number}"`, `"${r.last_name}"`, `"${r.first_name}"`, `"${r.middle_name}"`,
            `"${r.course}"`, r.year_level, `"${r.section}"`, `"${r.face_status}"`, r.status,
            r.enrolled_subjects, r.total_attendances, `"${r.email}"`, `"${r.date_registered}"`
        ].join(','))
    ];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `Students_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('CSV exported!', false);
}

// ══════════════════════════════════════════════════════════
// 10. MODAL HELPERS
// ══════════════════════════════════════════════════════════
function openModal(id) {
    const m = document.getElementById(id);
    m.style.display = 'flex';
    setTimeout(() => m.classList.add('active'), 10);
}

function closeModal(id) {
    const m = document.getElementById(id);
    m.classList.remove('active');
    setTimeout(() => {
        m.style.display = 'none';
        if (id === 'importModal') {
            document.getElementById('excelFile').value = '';
            document.getElementById('importProgress').style.display = 'none';
            document.getElementById('importSummary').innerHTML = '';
        }
        if (id === 'faceRegModal') {
            document.getElementById('studentIdSearch').value = '';
            document.getElementById('searchResult').classList.remove('active');
        }
        if (id === 'addStudentModal') {
            document.getElementById('addStudentForm').reset();
            clearAddStudentDups();
        }
    }, 200);
}

window.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeReportModal();
        ['addStudentModal', 'importModal', 'faceRegModal'].forEach(id => {
            const m = document.getElementById(id);
            if (m && m.classList.contains('active')) closeModal(id);
        });
    }
});

// ══════════════════════════════════════════════════════════
// 11. UTILITIES
// ══════════════════════════════════════════════════════════
function showToast(msg, showLink) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    t.classList.add('on');
    setTimeout(() => t.classList.remove('on'), 4000);
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function debounce(fn, ms) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}