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

/**
 * Load subjects with schedule + student counts from Supabase.
 *
 * Supabase RLS policies must allow SELECT on:
 *   - subjects
 *   - lab_schedules  (joined via subject_id)
 *   - schedule_enrollments (joined via schedule_id)
 *   - lab_sessions   (joined via schedule_id)
 *
 * We fetch each table separately and aggregate in JS to avoid
 * complex PostgREST embedded resource limits.
 */
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
        // Build a map: subject_id → { schedule_count, enrolled_students, sessions_done }
        const schedulesBySubject = {};   // subject_id → Set<schedule_id>
        const activeScheduleIds  = new Set();

        (schedules || []).forEach(s => {
            if (!schedulesBySubject[s.subject_id]) {
                schedulesBySubject[s.subject_id] = new Set();
            }
            schedulesBySubject[s.subject_id].add(s.schedule_id);
            activeScheduleIds.add(s.schedule_id);
        });

        // enrolled students per schedule
        const enrolledPerSchedule = {};  // schedule_id → Set<student_id>
        (enrollments || []).forEach(e => {
            if (!enrolledPerSchedule[e.schedule_id]) {
                enrolledPerSchedule[e.schedule_id] = new Set();
            }
            enrolledPerSchedule[e.schedule_id].add(e.student_id);
        });

        // completed sessions per schedule
        const completedPerSchedule = {}; // schedule_id → count
        (sessions || []).filter(s => s.status === 'completed').forEach(s => {
            completedPerSchedule[s.schedule_id] = (completedPerSchedule[s.schedule_id] || 0) + 1;
        });

        // Merge into subject rows
        allSubjects = (subjects || []).map(sub => {
            const subjectSchedules = schedulesBySubject[sub.subject_id] || new Set();
            const scheduleCount    = subjectSchedules.size;

            // unique enrolled students across all schedules for this subject
            const studentSet = new Set();
            subjectSchedules.forEach(schId => {
                (enrolledPerSchedule[schId] || new Set()).forEach(stId => studentSet.add(stId));
            });
            const enrolledStudents = studentSet.size;

            // total completed sessions for this subject
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

        // ── Summary stats ──
        const totalUnits     = allSubjects.reduce((sum, s) => sum + (parseFloat(s.units) || 0), 0);
        const activeSchedules = schedules ? schedules.length : 0;

        metaStats = {
            total:     allSubjects.length,
            schedules: activeSchedules,
            units:     totalUnits,
        };

        // ── Build report rows ──
        reportRows = allSubjects.map(s => ({
            subject_code:     s.subject_code,
            subject_name:     s.subject_name,
            description:      s.description || '',
            units:            s.units || 0,
            active_schedules: s.schedule_count,
            enrolled_students: s.enrolled_students,
            sessions_done:    s.sessions_done,
        }));

        // ── Render ──
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
    setText('badgeTotalSubjects',  metaStats.total);
    setText('badgeActiveSchedules', metaStats.schedules);
    setText('badgeTotalUnits',     metaStats.units);

    // Report modal chips
    setText('rmTotalSubjects',  metaStats.total);
    setText('rmActiveSchedules', metaStats.schedules);
    setText('rmTotalUnits',     metaStats.units);

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

// ── Add / Update (form submit) ──
document.getElementById('subjectForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const subjectId   = document.getElementById('subjectId').value.trim();
    const subjectCode = document.getElementById('subjectCode').value.trim();
    const subjectName = document.getElementById('subjectName').value.trim();
    const units       = document.getElementById('units').value;
    const description = document.getElementById('description').value.trim();
    const isEdit      = subjectId !== '';

    // ── Client-side validation ──
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
        // ── Duplicate check via Supabase ──
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

        // ── Upsert ──
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
        await loadSubjects(); // refresh table

    } catch (err) {
        console.error('Save subject error:', err);
        showValidationError(err.message || 'An error occurred. Please try again.');
        btn.disabled = false;
        btn.innerHTML = orig;
    }
});

// ── Delete ──
async function deleteSubject(subjectId, subjectCode) {
    const confirmed = confirm(`Delete subject "${subjectCode}"?\n\nThis may affect associated schedules and enrollments.`);
    if (!confirmed) return;

    try {
        // Check if subject has active schedules
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
// REPORT MODAL
// ══════════════════════════════════════════════════════════

function openReportModal() {
    document.getElementById('rmOverlay').classList.add('on');
    renderReportTable();
}

function closeReportModal() {
    document.getElementById('rmOverlay').classList.remove('on');
}

// ── Print ──
function printReport() {
    const cols = ['#', 'Subject Code', 'Subject Name', 'Units', 'Active Schedules', 'Enrolled Students', 'Sessions Done', 'Description'];
    const now  = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const rows = reportRows.map((r, i) => `
        <tr class="${i % 2 === 1 ? 'even' : ''}">
            <td>${i + 1}</td>
            <td><strong>${escHtml(r.subject_code)}</strong></td>
            <td>${escHtml(r.subject_name)}</td>
            <td style="text-align:center">${r.units} ${r.units == 1 ? 'unit' : 'units'}</td>
            <td style="text-align:center">${r.active_schedules}</td>
            <td style="text-align:center">${r.enrolled_students}</td>
            <td style="text-align:center">${r.sessions_done}</td>
            <td style="font-size:9px">${escHtml(r.description.substring(0, 70))}</td>
        </tr>`).join('');

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Subjects Report</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',Arial,sans-serif;background:#fff;color:#1a2e1f;font-size:10px;line-height:1.5}
.page-header{background:linear-gradient(135deg,#14532d 0%,#166534 60%,#15803d 100%);color:#fff;padding:16px 24px}
.header-inner{display:flex;align-items:center;justify-content:center;gap:16px}
.header-center{text-align:center}
.school-label{font-size:7.5px;font-weight:600;letter-spacing:1.8px;text-transform:uppercase;color:rgba(255,255,255,0.65);margin-bottom:4px}
.report-title{font-size:16px;font-weight:700;color:#fff;line-height:1.25;margin-bottom:3px}
.report-sub{font-size:8.5px;color:rgba(255,255,255,0.6)}
.meta-bar{display:flex;align-items:stretch;background:#f0fdf4;border-bottom:2px solid #bbf7d0;padding:0 24px}
.meta-item{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:7px 14px;font-size:9px}
.meta-item .lbl{color:#6b7280;font-weight:400;font-size:8px}
.meta-item strong{color:#166534;font-size:9px}
.meta-item+.meta-item{border-left:1px solid #bbf7d0}
.table-wrap{padding:14px 24px 0}
table{width:100%;border-collapse:collapse;font-size:9px}
thead tr{background:linear-gradient(90deg,#14532d,#166534)}
th{padding:8px 10px;text-align:left;font-size:8px;font-weight:700;letter-spacing:0.7px;text-transform:uppercase;color:#fff;white-space:nowrap}
tbody tr{border-bottom:1px solid #e9f5ee}
tbody tr.even{background:#f7fdf9}
td{padding:6px 10px;color:#1a2e1f;vertical-align:middle}
.page-footer{margin-top:16px;border-top:2px solid #e9f5ee;padding:8px 24px;display:flex;justify-content:space-between;align-items:center;font-size:8px;color:#9ca3af}
@page{size:A4 landscape;margin:8mm}
@media print{thead tr,tbody tr.even{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="page-header">
  <div class="header-inner">
    <div class="header-center">
      <div class="school-label">Pamantasan ng Lungsod ng Pasig &middot; Laboratory Attendance System</div>
      <div class="report-title">Subjects Report</div>
      <div class="report-sub">Official Report Document &nbsp;&middot;&nbsp; Generated: ${dateStr} at ${timeStr}</div>
    </div>
  </div>
</div>
<div class="meta-bar">
  <div class="meta-item"><span class="lbl">Date</span><strong>${dateStr}</strong></div>
  <div class="meta-item"><span class="lbl">Time</span><strong>${timeStr}</strong></div>
  <div class="meta-item"><span class="lbl">Total Subjects</span><strong>${metaStats.total}</strong></div>
  <div class="meta-item"><span class="lbl">Active Schedules</span><strong>${metaStats.schedules}</strong></div>
  <div class="meta-item"><span class="lbl">Total Units</span><strong>${metaStats.units}</strong></div>
</div>
<div class="table-wrap">
  <table>
    <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>
<div class="page-footer">
  <span>&copy; ${now.getFullYear()} Laboratory Attendance System &nbsp;&middot;&nbsp; Pamantasan ng Lungsod ng Pasig</span>
  <span>Generated: ${dateStr} at ${timeStr}</span>
</div>
<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script>
</body></html>`);
    w.document.close();
}

// ── Download PDF ──
function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const pageW  = doc.internal.pageSize.width;
    const pageH  = doc.internal.pageSize.height;
    const margin = 10;
    const cx     = pageW / 2;
    const headerH = 36;

    // Header background
    doc.setFillColor(20, 83, 45);
    doc.rect(0, 0, pageW, headerH, 'F');

    // School label
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 220, 180);
    doc.text('PAMANTASAN NG LUNGSOD NG PASIG  ·  LABORATORY ATTENDANCE SYSTEM', cx, 11, { align: 'center' });

    // Title
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('Subjects Report', cx, 21, { align: 'center' });

    // Subtitle
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 220, 180);
    doc.text('Official Report Document', cx, 29, { align: 'center' });

    // Meta bar
    const metaY = headerH;
    const metaH = 12;
    doc.setFillColor(240, 253, 244);
    doc.rect(0, metaY, pageW, metaH, 'F');
    doc.setDrawColor(187, 247, 208); doc.setLineWidth(0.4);
    doc.line(0, metaY + metaH, pageW, metaY + metaH);

    const metaItems = [
        ['Date',            dateStr],
        ['Time',            timeStr],
        ['Total Subjects',  `${metaStats.total}`],
        ['Active Schedules', `${metaStats.schedules}`],
        ['Total Units',     `${metaStats.units}`],
    ];
    const slotW = pageW / metaItems.length;
    metaItems.forEach(([lbl, val], i) => {
        const mx = i * slotW + slotW / 2;
        doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
        doc.text(lbl, mx, metaY + 4.5, { align: 'center' });
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 101, 52);
        doc.text(val, mx, metaY + 9.5, { align: 'center' });
        if (i > 0) {
            doc.setDrawColor(187, 247, 208); doc.setLineWidth(0.3);
            doc.line(i * slotW, metaY + 1, i * slotW, metaY + metaH - 1);
        }
    });

    // Table
    const head = [['#', 'Subject Code', 'Subject Name', 'Units', 'Active Schedules', 'Enrolled Students', 'Sessions Done', 'Description']];
    const body = reportRows.map((r, i) => [
        i + 1,
        r.subject_code,
        r.subject_name,
        r.units + (r.units == 1 ? ' unit' : ' units'),
        r.active_schedules,
        r.enrolled_students,
        r.sessions_done,
        r.description.substring(0, 50),
    ]);

    doc.autoTable({
        head, body,
        startY: metaY + metaH + 3,
        margin: { left: margin, right: margin },
        theme: 'striped',
        headStyles: { fillColor: [20, 83, 45], fontSize: 7, fontStyle: 'bold', textColor: [255, 255, 255], cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } },
        alternateRowStyles: { fillColor: [247, 253, 249] },
        styles: { fontSize: 7.5, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, textColor: [26, 46, 31], lineColor: [233, 245, 238], lineWidth: 0.2 },
        columnStyles: {
            0: { cellWidth: 8, fontStyle: 'bold' },
            1: { cellWidth: 24 },
            2: { cellWidth: 50 },
            3: { cellWidth: 18 },
            4: { cellWidth: 18 },
            5: { cellWidth: 18 },
            6: { cellWidth: 18 },
            7: { cellWidth: 'auto' },
        },
    });

    // Footer on each page
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        const footY = pageH - 7;
        doc.setFillColor(249, 250, 251);
        doc.rect(0, footY - 4, pageW, 11, 'F');
        doc.setDrawColor(233, 245, 238); doc.setLineWidth(0.3);
        doc.line(0, footY - 4, pageW, footY - 4);
        doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(156, 163, 175);
        doc.text(`© ${now.getFullYear()} Laboratory Attendance System  ·  Pamantasan ng Lungsod ng Pasig`, margin, footY);
        doc.text(`Generated: ${dateStr} at ${timeStr}  ·  Page ${i} of ${pages}`, pageW - margin, footY, { align: 'right' });
    }

    doc.save(`Subjects_Report_${now.toISOString().split('T')[0]}.pdf`);
}

// ── Export CSV ──
function exportCSV() {
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
    showToast('CSV exported!');
}

// ══════════════════════════════════════════════════════════
// REAL-TIME VALIDATION (input listeners)
// ══════════════════════════════════════════════════════════

function bindEvents() {
    // Subject Code — uppercase + alphanum only, live format
    document.getElementById('subjectCode').addEventListener('input', function () {
        this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        removeFieldError(this);
        if (this.value.length < 3 && this.value.length > 0) {
            showFieldError(this, 'At least 3 characters required');
        } else {
            this.style.borderColor = this.value.length >= 3 ? '#bbf7d0' : '';
        }
    });

    // Subject Name
    document.getElementById('subjectName').addEventListener('input', function () {
        removeFieldError(this);
        if (this.value.trim().length > 0 && this.value.trim().length < 5) {
            showFieldError(this, 'At least 5 characters required');
        } else {
            this.style.borderColor = this.value.trim().length >= 5 ? '#bbf7d0' : '';
        }
    });

    // Units
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

    // Description — character counter
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

    // Search
    document.getElementById('searchInput').addEventListener('input', function () {
        const q = this.value.toLowerCase();
        document.querySelectorAll('#subjectsTableBody tr').forEach(row => {
            row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });

    // Clear filters
    document.getElementById('clearFilters').addEventListener('click', function () {
        document.getElementById('searchInput').value = '';
        document.querySelectorAll('#subjectsTableBody tr').forEach(row => row.style.display = '');
    });

    // Close modal on backdrop click
    document.getElementById('subjectModal').addEventListener('click', function (e) {
        if (e.target === this) closeModal();
    });

    // ESC key
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

function showToast(msg) {
    const toast = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    toast.classList.add('on');
    setTimeout(() => toast.classList.remove('on'), 4000);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

/** Safe HTML escape */
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}