/* ═══════════════════════════════════════════════════════════
   subjects.js — Subjects Management Logic (Supabase)
   TimeInAndTimeOutMonitoring / resc / js / subjects.js
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ── State ──────────────────────────────────────────────────
let allSubjects  = [];   // raw rows from Supabase (with counts joined)
let reportRows   = [];   // processed rows for the report modal

// Cached summary stats
let metaStats = { total: 0, schedules: 0, units: 0 };

// ── Report state (mirrors laboratories.js) ─────────────────
let existingReportsToday = []; // stores objects: { name, dataString }

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!supabaseClient) {
        console.error('Supabase client not initialised. Check config/.env.js');
        return;
    }
    loadSubjects();
    bindEvents();
});

// ══════════════════════════════════════════════════════════
// DATA LOADING
// ══════════════════════════════════════════════════════════

async function loadSubjects() {
    setTableLoading(true);

    try {
        // 1. Fetch all subjects
        const { data: subjects, error: subErr } = await supabaseClient
            .from('subjects')
            .select('*')
            .order('subject_code', { ascending: true });

        if (subErr) throw subErr;

        // 2. Fetch active schedule counts per subject
        const { data: schedules, error: schErr } = await supabaseClient
            .from('lab_schedules')
            .select('schedule_id, subject_id')
            .eq('status', 'active');

        if (schErr) throw schErr;

        // 3. Fetch enrolled student counts per schedule
        const { data: enrollments, error: enrErr } = await supabaseClient
            .from('schedule_enrollments')
            .select('schedule_id, student_id')
            .eq('status', 'enrolled');

        if (enrErr) throw enrErr;

        // 4. Fetch completed session counts per schedule
        const { data: sessions, error: sesErr } = await supabaseClient
            .from('lab_sessions')
            .select('session_id, schedule_id, status');

        if (sesErr) throw sesErr;

        // ── Aggregate ──
        const schedulesBySubject = {};
        const activeScheduleIds  = new Set();

        (schedules || []).forEach(s => {
            if (!schedulesBySubject[s.subject_id]) {
                schedulesBySubject[s.subject_id] = new Set();
            }
            schedulesBySubject[s.subject_id].add(s.schedule_id);
            activeScheduleIds.add(s.schedule_id);
        });

        const enrolledPerSchedule = {};
        (enrollments || []).forEach(e => {
            if (!enrolledPerSchedule[e.schedule_id]) {
                enrolledPerSchedule[e.schedule_id] = new Set();
            }
            enrolledPerSchedule[e.schedule_id].add(e.student_id);
        });

        const completedPerSchedule = {};
        (sessions || []).filter(s => s.status === 'completed').forEach(s => {
            completedPerSchedule[s.schedule_id] = (completedPerSchedule[s.schedule_id] || 0) + 1;
        });

        allSubjects = (subjects || []).map(sub => {
            const subjectSchedules = schedulesBySubject[sub.subject_id] || new Set();
            const scheduleCount    = subjectSchedules.size;

            const studentSet = new Set();
            subjectSchedules.forEach(schId => {
                (enrolledPerSchedule[schId] || new Set()).forEach(stId => studentSet.add(stId));
            });
            const enrolledStudents = studentSet.size;

            let sessionsDone = 0;
            subjectSchedules.forEach(schId => {
                sessionsDone += (completedPerSchedule[schId] || 0);
            });

            return {
                ...sub,
                schedule_count:    scheduleCount,
                enrolled_students: enrolledStudents,
                sessions_done:     sessionsDone,
            };
        });

        const totalUnits      = allSubjects.reduce((sum, s) => sum + (parseFloat(s.units) || 0), 0);
        const activeSchedules = schedules ? schedules.length : 0;

        metaStats = {
            total:     allSubjects.length,
            schedules: activeSchedules,
            units:     totalUnits,
        };

        reportRows = allSubjects.map(s => ({
            subject_code:      s.subject_code,
            subject_name:      s.subject_name,
            description:       s.description || '',
            units:             s.units || 0,
            active_schedules:  s.schedule_count,
            enrolled_students: s.enrolled_students,
            sessions_done:     s.sessions_done,
        }));

        updateBadges();
        renderTable(allSubjects);

    } catch (err) {
        console.error('loadSubjects error:', err);
        showTableError('Failed to load subjects: ' + (err.message || err));
    }
}

// ══════════════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════════════

function updateBadges() {
    setText('badgeTotalSubjects',   metaStats.total);
    setText('badgeActiveSchedules', metaStats.schedules);
    setText('badgeTotalUnits',      metaStats.units);

    setText('rmTotalSubjects',   metaStats.total);
    setText('rmActiveSchedules', metaStats.schedules);
    setText('rmTotalUnits',      metaStats.units);

    const now = new Date();
    setText('rmGenDate', `Generated: ${now.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })}`);
}

function renderTable(rows) {
    const tbody = document.getElementById('subjectsTableBody');
    if (!rows || rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-cell">
                    <i class="fa-solid fa-book" style="font-size:36px;display:block;margin-bottom:10px;color:#dcfce7"></i>
                    No subjects found.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = rows.map(s => {
        const desc = s.description
            ? escHtml(s.description.length > 50 ? s.description.substring(0, 50) + '…' : s.description)
            : '<span style="color:#999;font-style:italic">No description</span>';

        const unitsLabel = s.units
            ? `${s.units} unit${s.units != 1 ? 's' : ''}`
            : '-';

        return `
        <tr>
            <td><span class="subject-code">${escHtml(s.subject_code)}</span></td>
            <td><span class="subject-name">${escHtml(s.subject_name)}</span></td>
            <td>${desc}</td>
            <td><span class="badge units">${unitsLabel}</span></td>
            <td><span class="badge schedules"><i class="fa-solid fa-calendar"></i> ${s.schedule_count}</span></td>
            <td><span class="badge students"><i class="fa-solid fa-users"></i> ${s.enrolled_students}</span></td>
            <td>
                <div style="display:flex;gap:8px">
                    <button class="btn-edit" title="Edit subject" onclick='editSubject(${JSON.stringify(s)})'>
                        <i class="fa-solid fa-edit"></i>
                    </button>
                    <button class="btn-delete" title="Delete subject" onclick="deleteSubject('${s.subject_id}', '${escHtml(s.subject_code)}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function renderReportTable() {
    const tbody = document.getElementById('reportTableBody');
    if (!reportRows || reportRows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center;padding:60px;color:#9ca3af">
                    <i class="fa-solid fa-book" style="font-size:48px;margin-bottom:16px;display:block;color:#dcfce7"></i>
                    No subject data found.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = reportRows.map((r, i) => {
        const desc = r.description.length > 70
            ? escHtml(r.description.substring(0, 70)) + '…'
            : escHtml(r.description);
        return `
        <tr>
            <td style="color:#9ca3af;font-size:12px">${i + 1}</td>
            <td><strong style="color:#166534;font-size:14px">${escHtml(r.subject_code)}</strong></td>
            <td>${escHtml(r.subject_name)}</td>
            <td style="text-align:center">
                <span style="background:#fff3cd;color:#92400e;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700">
                    ${r.units} ${r.units == 1 ? 'unit' : 'units'}
                </span>
            </td>
            <td style="text-align:center"><strong>${r.active_schedules}</strong></td>
            <td style="text-align:center"><strong>${r.enrolled_students}</strong></td>
            <td style="text-align:center"><strong>${r.sessions_done}</strong></td>
            <td style="font-size:12px;color:#6b7280;max-width:220px;word-break:break-word">${desc}</td>
        </tr>`;
    }).join('');
}

// ══════════════════════════════════════════════════════════
// CRUD OPERATIONS (Supabase)
// ══════════════════════════════════════════════════════════

document.getElementById('subjectForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const subjectId   = document.getElementById('subjectId').value.trim();
    const subjectCode = document.getElementById('subjectCode').value.trim();
    const subjectName = document.getElementById('subjectName').value.trim();
    const units       = document.getElementById('units').value;
    const description = document.getElementById('description').value.trim();
    const isEdit      = subjectId !== '';

    if (!subjectCode || subjectCode.length < 3) {
        return showValidationError('Subject Code must be at least 3 characters.');
    }
    if (!/^[A-Z0-9]+$/.test(subjectCode)) {
        return showValidationError('Subject Code can only contain uppercase letters and numbers.');
    }
    if (!subjectName || subjectName.length < 5) {
        return showValidationError('Subject Name must be at least 5 characters.');
    }
    if (subjectName.length > 200) {
        return showValidationError('Subject Name is too long (max 200 characters).');
    }
    if (!units) {
        return showValidationError('Units is required.');
    }
    const unitsVal = parseFloat(units);
    if (isNaN(unitsVal) || unitsVal < 0 || unitsVal > 10) {
        return showValidationError('Units must be between 0 and 10.');
    }
    if ((unitsVal * 2) % 1 !== 0) {
        return showValidationError('Units must be in increments of 0.5 (e.g., 1.0, 1.5, 2.0).');
    }
    if (description.length > 500) {
        return showValidationError('Description is too long (max 500 characters).');
    }

    const btn  = this.querySelector('.btn-submit');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking duplicates…';

    try {
        let dupQuery = supabaseClient
            .from('subjects')
            .select('subject_id, subject_code, subject_name')
            .or(`subject_code.eq.${subjectCode},subject_name.ilike.${subjectName}`);

        if (isEdit) {
            dupQuery = dupQuery.neq('subject_id', subjectId);
        }

        const { data: dups, error: dupErr } = await dupQuery;
        if (dupErr) throw dupErr;

        const dupCode = dups && dups.some(d => d.subject_code === subjectCode);
        const dupName = dups && dups.some(d => d.subject_name.toLowerCase() === subjectName.toLowerCase());

        if (dupCode || dupName) {
            const msgs = [];
            if (dupCode) msgs.push(`Subject code "${subjectCode}" already exists`);
            if (dupName) msgs.push('A subject with this name already exists');
            showValidationError(msgs.join('. '));
            btn.disabled = false;
            btn.innerHTML = orig;
            return;
        }

        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

        const payload = {
            subject_code: subjectCode,
            subject_name: subjectName,
            units:        unitsVal,
            description:  description || null,
            updated_at:   new Date().toISOString(),
        };

        let saveErr;
        if (isEdit) {
            const { error } = await supabaseClient
                .from('subjects')
                .update(payload)
                .eq('subject_id', subjectId);
            saveErr = error;
        } else {
            const { error } = await supabaseClient
                .from('subjects')
                .insert({ ...payload });
            saveErr = error;
        }

        if (saveErr) throw saveErr;

        showToast(isEdit ? 'Subject updated successfully!' : 'Subject added successfully!');
        closeModal();
        await loadSubjects();

    } catch (err) {
        console.error('Save subject error:', err);
        showValidationError(err.message || 'An error occurred. Please try again.');
        btn.disabled = false;
        btn.innerHTML = orig;
    }
});

async function deleteSubject(subjectId, subjectCode) {
    const confirmed = confirm(`Delete subject "${subjectCode}"?\n\nThis may affect associated schedules and enrollments.`);
    if (!confirmed) return;

    try {
        const { data: linked, error: chkErr } = await supabaseClient
            .from('lab_schedules')
            .select('schedule_id')
            .eq('subject_id', subjectId)
            .eq('status', 'active')
            .limit(1);

        if (chkErr) throw chkErr;

        if (linked && linked.length > 0) {
            alert(`Cannot delete "${subjectCode}" — it has active schedules. Deactivate those schedules first.`);
            return;
        }

        const { error } = await supabaseClient
            .from('subjects')
            .delete()
            .eq('subject_id', subjectId);

        if (error) throw error;

        showToast(`"${subjectCode}" deleted successfully.`);
        await loadSubjects();

    } catch (err) {
        console.error('Delete subject error:', err);
        alert('Error deleting subject: ' + (err.message || err));
    }
}

// ══════════════════════════════════════════════════════════
// MODAL HELPERS
// ══════════════════════════════════════════════════════════

function openAddModal() {
    document.getElementById('subjectForm').reset();
    document.getElementById('subjectId').value = '';
    document.getElementById('modalTitle').innerHTML = '<i class="fa-solid fa-plus"></i> Add Subject';
    document.getElementById('submitBtnText').textContent = 'Add Subject';
    clearAllValidation();
    openModal();
}

function editSubject(subject) {
    document.getElementById('subjectId').value    = subject.subject_id;
    document.getElementById('subjectCode').value  = subject.subject_code;
    document.getElementById('subjectName').value  = subject.subject_name;
    document.getElementById('description').value  = subject.description || '';
    document.getElementById('units').value        = subject.units || '';
    document.getElementById('modalTitle').innerHTML = '<i class="fa-solid fa-edit"></i> Edit Subject';
    document.getElementById('submitBtnText').textContent = 'Update Subject';
    clearAllValidation();
    openModal();
}

function openModal() {
    document.getElementById('subjectModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('subjectModal').classList.remove('active');
    document.body.style.overflow = '';
    setTimeout(clearAllValidation, 300);
}

// ══════════════════════════════════════════════════════════
// REPORT MODAL & EXPORT (WITH DUPLICATE PREVENTION & GREEN BANNER)
// ══════════════════════════════════════════════════════════

// ── LOGO STRINGS (Base64 bypasses CORS/Local path issues for PDF) ──
const PLP_LOGO_B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; 
const CCS_LOGO_B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function openReportModal() {
    document.getElementById('rmOverlay').classList.add('on');
    renderReportTable();

    // ── PRE-FETCH TODAY'S REPORTS TO PREVENT EXACT DUPLICATES ──
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    try {
        const { data } = await supabaseClient
            .from('las_reports')
            .select('report_name, report_data')
            .eq('report_type', 'subjects')
            .like('report_name', `%${dateStr}%`);

        if (data) {
            existingReportsToday = data.map(d => ({
                name:       d.report_name,
                dataString: typeof d.report_data === 'string' ? d.report_data : JSON.stringify(d.report_data)
            }));
        } else {
            existingReportsToday = [];
        }
    } catch (e) {
        existingReportsToday = [];
    }
}

function closeReportModal() {
    document.getElementById('rmOverlay').classList.remove('on');
}

// ── Smart Duplicate Check Helper ──────────────────────────
function checkDuplicateWarning(exportType) {
    const dateStr    = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const reportName = `Subjects Report — ${dateStr} (${exportType})`;
    const currentDataString = JSON.stringify(reportRows);

    const isExactDuplicate = existingReportsToday.some(r =>
        r.name === reportName && r.dataString === currentDataString
    );

    if (isExactDuplicate) {
        return confirm(`A ${exportType} report with this EXACT data has already been saved today.\n\nAre you sure you want to generate a duplicate?`);
    }
    return true;
}

// ── Save to Reports (Manual Button) ──────────────────────
async function saveReport() {
    if (!checkDuplicateWarning('Manual Save')) return;

    const btn = document.querySelector('.rm-btn[onclick="saveReport()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }

    await autoSaveReport('Manual Save');

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save to Reports';
    }
}

// ── Auto-save helper ──────────────────────────────────────
async function autoSaveReport(exportType) {
    const dateStr    = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const reportName = `Subjects Report — ${dateStr} (${exportType})`;

    const payload = {
        report_type: 'subjects',
        report_name: reportName,
        filters:     JSON.stringify({}),
        report_data: JSON.stringify(reportRows),
    };

    try {
        const { error } = await supabaseClient.from('las_reports').insert([payload]);
        if (error) throw error;

        if (exportType === 'Manual Save') {
            showToast('Report saved successfully!');
        } else {
            showToast(`${exportType} downloaded & report saved!`);
        }

        // Add to local memory to prevent immediate repeated clicks
        existingReportsToday.push({
            name:       payload.report_name,
            dataString: payload.report_data,
        });

    } catch (err) {
        console.error('Auto-save error:', err);
        showToast('Action complete but failed to save report: ' + err.message, true);
    }
}

// ── Print ─────────────────────────────────────────────────
async function printReport() {
    if (!checkDuplicateWarning('Print')) return;

    const cols = ['#', 'Subject Code', 'Subject Name', 'Units', 'Active Schedules', 'Enrolled Students', 'Sessions Done', 'Description'];
    const nowStr = new Date().toLocaleString();

    const rows = reportRows.map((r, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><strong>${escHtml(r.subject_code)}</strong></td>
            <td>${escHtml(r.subject_name)}</td>
            <td style="text-align:center">${r.units} ${r.units == 1 ? 'unit' : 'units'}</td>
            <td style="text-align:center">${r.active_schedules}</td>
            <td style="text-align:center">${r.enrolled_students}</td>
            <td style="text-align:center">${r.sessions_done}</td>
            <td style="font-size:10px">${escHtml(r.description.substring(0, 70))}</td>
        </tr>`).join('');

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>Subjects Report</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;padding:20px;font-size:11px;color:#111}
        
        /* ── GREEN BANNER HEADER STYLE ── */
        .header-container { 
            background-color: #166534; 
            color: white;
            text-align: center; 
            margin-bottom: 20px; 
            padding: 20px 15px; 
            border-radius: 8px;
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
        }
        .logos-text-wrapper { display: flex; justify-content: center; align-items: center; gap: 25px; margin-bottom: 10px; }
        .logo-img { height: 50px; width: auto; object-fit: contain; }
        .univ-title { font-size: 18px; font-weight: bold; color: white; line-height: 1.2; letter-spacing: 0.5px;}
        .college-title { font-size: 11px; color: #bbf7d0; letter-spacing: 1px; text-transform: uppercase;}
        .report-title { font-size: 16px; font-weight: bold; color: white; margin-top: 12px; text-transform: uppercase; letter-spacing: 1px;}
        .report-meta { font-size: 11px; color: #bbf7d0; margin-top: 5px; }
        
        table{width:100%;border-collapse:collapse; margin-top: 10px;}
        th{background:#166534;color:#fff;padding:8px 10px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px; -webkit-print-color-adjust: exact; print-color-adjust: exact;}
        td{padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:11px; text-align:center;}
        td:nth-child(2), td:nth-child(3), td:nth-child(8) {text-align:left;} /* Left align specific columns */
        tr:nth-child(even){background:#f9fafb; -webkit-print-color-adjust: exact; print-color-adjust: exact;}
        .footer{margin-top:20px;text-align:center;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:10px}
        @media print{body{padding:0px}}
    </style></head><body>
    
    <div class="header-container">
        <div class="logos-text-wrapper">
            <img src="../../auth/assets/plplogo.png" class="logo-img" alt="PLP Logo">
            <div>
                <div class="univ-title">PAMANTASAN NG LUNGSOD NG PASIG</div>
                <div class="college-title">College of Computer Studies</div>
            </div>
            <img src="../../auth/assets/ccslogo.png" class="logo-img" alt="CCS Logo">
        </div>
        <div class="report-title">Subjects Report</div>
        <div class="report-meta">Generated: ${nowStr} &nbsp;&middot;&nbsp; Total Subjects: ${metaStats.total} &nbsp;&middot;&nbsp; Active Schedules: ${metaStats.schedules} &nbsp;&middot;&nbsp; Total Units: ${metaStats.units}</div>
    </div>

    <table>
        <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
    </table>
    <div class="footer">Laboratory Attendance System &nbsp;&middot;&nbsp; ${nowStr}</div>
    <script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script>
    </body></html>`);
    w.document.close();

    await autoSaveReport('Print');
}
// ── Download PDF ──────────────────────────────────────────
async function downloadPDF() {
    if (!checkDuplicateWarning('PDF')) return;

    if (!window.jspdf) {
        showToast('PDF library not loaded yet. Please try again.', true);
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
        const pageW = doc.internal.pageSize.width;
        const nowStr = new Date().toLocaleString();

        // Helper to safely load the logos without breaking if an image fails
        function loadImage(src) {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width; canvas.height = img.height;
                        canvas.getContext('2d').drawImage(img, 0, 0);
                        resolve(canvas.toDataURL('image/png'));
                    } catch(e) {
                        resolve(null); // Fallback safely if canvas gets tainted
                    }
                };
                img.onerror = () => resolve(null);
                img.src = src;
            });
        }

        // FIX 1: Used the correct paths to your resc/assets folder!
        const [plpData, ccsData] = await Promise.all([
            loadImage('../resc/assets/plp_logo.png'),
            loadImage('../resc/assets/ccs_logo.png')
        ]);

        const centerX = pageW / 2;
        const headerHeight = 45; // Height of the green banner
        
        // ── DRAW SOLID GREEN BANNER ──
        doc.setFillColor(22, 101, 52); 
        doc.rect(0, 0, pageW, headerHeight, 'F');
        
        // ── LOGOS ──
        const logoSize = 18;
        if (plpData) doc.addImage(plpData, 'PNG', centerX - 85, 8, logoSize, logoSize);
        if (ccsData) doc.addImage(ccsData, 'PNG', centerX + 67, 8, logoSize, logoSize);

        // ── CENTERED HEADER TEXT ──
        doc.setFontSize(16); 
        doc.setTextColor(255, 255, 255); 
        doc.setFont('helvetica', 'bold');
        doc.text('PAMANTASAN NG LUNGSOD NG PASIG', centerX, 15, { align: 'center' });
        
        doc.setFontSize(9); 
        doc.setTextColor(187, 247, 208); 
        doc.setFont('helvetica', 'normal');
        doc.text('COLLEGE OF COMPUTER STUDIES', centerX, 20, { align: 'center' });
        
        doc.setFontSize(14); 
        doc.setTextColor(255, 255, 255); 
        doc.setFont('helvetica', 'bold');
        doc.text('SUBJECTS REPORT', centerX, 30, { align: 'center' });
        
        doc.setFontSize(8); 
        doc.setTextColor(187, 247, 208); 
        doc.setFont('helvetica', 'normal');
        
        // FIX 2: Used 'metaStats' instead of 'META'
        doc.text(`Generated: ${nowStr}  ·  Total Subjects: ${metaStats.total}  ·  Active Schedules: ${metaStats.schedules}  ·  Total Units: ${metaStats.units}`, centerX, 36, { align: 'center' });

        // ── AUTO-EXPANDING CLEAN TABLE ──
        doc.autoTable({
            head: [['#', 'Subject Code', 'Subject Name', 'Units', 'Active\nSchedules', 'Enrolled\nStudents', 'Sessions\nDone', 'Description']],
            
            // FIX 3: Used 'reportRows' instead of 'ROWS'
            body: reportRows.map((r, i) => {
                const desc = r.description ? String(r.description) : '—';
                return [
                    i + 1,
                    r.subject_code,
                    r.subject_name,
                    r.units + (r.units == 1 ? ' unit' : ' units'),
                    r.active_schedules,
                    r.enrolled_students,
                    r.sessions_done,
                    desc.length > 50 ? desc.substring(0, 50) + '...' : desc,
                ];
            }),
            startY: headerHeight + 8, 
            margin: { left: 14, right: 14 }, 
            theme: 'striped',
            headStyles: {
                fillColor: [22, 101, 52],
                fontSize: 7.5,
                fontStyle: 'bold',
                textColor: [255, 255, 255],
                halign: 'center',
                valign: 'middle',
            },
            styles: {
                fontSize: 7.5,
                cellPadding: 3,
                valign: 'middle',
            },
            columnStyles: {
                0: { cellWidth: 10,   halign: 'center' },
                1: { cellWidth: 24,   halign: 'center', fontStyle: 'bold' },
                2: { cellWidth: 40,   halign: 'left', fontStyle: 'bold' },
                3: { cellWidth: 16,   halign: 'center' },
                4: { cellWidth: 20,   halign: 'center' },
                5: { cellWidth: 20,   halign: 'center' },
                6: { cellWidth: 20,   halign: 'center' },
                7: { cellWidth: 'auto', halign: 'left' },
            },
        });

        const pages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i); doc.setFontSize(7); doc.setTextColor(156, 163, 175);
            doc.text(`Laboratory Attendance System  ·  Page ${i} of ${pages}  ·  ${nowStr}`,
                pageW / 2, doc.internal.pageSize.height - 8, { align: 'center' });
        }

        doc.save(`Subjects_Report_${new Date().toISOString().split('T')[0]}.pdf`);

        autoSaveReport('PDF'); 

    } catch (err) {
        console.error('PDF generation error:', err);
        showToast('There was an error generating the PDF. Check the console.', true);
    }
}
// ── Export CSV ────────────────────────────────────────────
async function exportCSV() {
    if (!checkDuplicateWarning('CSV')) return;

    const cols = ['#', 'Subject Code', 'Subject Name', 'Units', 'Active Schedules', 'Enrolled Students', 'Sessions Done', 'Description'];
    const lines = [
        cols.join(','),
        ...reportRows.map((r, i) => [
            i + 1,
            `"${r.subject_code}"`,
            `"${r.subject_name}"`,
            r.units,
            r.active_schedules,
            r.enrolled_students,
            r.sessions_done,
            `"${r.description.replace(/"/g, '""')}"`,
        ].join(',')),
    ];

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `Subjects_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);

    await autoSaveReport('CSV');
}

// ── Export Excel ──────────────────────────────────────────
async function exportExcel() {
    if (!checkDuplicateWarning('Excel')) return;

    if (!window.XLSX) {
        return exportCSV(); // Fallback if SheetJS not loaded
    }

    const wb = XLSX.utils.book_new();

    // ── Summary sheet ──
    const summaryData = [
        ['Subjects Report'],
        ['Generated', new Date().toLocaleString()],
        [''],
        ['Total Subjects',    metaStats.total],
        ['Active Schedules',  metaStats.schedules],
        ['Total Units',       metaStats.units],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 22 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // ── Data sheet ──
    const headers = ['#', 'Subject Code', 'Subject Name', 'Units', 'Active Schedules', 'Enrolled Students', 'Sessions Done', 'Description'];
    const rows = reportRows.map((r, i) => [
        i + 1,
        r.subject_code,
        r.subject_name,
        r.units,
        r.active_schedules,
        r.enrolled_students,
        r.sessions_done,
        r.description,
    ]);

    const dataSheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    dataSheet['!cols'] = [
        { wch: 5  },  // #
        { wch: 16 },  // Subject Code
        { wch: 40 },  // Subject Name
        { wch: 8  },  // Units
        { wch: 18 },  // Active Schedules
        { wch: 20 },  // Enrolled Students
        { wch: 16 },  // Sessions Done
        { wch: 50 },  // Description
    ];
    XLSX.utils.book_append_sheet(wb, dataSheet, 'Subjects');

    XLSX.writeFile(wb, `Subjects_Report_${new Date().toISOString().split('T')[0]}.xlsx`);

    await autoSaveReport('Excel');
}

// ══════════════════════════════════════════════════════════
// REAL-TIME VALIDATION (input listeners)
// ══════════════════════════════════════════════════════════

function bindEvents() {
    document.getElementById('subjectCode').addEventListener('input', function () {
        this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        removeFieldError(this);
        if (this.value.length < 3 && this.value.length > 0) {
            showFieldError(this, 'At least 3 characters required');
        } else {
            this.style.borderColor = this.value.length >= 3 ? '#bbf7d0' : '';
        }
    });

    document.getElementById('subjectName').addEventListener('input', function () {
        removeFieldError(this);
        if (this.value.trim().length > 0 && this.value.trim().length < 5) {
            showFieldError(this, 'At least 5 characters required');
        } else {
            this.style.borderColor = this.value.trim().length >= 5 ? '#bbf7d0' : '';
        }
    });

    document.getElementById('units').addEventListener('input', function () {
        removeFieldError(this);
        const v = parseFloat(this.value);
        if (this.value === '') return;
        if (isNaN(v) || v < 0 || v > 10) {
            showFieldError(this, 'Must be between 0 and 10');
            this.style.borderColor = '#fecaca';
        } else if ((v * 2) % 1 !== 0) {
            showFieldError(this, 'Use increments of 0.5 (e.g., 1.0, 1.5)');
            this.style.borderColor = '#fcd34d';
        } else {
            this.style.borderColor = '#bbf7d0';
        }
    });

    document.getElementById('description').addEventListener('input', function () {
        const max = 500;
        let counter = this.parentElement.querySelector('.char-counter');
        if (!counter) {
            counter = document.createElement('small');
            counter.className = 'char-counter';
            counter.style.cssText = 'display:block;text-align:right;font-size:11px;margin-top:4px;';
            this.parentElement.appendChild(counter);
        }
        counter.textContent = `${this.value.length} / ${max} characters`;
        if (this.value.length > max) {
            counter.style.color = '#dc2626';
            this.style.borderColor = '#fecaca';
            this.value = this.value.substring(0, max);
        } else {
            counter.style.color = '#6b7280';
            this.style.borderColor = '';
        }
    });

    document.getElementById('searchInput').addEventListener('input', function () {
        const q = this.value.toLowerCase();
        document.querySelectorAll('#subjectsTableBody tr').forEach(row => {
            row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });

    document.getElementById('clearFilters').addEventListener('click', function () {
        document.getElementById('searchInput').value = '';
        document.querySelectorAll('#subjectsTableBody tr').forEach(row => row.style.display = '');
    });

    document.getElementById('subjectModal').addEventListener('click', function (e) {
        if (e.target === this) closeModal();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { closeModal(); closeReportModal(); }
    });
}

// ══════════════════════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════════════════════

function setTableLoading(on) {
    const tbody = document.getElementById('subjectsTableBody');
    if (on) {
        tbody.innerHTML = `<tr id="loadingRow"><td colspan="7" class="loading-cell"><i class="fa-solid fa-spinner fa-spin"></i> Loading subjects…</td></tr>`;
    }
}

function showTableError(msg) {
    document.getElementById('subjectsTableBody').innerHTML = `
        <tr><td colspan="7" class="empty-cell" style="color:#dc2626">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:36px;display:block;margin-bottom:10px"></i>
            ${escHtml(msg)}
        </td></tr>`;
}

function showFieldError(field, message) {
    removeFieldError(field);
    field.style.borderColor = '#fecaca';
    const span = document.createElement('small');
    span.className = 'field-error';
    span.innerHTML = `<i class="fa-solid fa-exclamation-circle"></i> ${message}`;
    span.style.cssText = 'display:block;color:#dc2626;font-size:11px;margin-top:4px;font-weight:600;font-family:"Nunito Sans",sans-serif;';
    field.parentElement.appendChild(span);
}

function removeFieldError(field) {
    const e = field.parentElement.querySelector('.field-error');
    if (e) e.remove();
}

function showValidationError(message) {
    clearValidationError();
    const div = document.createElement('div');
    div.className = 'validation-error';
    div.innerHTML = `<i class="fa-solid fa-exclamation-triangle"></i><span>${escHtml(message)}</span>`;
    const form = document.getElementById('subjectForm');
    form.parentElement.insertBefore(div, form);
    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => div.remove(), 6000);
}

function clearValidationError() {
    document.querySelectorAll('.validation-error').forEach(el => el.remove());
}

function clearAllValidation() {
    clearValidationError();
    document.querySelectorAll('#subjectModal .field-error, #subjectModal .checking-indicator, #subjectModal .char-counter').forEach(el => el.remove());
    document.querySelectorAll('#subjectModal input, #subjectModal textarea').forEach(el => {
        el.style.borderColor = '';
    });
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    toast.className = 'toast on' + (isError ? ' error' : '');
    setTimeout(() => toast.className = 'toast', 4000);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}