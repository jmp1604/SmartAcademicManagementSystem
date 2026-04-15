/* ============================================================
   resc/js/studentAttendance.js
   Replaces PHP queries with Supabase JS client for Attendance
============================================================ */

let allAttendance = [];
let filteredAttendance = [];
let META = {};


// ────────────────────────────────────────────
// UTILITY
// ────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showToast(msg) {
    const toast = document.getElementById('toast-r');
    document.getElementById('toastMsg-r').textContent = msg;
    toast.classList.add('on');
    setTimeout(() => toast.classList.remove('on'), 4000);
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!supabaseClient) {
        console.error('Supabase client not initialized.');
        return;
    }
    
   const today = new Date();
// Format date correctly as YYYY-MM-DD in local timezone
const yyyy = today.getFullYear();
const mm   = String(today.getMonth() + 1).padStart(2, '0');
const dd   = String(today.getDate()).padStart(2, '0');
document.getElementById('filterDate').value = `${yyyy}-${mm}-${dd}`;

    META.genDate = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    await loadDropdowns();
    await loadAttendanceData(); // Initial load based on default date
});

// ────────────────────────────────────────────
// 1. DATA LOADING 
// ────────────────────────────────────────────
async function loadDropdowns() {
    try {
        // Fetch active professors
        const { data: profs } = await supabaseClient
            .from('professors').select('professor_id, first_name, last_name').order('last_name');
        
        // Fetch active subjects
        const { data: subjects } = await supabaseClient
            .from('subjects').select('subject_id, subject_code, subject_name').order('subject_code');
        
        // Fetch active labs
        const { data: labs } = await supabaseClient
            .from('laboratory_rooms').select('lab_id, lab_code, lab_name').order('lab_code');

        // Fetch distinct sections from schedules
        const { data: sectionsData } = await supabaseClient
            .from('lab_schedules').select('section').not('section', 'is', null);
        const uniqueSections = [...new Set(sectionsData.map(s => s.section))].sort();

        // Populate Dropdowns
        populateSelect('filterProf', profs, p => p.professor_id, p => `${p.last_name}, ${p.first_name}`);
        populateSelect('filterSubject', subjects, s => s.subject_id, s => `${s.subject_code} - ${s.subject_name}`);
        populateSelect('filterLab', labs, l => l.lab_id, l => `${l.lab_code} - ${l.lab_name}`);
        
        const secSelect = document.getElementById('filterSection');
        secSelect.innerHTML = '<option value="">All Sections</option>' + 
            uniqueSections.map(sec => `<option value="${sec}">${sec}</option>`).join('');

    } catch (error) {
        console.error("Error loading dropdowns:", error);
    }
}

function populateSelect(id, data, valFn, textFn) {
    const select = document.getElementById(id);
    const defaultText = select.options[0].text;
    const options = data ? data.map(item => `<option value="${valFn(item)}">${escapeHtml(textFn(item))}</option>`).join('') : '';
    select.innerHTML = `<option value="">${defaultText}</option>${options}`;
}

async function loadAttendanceData() {
    const tbody = document.getElementById('attendanceBody');
    tbody.innerHTML = `<tr><td colspan="11" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading attendance data...</p></td></tr>`;

    // Build query based on current filters
    let query = supabaseClient
        .from('lab_attendance')
        .select(`
            attendance_id, time_in, time_out, time_in_status, late_minutes, duration_minutes, verified_by_facial_recognition,
            students ( student_id, id_number, first_name, middle_name, last_name, course, year_level, section, profile_picture ),
            lab_sessions ( 
                session_id, session_date, status, actual_start_time,
                lab_schedules (
                    section, day_of_week, start_time, end_time,
                    subjects ( subject_id, subject_code, subject_name ),
                    professors ( professor_id, first_name, last_name ),
                    laboratory_rooms ( lab_id, lab_code, lab_name )
                )
            )
        `)
        .order('time_in', { ascending: false });

    // Apply DB-level filters if possible (Note: deeply nested filtering in Supabase JS can be tricky, 
    // so we will fetch the date, and filter the rest client-side for speed and simplicity)
    const dateFilter = document.getElementById('filterDate').value;
    // We fetch all records, then filter client side because filtering on nested joins (like lab_sessions.session_date) 
    // requires a different syntax in PostgREST that can sometimes exclude parents entirely.
    
    try {
        const { data, error } = await query;
        if (error) {
    console.error('Supabase error details:', error); // ← already there
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error details:', error.details);
    console.error('Error hint:', error.hint);
    throw error;
}
        

        // Flatten data for easier handling and apply client-side filters
        allAttendance = data.filter(d => d.lab_sessions && d.students && d.lab_sessions.lab_schedules).map(d => {
            const st = d.students;
            const sess = d.lab_sessions;
            const sch = sess.lab_schedules;
            
            return {
                attendance_id: d.attendance_id,
                time_in: d.time_in,
                time_out: d.time_out,
                time_in_status: d.time_in_status,
                late_minutes: d.late_minutes || 0,
                duration_minutes: d.duration_minutes,
                verified_by_facial_recognition: d.verified_by_facial_recognition,
                
                // Student
                student_id: st.student_id,
                id_number: st.id_number,
                student_name: `${st.first_name} ${st.last_name}`,
                student_full_name: `${st.first_name} ${st.middle_name || ''} ${st.last_name}`.replace(/\s+/g, ' ').trim(),
                course: st.course,
                year_level: st.year_level,
                student_section: st.section,
                profile_picture: st.profile_picture,
                initials: (st.first_name[0] + st.last_name[0]).toUpperCase(),

                // Session/Schedule
                session_id: sess.session_id,
                session_date: sess.session_date,
                actual_start_time: sess.actual_start_time,
                class_section: sch.section,
                day_of_week: sch.day_of_week,
                sched_start: sch.start_time,
                sched_end: sch.end_time,
                
                // Subject
                subject_id: sch.subjects.subject_id,
                subject_code: sch.subjects.subject_code,
                subject_name: sch.subjects.subject_name,
                
                // Professor
                professor_id: sch.professors.professor_id,
                professor_name: `${sch.professors.first_name} ${sch.professors.last_name}`,
                
                // Lab
                lab_id: sch.laboratory_rooms.lab_id,
                lab_code: sch.laboratory_rooms.lab_code,
                lab_name: sch.laboratory_rooms.lab_name
            };
        });

        executeClientFilter(); // Applies UI filters and renders

    } catch (error) {
        console.error('Error fetching attendance:', error);
        tbody.innerHTML = `<tr><td colspan="11" class="empty-state" style="color:var(--red)"><i class="fa-solid fa-triangle-exclamation"></i><p>Error loading attendance.</p></td></tr>`;
    }
}

// ────────────────────────────────────────────
// 2. FILTERING & RENDERING
// ────────────────────────────────────────────
window.applyFilters = function() {
    executeClientFilter();
}

window.resetFilters = function() {
    document.getElementById('filterSearch').value = '';
    // Keep the date filter, just reset the others
    document.getElementById('filterSubject').value = '';
    document.getElementById('filterLab').value = '';
    document.getElementById('filterProf').value = '';
    document.getElementById('filterSection').value = '';
    document.getElementById('filterStatus').value = '';
    executeClientFilter();
}

function executeClientFilter() {
    const q = document.getElementById('filterSearch').value.toLowerCase().trim();
    const date = document.getElementById('filterDate').value;
    const sub = document.getElementById('filterSubject').value;
    const lab = document.getElementById('filterLab').value;
    const prof = document.getElementById('filterProf').value;
    const sec = document.getElementById('filterSection').value;
    const stat = document.getElementById('filterStatus').value;

    filteredAttendance = allAttendance.filter(a => {
        // Date is our primary filter
        if (date && a.session_date !== date) return false;
        
        if (sub && a.subject_id != sub) return false;
        if (lab && a.lab_id != lab) return false;
        if (prof && a.professor_id != prof) return false;
        if (sec && a.class_section !== sec) return false;
        
        if (stat) {
            if (stat === 'present' && a.time_out !== null) return false;
            if (stat === 'completed' && a.time_out === null) return false;
            if (stat === 'late' && a.time_in_status !== 'late') return false;
        }

        if (q) {
            const searchStr = `${a.student_name} ${a.id_number}`.toLowerCase();
            if (!searchStr.includes(q)) return false;
        }

        return true;
    });

    updateStats();
    renderTable();
}

function updateStats() {
    META.total = filteredAttendance.length;
    META.stillIn = 0;
    META.timedOut = 0;
    META.late = 0;
    const uniqueSessions = new Set();

    filteredAttendance.forEach(a => {
        if (!a.time_out) META.stillIn++;
        else META.timedOut++;

        if (a.time_in_status === 'late') META.late++;
        uniqueSessions.add(a.session_id);
    });

    META.onTime = META.total - META.late;
    META.sessions = uniqueSessions.size;

    document.getElementById('statTotal').textContent = META.total;
    document.getElementById('statStillIn').textContent = META.stillIn;
    document.getElementById('statTimedOut').textContent = META.timedOut;
    document.getElementById('statLate').textContent = META.late;
    document.getElementById('statSessions').textContent = META.sessions;
    document.getElementById('recordCountBadge').textContent = META.total;
}

function renderTable() {
    const tbody = document.getElementById('attendanceBody');
    if (filteredAttendance.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="empty-state"><i class="fa-solid fa-clipboard-list"></i><h3>No attendance records found</h3><p>Try adjusting your filters or select a different date.</p></td></tr>`;
        return;
    }

    const now = new Date();

    tbody.innerHTML = filteredAttendance.map((row, i) => {
        const isStillIn = !row.time_out;
        const isLate = row.time_in_status === 'late';
        
        let badgeClass, badgeTxt;
        if (isStillIn) { badgeClass = 'badge-blue'; badgeTxt = '● Inside'; }
        else if (row.time_out) { badgeClass = 'badge-green'; badgeTxt = '✓ Done'; }
        else { badgeClass = 'badge-gray'; badgeTxt = '— No record'; }

        const statusBadge = isLate 
            ? `<span class="badge badge-amber"><i class="fa-solid fa-clock"></i> Late</span>`
            : `<span class="badge ${badgeClass}">${badgeTxt}</span>`;

        const avatarImg = row.profile_picture 
            ? `<img src="../students/uploads/${escapeHtml(row.profile_picture)}" alt="">` 
            : row.initials;

        let dur = row.duration_minutes ? `${row.duration_minutes}m` : '—';
        if (isStillIn && row.time_in) {
            const timeInDate = new Date(row.time_in);
            const mins = Math.round((now - timeInDate) / 60000);
            dur = `${mins}m (ongoing)`;
        }

        const tInFormat = row.time_in ? new Date(row.time_in).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'}) : '—';
        const tOutFormat = row.time_out ? new Date(row.time_out).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'}) : (isStillIn ? '<span class="badge badge-blue" style="font-size:10px">Still inside</span>' : '—');
        const dChipFormat = row.time_in ? new Date(row.time_in).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '';

        return `
            <tr onclick="showDetail('${row.attendance_id}')" style="cursor:pointer">
                <td><span class="time-val absent">${i+1}</span></td>
                <td>
                    <div class="student-cell">
                        <div class="student-avatar">${avatarImg}</div>
                        <div>
                            <div class="student-name">${escapeHtml(row.student_name)}</div>
                            <div class="student-id">${escapeHtml(row.id_number)}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div style="font-weight:700;font-size:13px;color:var(--green-dark)">${escapeHtml(row.subject_code)}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${escapeHtml(row.subject_name).substring(0, 20)}...</div>
                </td>
                <td><span class="badge badge-gray">${escapeHtml(row.class_section)}</span></td>
                <td><span class="time-val">${escapeHtml(row.lab_code)}</span></td>
                <td>
                    <span class="time-val">${tInFormat}</span>
                    <span class="duration-chip">${dChipFormat}</span>
                </td>
                <td>
                    <span class="time-val">${tOutFormat}</span>
                </td>
                <td><span class="time-val" style="font-size:12px">${dur}</span></td>
                <td>${statusBadge}</td>
                <td>
                    ${row.verified_by_facial_recognition 
                        ? '<i class="fa-solid fa-circle-check" style="color:var(--green-bright);font-size:16px" title="Face verified"></i>' 
                        : '<i class="fa-solid fa-circle-xmark" style="color:var(--text-muted);font-size:16px" title="Manual"></i>'}
                </td>
                <td>
                    <button class="filter-btn" onclick="event.stopPropagation();showDetail('${row.attendance_id}')"><i class="fa-solid fa-eye"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

// ────────────────────────────────────────────
// 3. DETAIL MODAL
// ────────────────────────────────────────────
window.showDetail = function(id) {
    const row = filteredAttendance.find(a => a.attendance_id === id);
    if (!row) return;

    const timeIn = row.time_in ? new Date(row.time_in).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'}) : '—';
    const timeOut = row.time_out ? new Date(row.time_out).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'}) : 'Still inside';
    
    let dur = row.duration_minutes ? `${row.duration_minutes}m` : '—';
    if (!row.time_out && row.time_in) {
        const mins = Math.round((new Date() - new Date(row.time_in)) / 60000);
        dur = `${mins}m (ongoing)`;
    }

    const face = row.verified_by_facial_recognition
        ? '<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> Verified</span>'
        : '<span class="badge badge-gray">Manual</span>';
    
    const status = row.time_in_status === 'late'
        ? `<span class="badge badge-amber">Late ${row.late_minutes > 0 ? '('+row.late_minutes+' min)' : ''}</span>`
        : '<span class="badge badge-green">On Time</span>';

    const actStart = row.actual_start_time ? formatTime12Hour(row.actual_start_time) : '';
    const schedStart = formatTime12Hour(row.sched_start);
    const schedEnd = formatTime12Hour(row.sched_end);

    document.getElementById('modalContent').innerHTML = `
        <div class="modal-row"><span class="modal-label">Student</span><span class="modal-val">${escapeHtml(row.student_full_name)}</span></div>
        <div class="modal-row"><span class="modal-label">ID Number</span><span class="modal-val mono">${escapeHtml(row.id_number)}</span></div>
        <div class="modal-row"><span class="modal-label">Course</span><span class="modal-val">${escapeHtml(row.course)}</span></div>
        <div class="modal-row"><span class="modal-label">Subject</span><span class="modal-val">${escapeHtml(row.subject_code)} — ${escapeHtml(row.subject_name)}</span></div>
        <div class="modal-row"><span class="modal-label">Section</span><span class="modal-val">${escapeHtml(row.class_section)}</span></div>
        <div class="modal-row"><span class="modal-label">Laboratory</span><span class="modal-val mono">${escapeHtml(row.lab_code)}</span></div>
        <div class="modal-row"><span class="modal-label">Schedule</span><span class="modal-val">${row.day_of_week} &nbsp; ${schedStart} – ${schedEnd}</span></div>
        <div class="modal-row"><span class="modal-label">Professor</span><span class="modal-val">${escapeHtml(row.professor_name)}</span></div>
        ${actStart ? `<div class="modal-row"><span class="modal-label">Prof Started At</span><span class="modal-val mono" style="color:var(--green-bright);font-weight:700">▶ ${actStart}</span></div>` : ''}
        <div class="modal-row"><span class="modal-label">Session Date</span><span class="modal-val">${row.session_date}</span></div>
        <div class="modal-row"><span class="modal-label">Time In</span><span class="modal-val mono">${timeIn}</span></div>
        <div class="modal-row"><span class="modal-label">Time Out</span><span class="modal-val mono">${timeOut}</span></div>
        <div class="modal-row"><span class="modal-label">Duration</span><span class="modal-val mono">${dur}</span></div>
        <div class="modal-row"><span class="modal-label">Arrival Status</span><span class="modal-val">${status}</span></div>
        <div class="modal-row"><span class="modal-label">Face Recognition</span><span class="modal-val">${face}</span></div>
    `;
    document.getElementById('detailModal').classList.add('on');
}

window.closeModal = function() { document.getElementById('detailModal').classList.remove('on'); }
// ────────────────────────────────────────────
// 4. REPORT MODAL & EXPORT (Laboratories Theme)
// ────────────────────────────────────────────

let existingReportsToday = []; // Tracks reports to prevent exact duplicates

// ── Pre-fetch Duplicates ──
window.fetchTodayReports = async function() {
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    try {
        const { data } = await supabaseClient
            .from('las_reports')
            .select('report_name, report_data')
            .eq('report_type', 'attendance')
            .like('report_name', `%${dateStr}%`); 
            
        if (data) {
            existingReportsToday = data.map(d => ({
                name: d.report_name,
                dataString: typeof d.report_data === 'string' ? d.report_data : JSON.stringify(d.report_data)
            }));
        } else {
            existingReportsToday = [];
        }
    } catch (e) {
        existingReportsToday = [];
    }
};

window.openReportModal = async function() {
    // Populate stats
    document.getElementById('rmDisplayDate').textContent = document.getElementById('filterDate').value || 'All Dates';
    document.getElementById('rmRecordCount').textContent = META.total;
    document.getElementById('rmGenDate').textContent = META.genDate;

    document.getElementById('rmTotalChip').textContent = META.total;
    document.getElementById('rmStillInChip').textContent = META.stillIn;
    document.getElementById('rmTimedOutChip').textContent = META.timedOut;
    document.getElementById('rmLateChip').textContent = META.late;
    document.getElementById('rmOnTimeChip').textContent = META.onTime;

    const tbody = document.getElementById('rmTableBody');
    tbody.innerHTML = filteredAttendance.map((row, i) => {
        let dur = row.duration_minutes ? `${row.duration_minutes}m` : '—';
        if (!row.time_out && row.time_in) {
            const mins = Math.round((new Date() - new Date(row.time_in)) / 60000);
            dur = `${mins}m (ongoing)`;
        }
        
        const timeIn = row.time_in ? new Date(row.time_in).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'}) : '—';
        const timeOut = row.time_out ? new Date(row.time_out).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'}) : (!row.time_out && row.time_in ? 'Still inside' : '—');
        
        const isLate = row.time_in_status === 'late';
        const status = isLate ? `Late ${row.late_minutes > 0 ? '('+row.late_minutes+'m)' : ''}` : 'On Time';
        
        return `
        <tr>
            <td style="color:var(--text-muted);font-size:11px">${i+1}</td>
            <td style="font-family:var(--mono);font-size:11.5px;font-weight:700;color:var(--green-dark)">${escapeHtml(row.id_number)}</td>
            <td style="font-weight:700">${escapeHtml(row.student_name)}</td>
            <td style="font-size:12px">${escapeHtml(row.course || '—')}</td>
            <td><span style="background:var(--surface);color:var(--green-dark);padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid var(--border)">${escapeHtml(row.class_section)}</span></td>
            <td style="font-weight:800;color:var(--green-dark);font-size:12px">${escapeHtml(row.subject_code)}<br><span style="color:var(--text-muted);font-size:10.5px;font-weight:400">${escapeHtml(row.subject_name).substring(0,25)}...</span></td>
            <td style="font-family:var(--mono);font-size:11.5px;font-weight:600">${escapeHtml(row.lab_code)}</td>
            <td style="font-size:12px">${escapeHtml(row.professor_name)}</td>
            <td style="font-family:var(--mono);font-size:11.5px">${row.session_date}</td>
            <td style="font-family:var(--mono);font-size:11.5px;font-weight:600;color:var(--green-dark)">${timeIn}</td>
            <td style="font-family:var(--mono);font-size:11.5px">${timeOut}</td>
            <td style="font-family:var(--mono);font-size:11px">${dur}</td>
            <td><span class="rm-badge ${isLate ? 'inactive' : 'active'}">${status}</span></td>
            <td><span class="rm-badge ${row.verified_by_facial_recognition ? 'active' : 'not-registered'}">${row.verified_by_facial_recognition ? 'Face' : 'Manual'}</span></td>
        </tr>`;
    }).join('');
    
    document.getElementById('rmOverlay').classList.add('on');
    await window.fetchTodayReports(); // Prepare duplicate checker
};

window.closeReportModal = function() { document.getElementById('rmOverlay').classList.remove('on'); }

// Close modals on Escape
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if(typeof closeModal==='function') closeModal(); closeReportModal(); }
});

function formatTime12Hour(timeString) {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${minutes} ${ampm}`;
}

// ── Smart Duplicate Check Helper ──
function checkDuplicateWarning(exportType) {
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const filterDate = document.getElementById('filterDate').value || 'All Dates';
    const reportName = `Attendance Report [${filterDate}] — ${dateStr} (${exportType})`;
    const currentDataString = JSON.stringify(filteredAttendance);
    
    const isExactDuplicate = existingReportsToday.some(r => 
        r.name === reportName && r.dataString === currentDataString
    );
    
    if (isExactDuplicate) {
        return confirm(`A ${exportType} report with this EXACT data has already been saved today.\n\nAre you sure you want to generate a duplicate?`);
    }
    return true; 
}

// ── Auto-save helper ──────────────────────────────────────────
async function autoSaveReport(exportType) {
    const dateStr    = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const filterDate = document.getElementById('filterDate').value || 'All Dates';
    const reportName = `Attendance Report [${filterDate}] — ${dateStr} (${exportType})`;

    const payload = {
        report_type: 'attendance',
        report_name: reportName,
        filters:     JSON.stringify({ date: filterDate }),
        report_data: JSON.stringify(filteredAttendance)
    };

    try {
        const { error } = await supabaseClient.from('las_reports').insert([payload]);
        if (error) throw error;
        
        existingReportsToday.push({
            name: payload.report_name,
            dataString: payload.report_data
        }); 
        
    } catch (err) {
        console.error('Auto-save error:', err);
    }
}

// ── PRINT ──────────────────────────────────────────────────
window.printReport = async function() {
    if (filteredAttendance.length === 0) { alert("No records to print."); return; }
    if (!checkDuplicateWarning('Print')) return;

    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const nowStr  = `${dateStr} at ${timeStr}`;
    const filterD = document.getElementById('filterDate').value || 'All Dates';

    const cols = ['#','Student ID','Name','Course','Section','Subject Code','Subject Name','Lab','Professor','Date','Time In','Time Out','Dur.','Status','Face'];

    const rows = filteredAttendance.map((r, i) => {
        let dur = r.duration_minutes ? `${r.duration_minutes}m` : '—';
        if (!r.time_out && r.time_in) {
            const mins = Math.round((new Date() - new Date(r.time_in)) / 60000);
            dur = `${mins}m (ong.)`;
        }
        const tIn = r.time_in ? new Date(r.time_in).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'}) : '—';
        const tOut = r.time_out ? new Date(r.time_out).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'}) : (!r.time_out && r.time_in ? 'In Lab' : '—');
        
        const isLate = r.time_in_status === 'late';
        const status = isLate ? `Late (${r.late_minutes}m)` : 'On Time';
        const statusColor = isLate ? '#dc2626' : '#166534';
        
        const face = r.verified_by_facial_recognition ? 'Face' : 'Manual';
        const faceColor = r.verified_by_facial_recognition ? '#166534' : '#d97706';

        return `<tr class="${i % 2 === 1 ? 'even' : ''}">
            <td>${i+1}</td>
            <td><strong>${r.id_number}</strong></td>
            <td><strong>${r.student_full_name || r.student_name}</strong></td>
            <td>${r.course || '—'}</td>
            <td style="text-align:center">${r.class_section}</td>
            <td><strong>${r.subject_code}</strong></td>
            <td style="font-size:9px">${(r.subject_name||'').substring(0,20)}...</td>
            <td><strong>${r.lab_code}</strong></td>
            <td style="font-size:9px">${(r.professor_name||'').substring(0,15)}</td>
            <td>${r.session_date}</td>
            <td>${tIn}</td>
            <td>${tOut}</td>
            <td>${dur}</td>
            <td><span style="color: ${statusColor}; font-weight: bold;">${status.toUpperCase()}</span></td>
            <td><span style="color: ${faceColor}; font-weight: bold;">${face.toUpperCase()}</span></td>
        </tr>`;
    }).join('');

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Attendance Report</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;padding:20px;font-size:10px;color:#111}
        
        /* ── INK-SAVER WHITE BANNER HEADER ── */
        .header-container { 
            background-color: #ffffff; color: #000000; text-align: center; 
            margin-bottom: 20px; padding: 20px 15px; border: 2px solid #000000; border-radius: 8px;
        }
        .logos-text-wrapper { display: flex; justify-content: center; align-items: center; gap: 25px; margin-bottom: 10px; }
        .logo-img { height: 50px; width: auto; object-fit: contain; }
        .univ-title { font-size: 18px; font-weight: bold; color: #000000; line-height: 1.2; letter-spacing: 0.5px;}
        .college-title { font-size: 11px; color: #444444; letter-spacing: 1px; text-transform: uppercase;}
        .report-title { font-size: 16px; font-weight: bold; color: #000000; margin-top: 12px; text-transform: uppercase; letter-spacing: 1px;}
        .report-meta { font-size: 11px; color: #555555; margin-top: 5px; }
        
        table{width:100%;border-collapse:collapse; margin-top: 10px; border: 1px solid #000000 !important;}
        th{background:#ffffff;color:#000000;padding:8px 8px;text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px; border: 1px solid #000000 !important;}
        td{padding:8px 8px;border:1px solid #000000 !important;font-size:10px; text-align:center;}
        td:nth-child(2), td:nth-child(3), td:nth-child(6), td:nth-child(7), td:nth-child(9) {text-align:left;} 
        tr:nth-child(even){background:#f9fafb;}
        .footer{margin-top:20px;text-align:center;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:10px}
        @media print{body{padding:0px}}
    </style></head><body>
    
    <div class="header-container">
        <div class="logos-text-wrapper">
            <img src="../resc/assets/plp_logo.png" class="logo-img" alt="PLP Logo">
            <div>
                <div class="univ-title">PAMANTASAN NG LUNGSOD NG PASIG</div>
                <div class="college-title">College of Computer Studies</div>
            </div>
            <img src="../resc/assets/ccs_logo.png" class="logo-img" alt="CCS Logo">
        </div>
        <div class="report-title">STUDENT ATTENDANCE REPORT</div>
        <div class="report-meta">Generated: ${nowStr} &nbsp;&middot;&nbsp; Filter: ${filterD} &nbsp;&middot;&nbsp; Total Records: ${filteredAttendance.length}</div>
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
};

// ── PDF ────────────────────────────────────────────────────
// ── PDF ────────────────────────────────────────────────────
window.downloadPDF = async function() {
    if (filteredAttendance.length === 0) { alert("No records to export."); return; }
    if (!checkDuplicateWarning('PDF')) return;

    if (!window.jspdf) {
        alert('PDF library not loaded yet. Please try again.');
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc     = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const now     = new Date();
        const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const nowStr  = `${dateStr} at ${timeStr}`;
        const filterD = document.getElementById('filterDate').value || 'All Dates';
        const pageW   = doc.internal.pageSize.width;

        function loadImage(src) {
            return new Promise((resolve) => {
                const img = new Image(); img.crossOrigin = 'anonymous';
                img.onload = () => { try { const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height; canvas.getContext('2d').drawImage(img, 0, 0); resolve(canvas.toDataURL('image/png')); } catch(e) { resolve(null); } };
                img.onerror = () => resolve(null); img.src = src;
            });
        }

        const [plpData, ccsData] = await Promise.all([
            loadImage('../resc/assets/plp_logo.png'),
            loadImage('../resc/assets/ccs_logo.png')
        ]);

        const centerX = pageW / 2;
        const headerHeight = 45; 
        
        // ── DRAW THIN HEADER BORDER (WHITE BG) ──
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.1);
        doc.rect(10, 5, pageW - 20, headerHeight, 'S');
        
        const logoSize = 18;
        if (plpData) doc.addImage(plpData, 'PNG', centerX - 85, 10, logoSize, logoSize);
        if (ccsData) doc.addImage(ccsData, 'PNG', centerX + 67, 10, logoSize, logoSize);

        // ── CENTERED HEADER TEXT (BLACK) ──
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16); doc.setFont('helvetica', 'bold');
        doc.text('PAMANTASAN NG LUNGSOD NG PASIG', centerX, 18, { align: 'center' });
        
        doc.setFontSize(9); doc.setTextColor(60, 60, 60); doc.setFont('helvetica', 'normal');
        doc.text('COLLEGE OF COMPUTER STUDIES', centerX, 23, { align: 'center' });
        
        doc.setFontSize(14); doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'bold');
        doc.text('STUDENT ATTENDANCE REPORT', centerX, 33, { align: 'center' });
        
        doc.setFontSize(8); doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal');
        doc.text(`Generated: ${nowStr}  ·  Filter: ${filterD}  ·  Total Records: ${filteredAttendance.length}`, centerX, 39, { align: 'center' });

        const head = [['#','ID','Name','Course','Sec','Subj','Lab','Prof','Date','In','Out','Dur','Status','Face']];
        const body = filteredAttendance.map((r, i) => {
            let dur = r.duration_minutes ? `${r.duration_minutes}m` : '—';
            if (!r.time_out && r.time_in) {
                const mins = Math.round((new Date() - new Date(r.time_in)) / 60000);
                dur = `${mins}m`;
            }
            const tIn = r.time_in ? new Date(r.time_in).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'}) : '—';
            const tOut = r.time_out ? new Date(r.time_out).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'}) : (!r.time_out && r.time_in ? 'In Lab' : '—');
            const isLate = r.time_in_status === 'late';
            const status = isLate ? `Late (${r.late_minutes}m)` : 'On Time';
            const face = r.verified_by_facial_recognition ? 'Face' : 'Manual';
            
            return [
                i + 1, r.id_number, r.student_full_name || r.student_name, r.course || '—', r.class_section,
                r.subject_code, r.lab_code, (r.professor_name||'').substring(0,15),
                r.session_date, tIn, tOut, dur, status.toUpperCase(), face.toUpperCase()
            ];
        });

        doc.autoTable({
            head, body,
            startY: headerHeight + 10,
            margin: { left: 10, right: 10 },
            theme: 'grid',
            headStyles: { 
                fillColor: [255, 255, 255], 
                fontSize: 6.5, 
                fontStyle: 'bold', 
                textColor: [0, 0, 0], 
                lineColor: [0, 0, 0], 
                lineWidth: 0.1,
                halign: 'center', 
                valign: 'middle' 
            },
            styles: { 
                fontSize: 6.5, 
                cellPadding: 2, 
                valign: 'middle',
                lineColor: [0, 0, 0], 
                lineWidth: 0.1,
                textColor: [0, 0, 0]
            },
            columnStyles: {
                0: { cellWidth: 7, halign: 'center' },
                1: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
                2: { halign: 'left', fontStyle: 'bold' },
                3: { cellWidth: 10, halign: 'center' },
                4: { cellWidth: 12, halign: 'center' },
                5: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
                6: { cellWidth: 10, halign: 'center' },
                7: { halign: 'left' },
                8: { cellWidth: 16, halign: 'center' },
                9: { cellWidth: 14, halign: 'center' },
                10: { cellWidth: 14, halign: 'center' },
                11: { cellWidth: 10, halign: 'center' },
                12: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
                13: { cellWidth: 12, halign: 'center', fontStyle: 'bold' }
            },
            didParseCell(d) {
                if (d.column.index === 12 && d.section === 'body') {
                    const s = (d.cell.text[0] || '').toLowerCase();
                    if (s.includes('late')) { d.cell.styles.textColor = [220, 38, 38]; }
                    else { d.cell.styles.textColor = [22, 101, 52]; }
                }
                if (d.column.index === 13 && d.section === 'body') {
                    const s = (d.cell.text[0] || '').toLowerCase();
                    if (s === 'face') { d.cell.styles.textColor = [22, 101, 52]; }
                    if (s === 'manual') { d.cell.styles.textColor = [217, 119, 6]; }
                }
            }
        });

        const pages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i); doc.setFontSize(7); doc.setTextColor(156, 163, 175);
            doc.text(`Laboratory Attendance System  ·  Page ${i} of ${pages}  ·  ${nowStr}`,
                pageW / 2, doc.internal.pageSize.height - 8, { align: 'center' });
        }

        doc.save(`Attendance_Report_${filterD.replace(/\//g,'-')}.pdf`);
        await autoSaveReport('PDF');

    } catch (err) {
        console.error('PDF generation error:', err);
        alert('There was an error generating the PDF. Check the console.');
    }
};
// ── EXCEL ────────────────────────────────────────────────────
window.exportExcel = async function() {
    if (filteredAttendance.length === 0) { alert("No records to export."); return; }
    if (!checkDuplicateWarning('Excel')) return;

    if (!window.XLSX) {
        alert('Excel library not loaded. Please refresh the page.');
        return;
    }

    const wb = XLSX.utils.book_new();
    
    const headers = [
        '#', 'Student ID', 'Student Name', 'Course', 'Section', 
        'Subject Code', 'Lab Room', 'Professor', 'Date', 
        'Time In', 'Time Out', 'Duration', 'Status', 'Face Recognition'
    ];
    
    const rows = filteredAttendance.map((r, i) => {
        let dur = r.duration_minutes ? `${r.duration_minutes}m` : '—';
        if (!r.time_out && r.time_in) {
            const mins = Math.round((new Date() - new Date(r.time_in)) / 60000);
            dur = `${mins}m (ongoing)`;
        }
        
        const tIn = r.time_in ? new Date(r.time_in).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'}) : '—';
        const tOut = r.time_out ? new Date(r.time_out).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'}) : (!r.time_out && r.time_in ? 'In Lab' : '—');
        
        const isLate = r.time_in_status === 'late';
        const status = isLate ? `Late (${r.late_minutes}m)` : 'On Time';
        const face = r.verified_by_facial_recognition ? 'Registered' : 'Manual';

        return [
            i + 1, 
            r.id_number, 
            r.student_full_name || r.student_name, 
            r.course || '—', 
            r.class_section,
            r.subject_code, 
            r.lab_code, 
            (r.professor_name || '—'),
            r.session_date, 
            tIn, 
            tOut, 
            dur, 
            status, 
            face
        ];
    });

    const dataSheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Clean column widths for Excel
    dataSheet['!cols'] = [
        { wch: 5 },  // #
        { wch: 15 }, // Student ID
        { wch: 25 }, // Name
        { wch: 10 }, // Course
        { wch: 10 }, // Section
        { wch: 15 }, // Subject Code
        { wch: 10 }, // Lab
        { wch: 20 }, // Professor
        { wch: 15 }, // Date
        { wch: 12 }, // Time In
        { wch: 12 }, // Time Out
        { wch: 15 }, // Duration
        { wch: 15 }, // Status
        { wch: 15 }  // Face
    ];

    XLSX.utils.book_append_sheet(wb, dataSheet, 'Attendance Records');
    
    // Get date filter for the filename
    const filterD = document.getElementById('filterDate') ? document.getElementById('filterDate').value : 'All_Dates';
    XLSX.writeFile(wb, `Attendance_Report_${filterD.replace(/\//g,'-')}.xlsx`);
    
    await autoSaveReport('Excel');
};