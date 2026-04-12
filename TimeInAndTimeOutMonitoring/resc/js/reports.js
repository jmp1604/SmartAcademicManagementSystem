/* ============================================================
   resc/js/reports.js
   Dynamic Generation & Exporting Logic
============================================================ */

let allReports = [];
let filteredReports = [];

const typeConfig = {
    'sessions':   { label: 'Session Report',     icon: 'fa-desktop',            col: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
    'attendance': { label: 'Attendance Report',  icon: 'fa-clipboard-user',     col: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
    'professor':  { label: 'Professor Report',   icon: 'fa-chalkboard-teacher', col: '#92400e', bg: '#fffbeb', border: '#fde68a' },
    'student':    { label: 'Student Report',     icon: 'fa-user-graduate',      col: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff' }
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!supabaseClient) return;
    await loadReportsData();
    await loadDropdownDataForGenerator();
});

// ────────────────────────────────────────────
// 1. LOAD & RENDER TABLE (History Only)
// ────────────────────────────────────────────
async function loadReportsData() {
    const tbody = document.getElementById('reportsBody');
    try {
        const { data, error } = await supabaseClient.from('las_reports').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        allReports = data;
        executeClientFilter();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:var(--red)"><i class="fa-solid fa-triangle-exclamation"></i><p>Error loading reports.</p></td></tr>`;
    }
}

async function loadDropdownDataForGenerator() {
    const { data: profs } = await supabaseClient.from('professors').select('professor_id, first_name, last_name').eq('status', 'active');
    const profOpts = '<option value="">All</option>' + (profs||[]).map(p => `<option value="${p.professor_id}" data-name="${p.first_name} ${p.last_name}">${p.last_name}, ${p.first_name}</option>`).join('');
    document.getElementById('gf-prof').innerHTML = profOpts;
    document.getElementById('gf-p-prof').innerHTML = profOpts;

    const { data: subjs } = await supabaseClient.from('subjects').select('subject_id, subject_code, subject_name');
    const subjOpts = '<option value="">All</option>' + (subjs||[]).map(s => `<option value="${s.subject_id}" data-code="${s.subject_code}">${s.subject_code} — ${s.subject_name}</option>`).join('');
    document.getElementById('gf-subj').innerHTML = subjOpts;
    document.getElementById('gf-st-subj').innerHTML = subjOpts;

    const { data: labs } = await supabaseClient.from('laboratory_rooms').select('lab_id, lab_code');
    document.getElementById('gf-lab').innerHTML = '<option value="">All</option>' + (labs||[]).map(l => `<option value="${l.lab_id}" data-code="${l.lab_code}">${l.lab_code}</option>`).join('');
}

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
        if (q && !`${r.report_name} ${r.report_id}`.toLowerCase().includes(q)) return false;
        return true;
    });

    document.getElementById('statTotalAll').textContent = allReports.length;
    document.getElementById('recordCountDisplay').textContent = filteredReports.length;
    document.getElementById('btnDeleteAll').style.display = allReports.length > 0 ? 'inline-flex' : 'none';

    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('reportsBody');
    if (filteredReports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><i class="fa-solid fa-file-circle-plus"></i><h3>No reports found</h3></td></tr>`;
        return;
    }

    tbody.innerHTML = filteredReports.map((r) => {
        const tc = typeConfig[r.report_type] || { label: r.report_type, icon: 'fa-file', col: '#555', bg: '#f5f5f5', border: '#ddd' };
        let filtersObj = {}; try { filtersObj = JSON.parse(r.filters || '{}'); } catch(e){}
        let chips = [];
        if (filtersObj.date_from) chips.push(`${filtersObj.date_from} → ${filtersObj.date_to || '...'}`);
        const filterDisplay = chips.length > 0 ? chips.join(' &middot; ') : '<span style="color:var(--s300);font-style:italic">All Data</span>';
        const d = new Date(r.created_at);

        return `
            <tr>
                <td class="mono" style="color:var(--s500)">${r.report_id}</td>
                <td><div style="font-weight:700;color:var(--green-dark)">${escapeHtml(r.report_name)}</div></td>
                <td><span class="type-badge" style="background:${tc.bg}; color:${tc.col}; border:1px solid ${tc.border}"><i class="fa-solid ${tc.icon}"></i> ${tc.label}</span></td>
                <td style="font-size:12px;color:var(--s500);max-width:220px">${filterDisplay}</td>
                <td><div style="font-size:13px;font-weight:600">${d.toLocaleDateString()}</div></td>
                <td style="text-align:center;">
                    <button class="act-btn act-del" style="margin:0 auto;" onclick="deleteReport('${r.report_id}')"><i class="fa-solid fa-trash"></i> Delete</button>
                </td>
            </tr>`;
    }).join('');
}

// ────────────────────────────────────────────
// 2. GENERATION MODAL & EXPORT LOGIC
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
    
    const mo = new Date().toLocaleDateString('en-US', { month:'long', year:'numeric' });
    document.getElementById('genName').value = `${typeConfig[type].label} — ${mo}`;
}

function collectFilters() {
    const f = {};
    const setIf = (key, val) => { if (val) f[key] = val; };
    if (['sessions', 'attendance'].includes(window.selType)) {
        setIf('date_from', document.getElementById('gf-date-from').value);
        setIf('date_to',   document.getElementById('gf-date-to').value);
        setIf('professor_id', document.getElementById('gf-prof').value);
        setIf('subject_id', document.getElementById('gf-subj').value);
        setIf('status', document.getElementById('gf-status').value);
        setIf('lab_id', document.getElementById('gf-lab').value);
    }
    return f;
}

window.generateReport = async function(exportType) {
    if (!window.selType) { showToast('Please select a report type.', 'error'); return; }
    const name = document.getElementById('genName').value.trim();
    if (!name) { showToast('Please enter a report name.', 'error'); return; }
    
    // Disable buttons during generation
    const btnGroup = document.getElementById('exportBtnGroup');
    const ogHtml = btnGroup.innerHTML;
    btnGroup.innerHTML = '<div style="padding:10px; font-weight:bold; color:var(--green-dark)"><i class="fa-solid fa-spinner fa-spin"></i> Processing...</div>';

    const filters = collectFilters();
    let reportData = [];

    try {
        // FETCH DATA
        if (window.selType === 'sessions') {
            let q = supabaseClient.from('lab_sessions').select(`session_date, status, actual_start_time, actual_end_time, lab_schedules(section, subjects(subject_code), professors(last_name), laboratory_rooms(lab_code))`);
            if (filters.date_from) q = q.gte('session_date', filters.date_from);
            if (filters.date_to) q = q.lte('session_date', filters.date_to);
            if (filters.status) q = q.eq('status', filters.status);
            const { data } = await q;
            reportData = (data||[]).map(r => ({ Date: r.session_date, Subject: r.lab_schedules?.subjects?.subject_code, Professor: r.lab_schedules?.professors?.last_name, Lab: r.lab_schedules?.laboratory_rooms?.lab_code, Status: r.status.toUpperCase(), Started: r.actual_start_time||'—', Ended: r.actual_end_time||'—' }));

        } else if (window.selType === 'attendance') {
            let q = supabaseClient.from('lab_attendance').select(`time_in, time_out, time_in_status, late_minutes, students(id_number, last_name, first_name), lab_sessions(session_date, lab_schedules(subjects(subject_code)))`);
            if (filters.date_from) q = q.gte('lab_sessions.session_date', filters.date_from);
            if (filters.date_to) q = q.lte('lab_sessions.session_date', filters.date_to);
            const { data } = await q;
            reportData = (data||[]).map(r => ({ ID: r.students?.id_number, Name: `${r.students?.last_name}, ${r.students?.first_name}`, Date: r.lab_sessions?.session_date, Subject: r.lab_sessions?.lab_schedules?.subjects?.subject_code, In: r.time_in ? new Date(r.time_in).toLocaleTimeString() : '—', Out: r.time_out ? new Date(r.time_out).toLocaleTimeString() : '—', Status: r.time_in_status, LateMins: r.late_minutes }));
        }

        if (reportData.length === 0) {
            showToast('No data found for selected filters.', 'error');
            btnGroup.innerHTML = ogHtml;
            return;
        }

        // TRIGGER DYNAMIC EXPORT
        if (exportType === 'Print') executePrint(reportData, name);
        else if (exportType === 'PDF') executePDF(reportData, name);
        else if (exportType === 'Excel') executeExcel(reportData, name);

        // SAVE TO HISTORY LOG
        await supabaseClient.from('las_reports').insert([{ report_type: window.selType, report_name: name, filters: JSON.stringify(filters), report_data: JSON.stringify([]) }]);
        
        closeGenModal();
        showToast(`${exportType} Generated & Logged!`);
        await loadReportsData();

    } catch(err) {
        showToast('Error: ' + err.message, 'error');
    } finally {
        if(document.getElementById('exportBtnGroup')) document.getElementById('exportBtnGroup').innerHTML = ogHtml;
    }
}

// ────────────────────────────────────────────
// 3. DYNAMIC EXPORT BUILDERS (INK SAVER)
// ────────────────────────────────────────────
function executePrint(data, reportName) {
    const cols = Object.keys(data[0]);
    const rows = data.map((r, i) => `<tr style="background:${i%2===0?'#fff':'#f9fafb'}"><td>${i+1}</td>${cols.map(c => `<td>${r[c]||'—'}</td>`).join('')}</tr>`).join('');
    const nowStr = new Date().toLocaleString();
    
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>${reportName}</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;padding:20px;font-size:11px;color:#111}
        .header-container { background-color: #ffffff; color: #000000; text-align: center; margin-bottom: 20px; padding: 20px 15px; border: 2px solid #000000; border-radius: 8px; }
        .report-title { font-size: 16px; font-weight: bold; margin-top: 12px; text-transform: uppercase; }
        table{width:100%;border-collapse:collapse; margin-top: 10px; border: 1px solid #000000 !important;}
        th{background:#ffffff; color:#000000; padding:8px 10px; text-align:center; font-size:10px; font-weight:700; text-transform:uppercase; border: 1px solid #000000 !important;}
        td{padding:8px 10px; border: 1px solid #000000 !important; font-size:11px; text-align:center;}
    </style></head><body>
    <div class="header-container">
        <div class="report-title">${reportName}</div>
        <div style="font-size: 11px; color: #555; margin-top: 5px;">Generated: ${nowStr} &middot; Total Records: ${data.length}</div>
    </div>
    <table><thead><tr><th>#</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script>
    </body></html>`);
    w.document.close();
}

function executePDF(data, reportName) {
    if (!window.jspdf) { showToast('PDF library not loaded.', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');
    const nowStr = new Date().toLocaleString();
    const pageW = doc.internal.pageSize.width;
    
    // Thin Ink Saver Border
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.1);
    doc.rect(10, 5, pageW - 20, 30, 'S');
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(reportName.toUpperCase(), pageW / 2, 18, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${nowStr}  ·  Total Records: ${data.length}`, pageW / 2, 26, { align: 'center' });
    
    const head = [['#', ...Object.keys(data[0])]];
    const body = data.map((r, i) => [i + 1, ...Object.values(r)]);
    
    doc.autoTable({
        head, body, startY: 40, margin: { left: 10, right: 10 }, theme: 'grid',
        headStyles: { fillColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.1, halign: 'center' },
        styles: { fontSize: 7, cellPadding: 3, valign: 'middle', lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0], halign: 'center' }
    });
    
    doc.save(`${reportName.replace(/\s+/g, '_')}.pdf`);
}

function executeExcel(data, reportName) {
    if (!window.XLSX) { showToast('Excel library not loaded.', 'error'); return; }
    const wb = XLSX.utils.book_new();
    const headers = Object.keys(data[0]);
    const rows = data.map(r => Object.values(r));
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'Report Data');
    XLSX.writeFile(wb, `${reportName.replace(/\s+/g, '_')}.xlsx`);
}

// ────────────────────────────────────────────
// 4. DELETIONS
// ────────────────────────────────────────────
window.deleteReport = async function(id) {
    if (!confirm("Are you sure you want to delete this report log?")) return;
    try {
        await supabaseClient.from('las_reports').delete().eq('report_id', id);
        showToast('Report deleted.');
        await loadReportsData();
    } catch (err) { showToast('Error deleting report.', 'error'); }
}

window.openDelAllModal = function() { document.getElementById('delAllModal').classList.add('on'); }
window.closeDelAllModal = function() { document.getElementById('delAllModal').classList.remove('on'); }

window.executeDeleteAll = async function() {
    try {
        await supabaseClient.from('las_reports').delete().neq('report_id', 0);
        document.getElementById('delAllModal').classList.remove('on');
        showToast('All reports deleted.');
        await loadReportsData();
    } catch (err) { showToast('Error deleting reports.', 'error'); }
}

function escapeHtml(str) { return String(str||'').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> <span>${msg}</span>`;
    t.className = `toast on ${type}`;
    t.style.background = type === 'success' ? 'var(--green-dark)' : 'var(--red)';
    setTimeout(() => t.classList.remove('on'), 3500);
}