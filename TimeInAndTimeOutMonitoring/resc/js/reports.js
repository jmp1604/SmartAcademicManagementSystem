/* ============================================================
   resc/js/reports.js
   Replaces PHP queries with Supabase JS client for Reports
============================================================ */

let allReports = [];
let filteredReports = [];

const typeConfig = {
    'sessions':     { label: 'Session Report',     icon: 'fa-desktop',            col: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
    'attendance':   { label: 'Attendance Report',  icon: 'fa-clipboard-user',     col: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
    'professor':    { label: 'Professor Report',   icon: 'fa-chalkboard-teacher', col: '#92400e', bg: '#fffbeb', border: '#fde68a' },
    'professors':   { label: 'Professors Report',  icon: 'fa-chalkboard-teacher', col: '#92400e', bg: '#fffbeb', border: '#fde68a' },
    'student':      { label: 'Student Report',     icon: 'fa-user-graduate',      col: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff' },
    'students':     { label: 'Students List',      icon: 'fa-users',              col: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff' },
    'schedules':    { label: 'Schedules Report',   icon: 'fa-calendar-days',      col: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' },
    'enrollment':   { label: 'Enrollment Report',  icon: 'fa-user-plus',          col: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
    'laboratories': { label: 'Laboratories Report',icon: 'fa-flask',              col: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
    'subjects':     { label: 'Subjects Report',    icon: 'fa-book',               col: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' }
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!supabaseClient) {
        console.error('Supabase client not initialized.');
        return;
    }
    await loadReportsData();
    await loadDropdownDataForGenerator();
});

// ────────────────────────────────────────────
// 1. DATA LOADING 
// ────────────────────────────────────────────
async function loadReportsData() {
    const tbody = document.getElementById('reportsBody');
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading reports...</p></td></tr>`;

    try {
        const { data, error } = await supabaseClient
            .from('las_reports')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        allReports = data;
        executeClientFilter();

    } catch (error) {
        console.error('Error loading reports:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:var(--red)"><i class="fa-solid fa-triangle-exclamation"></i><p>Error loading reports.</p></td></tr>`;
    }
}

async function loadDropdownDataForGenerator() {
    const { data: profs } = await supabaseClient.from('professors').select('professor_id, first_name, last_name').eq('status', 'active').order('last_name');
    const profOpts = '<option value="">All</option>' + (profs||[]).map(p => `<option value="${p.professor_id}" data-name="${p.first_name} ${p.last_name}">${p.last_name}, ${p.first_name}</option>`).join('');
    document.getElementById('gf-prof').innerHTML = profOpts;
    document.getElementById('gf-p-prof').innerHTML = profOpts;

    const { data: subjs } = await supabaseClient.from('subjects').select('subject_id, subject_code, subject_name').order('subject_code');
    const subjOpts = '<option value="">All</option>' + (subjs||[]).map(s => `<option value="${s.subject_id}" data-code="${s.subject_code}">${s.subject_code} — ${s.subject_name}</option>`).join('');
    document.getElementById('gf-subj').innerHTML = subjOpts;
    document.getElementById('gf-st-subj').innerHTML = subjOpts;

    const { data: labs } = await supabaseClient.from('laboratory_rooms').select('lab_id, lab_code').order('lab_code');
    document.getElementById('gf-lab').innerHTML = '<option value="">All</option>' + (labs||[]).map(l => `<option value="${l.lab_id}" data-code="${l.lab_code}">${l.lab_code}</option>`).join('');
}

// ────────────────────────────────────────────
// 2. FILTERING & RENDERING
// ────────────────────────────────────────────
window.applyFilters = function() { executeClientFilter(); }

window.resetFilters = function() {
    document.getElementById('filterSearch').value = '';
    document.getElementById('filterType').value = '';
    document.getElementById('filterFrom').value = '';
    document.getElementById('filterTo').value = '';
    executeClientFilter();
}

function executeClientFilter() {
    const q = document.getElementById('filterSearch').value.toLowerCase().trim();
    const type = document.getElementById('filterType').value;
    const from = document.getElementById('filterFrom').value;
    const to = document.getElementById('filterTo').value;

    filteredReports = allReports.filter(r => {
        if (type && r.report_type !== type) return false;
        const rDate = r.created_at.split('T')[0];
        if (from && rDate < from) return false;
        if (to && rDate > to) return false;
        if (q) {
            const searchStr = `${r.report_name} ${r.report_id}`.toLowerCase();
            if (!searchStr.includes(q)) return false;
        }
        return true;
    });

    updateStats();
    renderTable();
}

function updateStats() {
    let s_sess = 0, s_att = 0, s_prof = 0, s_stu = 0;
    allReports.forEach(r => {
        if (r.report_type === 'sessions') s_sess++;
        else if (r.report_type === 'attendance') s_att++;
        else if (r.report_type === 'professor' || r.report_type === 'professors') s_prof++;
        else if (r.report_type === 'student' || r.report_type === 'students' || r.report_type === 'enrollment') s_stu++;
    });
    document.getElementById('statTotalAll').textContent = allReports.length;
    document.getElementById('statSessions').textContent = s_sess;
    document.getElementById('statAttendance').textContent = s_att;
    document.getElementById('statProfessor').textContent = s_prof;
    document.getElementById('statStudent').textContent = s_stu;
    document.getElementById('recordCountDisplay').textContent = filteredReports.length;
    document.getElementById('btnDeleteAll').style.display = allReports.length > 0 ? 'inline-flex' : 'none';
}

function renderTable() {
    const tbody = document.getElementById('reportsBody');
    if (filteredReports.length === 0) {
        const msg = allReports.length > 0 ? 'No reports match your filters.' : 'No reports generated yet.';
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><i class="fa-solid fa-file-circle-plus"></i><h3>${msg}</h3><p>Use the Generate Report button to create one.</p></td></tr>`;
        return;
    }

    tbody.innerHTML = filteredReports.map((r) => {
        const tc = typeConfig[r.report_type] || { label: r.report_type, icon: 'fa-file', col: '#555', bg: '#f5f5f5', border: '#ddd' };
        let filtersObj = {};
        try { filtersObj = JSON.parse(r.filters || '{}'); } catch(e){}
        let chips = [];
        if (filtersObj.date_from || filtersObj.date_to) chips.push(`${filtersObj.date_from || '...'} → ${filtersObj.date_to || '...'}`);
        if (filtersObj.professor_name) chips.push(filtersObj.professor_name);
        if (filtersObj.subject_code) chips.push(filtersObj.subject_code);
        if (filtersObj.status) chips.push(filtersObj.status.charAt(0).toUpperCase() + filtersObj.status.slice(1));
        const filterDisplay = chips.length > 0 ? chips.join(' &middot; ') : '<span style="color:var(--s300);font-style:italic">All Data</span>';
        const d = new Date(r.created_at);

        return `
            <tr>
                <td class="mono" style="color:var(--s500)">${r.report_id}</td>
                <td>
                    <div style="font-weight:700;font-size:13.5px;color:var(--green-dark)">${escapeHtml(r.report_name)}</div>
                    <div class="mono" style="font-size:10.5px;color:var(--text-muted);margin-top:2px">ID #${r.report_id}</div>
                </td>
                <td>
                    <span class="type-badge" style="background:${tc.bg}; color:${tc.col}; border:1px solid ${tc.border}">
                        <i class="fa-solid ${tc.icon}"></i> ${tc.label}
                    </span>
                </td>
                <td style="font-size:12px;color:var(--s500);max-width:220px">${filterDisplay}</td>
                <td>
                    <div style="font-size:13px;font-weight:600">${d.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}</div>
                    <div class="mono" style="font-size:11px;color:var(--text-muted)">${d.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'})}</div>
                </td>
                <td>
                    <div class="act-row">
                        <button class="act-btn act-print" onclick="triggerPrint('${r.report_id}')"><i class="fa-solid fa-print"></i> Print</button>
                        <button class="act-btn act-pdf" onclick="triggerPDF('${r.report_id}')"><i class="fa-solid fa-file-pdf"></i> PDF</button>
                        <button class="act-btn act-excel" onclick="triggerExcel('${r.report_id}')"><i class="fa-solid fa-file-excel"></i> Excel</button>
                        <button class="act-btn act-del" onclick="deleteReport('${r.report_id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

// ────────────────────────────────────────────
// 3. GENERATION MODAL & LOGIC
// ────────────────────────────────────────────
window.openGenModal = function() { document.getElementById('genModal').classList.add('on'); }
window.closeGenModal = function() { document.getElementById('genModal').classList.remove('on'); window.selType = ''; }

window.selectType = function(type) {
    window.selType = type;
    document.querySelectorAll('.rt-card').forEach(c => c.classList.remove('sel'));
    document.getElementById('rtc-' + type).classList.add('sel');
    document.getElementById('gfSection').style.display = 'block';
    document.getElementById('gf-sa').style.display = ['sessions', 'attendance'].includes(type) ? 'grid' : 'none';
    document.getElementById('gf-p').style.display  = type === 'professor' ? 'grid' : 'none';
    document.getElementById('gf-st').style.display = type === 'student'   ? 'grid' : 'none';
    
    const nameEl = document.getElementById('genName');
    const mo = new Date().toLocaleDateString('en-US', { month:'long', year:'numeric' });
    const labels = { sessions:'Session Report', attendance:'Attendance Report', professor:'Professor Report', student:'Student Report' };
    nameEl.value = `${labels[type] || 'System Report'} — ${mo}`;
}

function collectFilters() {
    const f = {};
    const setIf = (key, val) => { if (val) f[key] = val; };
    if (['sessions', 'attendance'].includes(window.selType)) {
        const ps = document.getElementById('gf-prof');
        const ss = document.getElementById('gf-subj');
        const ls = document.getElementById('gf-lab');
        setIf('date_from', document.getElementById('gf-date-from').value);
        setIf('date_to',   document.getElementById('gf-date-to').value);
        setIf('professor_id', ps.value);
        setIf('professor_name', ps.value ? ps.options[ps.selectedIndex].dataset.name : '');
        setIf('subject_id', ss.value);
        setIf('subject_code', ss.value ? ss.options[ss.selectedIndex].dataset.code : '');
        setIf('status', document.getElementById('gf-status').value);
        setIf('lab_id', ls.value);
        setIf('lab_code', ls.value ? ls.options[ls.selectedIndex].dataset.code : '');
    } else if (window.selType === 'professor') {
        const ps = document.getElementById('gf-p-prof');
        setIf('professor_id', ps.value);
        setIf('professor_name', ps.value ? ps.options[ps.selectedIndex].dataset.name : '');
        setIf('date_from', document.getElementById('gf-p-from').value);
        setIf('date_to',   document.getElementById('gf-p-to').value);
    } else if (window.selType === 'student') {
        const ss = document.getElementById('gf-st-subj');
        setIf('subject_id', ss.value);
        setIf('subject_code', ss.value ? ss.options[ss.selectedIndex].dataset.code : '');
        setIf('date_from', document.getElementById('gf-st-from').value);
        setIf('date_to',   document.getElementById('gf-st-to').value);
    }
    return f;
}

window.generateReport = async function() {
    if (!window.selType) { showToast('Please select a report type.', 'error'); return; }
    const name = document.getElementById('genName').value.trim();
    if (!name) { showToast('Please enter a report name.', 'error'); return; }
    
    const btn = document.querySelector('.btn-generate');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching Data...';

    const filters = collectFilters();
    let reportData = [];

    try {
        if (window.selType === 'sessions') {
            let query = supabaseClient.from('lab_sessions').select(`
                session_date, status, actual_start_time, actual_end_time,
                lab_schedules ( section, subjects(subject_code), professors(last_name), laboratory_rooms(lab_code) )
            `);
            if (filters.date_from) query = query.gte('session_date', filters.date_from);
            if (filters.date_to) query = query.lte('session_date', filters.date_to);
            if (filters.status) query = query.eq('status', filters.status);
            
            const { data } = await query;
            reportData = (data || []).map(r => ({
                Date: r.session_date,
                Subject: r.lab_schedules?.subjects?.subject_code,
                Professor: r.lab_schedules?.professors?.last_name,
                Lab: r.lab_schedules?.laboratory_rooms?.lab_code,
                Status: r.status.toUpperCase(),
                Started: r.actual_start_time || '—',
                Ended: r.actual_end_time || '—'
            }));

        } else if (window.selType === 'attendance') {
            let query = supabaseClient.from('lab_attendance').select(`
                time_in, time_out, duration_minutes, time_in_status, late_minutes,
                students ( id_number, last_name, first_name ),
                lab_sessions ( session_date, lab_schedules ( subjects(subject_code) ) )
            `);
            if (filters.date_from) query = query.gte('lab_sessions.session_date', filters.date_from);
            if (filters.date_to) query = query.lte('lab_sessions.session_date', filters.date_to);
            
            const { data } = await query;
            reportData = (data || []).map(r => ({
                StudentID: r.students?.id_number,
                Name: `${r.students?.last_name}, ${r.students?.first_name}`,
                Date: r.lab_sessions?.session_date,
                Subject: r.lab_sessions?.lab_schedules?.subjects?.subject_code,
                In: r.time_in ? new Date(r.time_in).toLocaleTimeString() : '—',
                Out: r.time_out ? new Date(r.time_out).toLocaleTimeString() : 'In Lab',
                Status: r.time_in_status,
                LateMins: r.late_minutes
            }));

        } else if (window.selType === 'professor') {
            let query = supabaseClient.from('lab_sessions').select(`
                session_date, status,
                lab_schedules!inner ( professor_id, subjects(subject_code) )
            `).eq('lab_schedules.professor_id', filters.professor_id);
            if (filters.date_from) query = query.gte('session_date', filters.date_from);
            if (filters.date_to) query = query.lte('session_date', filters.date_to);
            
            const { data } = await query;
            reportData = (data || []).map(r => ({
                Date: r.session_date,
                Subject: r.lab_schedules?.subjects?.subject_code,
                Status: r.status
            }));
        }

        if (reportData.length === 0) {
            showToast('No data found for the selected filters.', 'error');
            return;
        }

        const payload = {
            report_type: window.selType,
            report_name: name,
            filters: JSON.stringify(filters),
            report_data: JSON.stringify(reportData),
            created_at: new Date().toISOString()
        };

        const { error: saveError } = await supabaseClient.from('las_reports').insert([payload]);
        if (saveError) throw saveError;
        
        closeGenModal(); 
        showToast('Report generated and saved!'); 
        await loadReportsData();

    } catch(err) {
        console.error('Report Generation Error:', err);
        showToast('Failed to generate report: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ────────────────────────────────────────────
// 4. DELETIONS
// ────────────────────────────────────────────
window.deleteReport = async function(id) {
    if (!confirm("Are you sure you want to delete this report?")) return;
    try {
        const { error } = await supabaseClient.from('las_reports').delete().eq('report_id', id);
        if (error) throw error;
        showToast('Report deleted.');
        await loadReportsData();
    } catch (err) { showToast('Error deleting report.', 'error'); }
}

window.executeDeleteAll = async function() {
    try {
        const { error } = await supabaseClient.from('las_reports').delete().neq('report_id', 0);
        if (error) throw error;
        document.getElementById('delAllModal').classList.remove('on');
        showToast('All reports deleted.');
        await loadReportsData();
    } catch (err) { showToast('Error deleting reports.', 'error'); }
}

// ────────────────────────────────────────────
// 5. EXPORTS & UTILS
// ────────────────────────────────────────────
function getReportData(id) {
    const report = allReports.find(r => r.report_id == id);
    if (!report) return null;
    let data = [], filters = {};
    try { data = JSON.parse(report.report_data || '[]'); filters = JSON.parse(report.filters || '{}'); } catch(e){}
    return { ...report, parsedData: data, parsedFilters: filters };
}

window.triggerExcel = function(id) {
    const r = getReportData(id);
    if (!r || !r.parsedData.length) { showToast('No data to export.', 'error'); return; }
    const headers = Object.keys(r.parsedData[0]);
    const csv = [headers.join(','), ...r.parsedData.map(row => headers.map(h => `"${(row[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `Report_${id}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showToast('CSV exported!');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> <span>${msg}</span>`;
    t.className = `toast on ${type}`;
    t.style.background = type === 'success' ? 'var(--green-dark)' : 'var(--red)';
    setTimeout(() => t.classList.remove('on'), 3500);
}