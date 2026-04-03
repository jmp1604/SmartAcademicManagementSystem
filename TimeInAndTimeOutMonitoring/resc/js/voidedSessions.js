/* ============================================================
   resc/js/voidedSessions.js
   Integrative Programming — Serverless Session History
============================================================ */

let allSessions = []; // Holds the master list of data from Supabase
let filteredSessions = []; // Holds the data currently being viewed

// Ensure Supabase is connected
document.addEventListener('DOMContentLoaded', async () => {
    if (!supabaseClient) {
        alert("Supabase client not found. Please check config/.env.js");
        return;
    }
    
    await loadDropdownData();
    await fetchSessions();
});

// ── 1. INITIALIZE DROPDOWNS ──
async function loadDropdownData() {
    // Fetch Professors
    const { data: profs } = await supabaseClient.from('professors').select('professor_id, first_name, last_name').eq('status', 'active');
    if (profs) {
        const sel = document.getElementById('filterProfessor');
        profs.forEach(p => sel.add(new Option(`${p.first_name} ${p.last_name}`, p.professor_id)));
    }

    // Fetch Subjects
    const { data: subs } = await supabaseClient.from('subjects').select('subject_id, subject_code');
    if (subs) {
        const sel = document.getElementById('filterSubject');
        subs.forEach(s => sel.add(new Option(s.subject_code, s.subject_id)));
    }

    // Fetch Labs
    const { data: labs } = await supabaseClient.from('laboratory_rooms').select('lab_id, lab_code');
    if (labs) {
        const sel = document.getElementById('filterLab');
        labs.forEach(l => sel.add(new Option(l.lab_code, l.lab_id)));
    }
}

// ── 2. FETCH ALL SESSIONS FROM SUPABASE ──
async function fetchSessions() {
    document.getElementById('resultsCountText').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching data...';

    // This nested query pulls the session AND its related schedule, subject, and professor!
    const { data, error } = await supabaseClient
        .from('lab_sessions')
        .select(`
            session_id, session_date, status, actual_start_time, actual_end_time, notes,
            lab_schedules (
                section, start_time, end_time, day_of_week,
                subjects (subject_id, subject_code, subject_name),
                professors (professor_id, first_name, last_name),
                laboratory_rooms (lab_id, lab_code, building)
            )
        `)
        .order('session_date', { ascending: false });

    if (error) {
        console.error(error);
        alert("Error fetching data from Supabase");
        return;
    }

    allSessions = data || [];
    applyFilters(); // Render everything initially
}

// ── 3. FILTER & RENDER DATA ──
function applyFilters() {
    const search = document.getElementById('filterSearch').value.toLowerCase();
    const profId = document.getElementById('filterProfessor').value;
    const subId  = document.getElementById('filterSubject').value;
    const labId  = document.getElementById('filterLab').value;
    const dateF  = document.getElementById('filterDateFrom').value;
    const dateT  = document.getElementById('filterDateTo').value;

    filteredSessions = allSessions.filter(s => {
        const sch = s.lab_schedules;
        if (!sch) return false;

        let match = true;
        
        // Match Search (Subject Code, Professor Name, or Section)
        if (search) {
            const profName = `${sch.professors.first_name} ${sch.professors.last_name}`.toLowerCase();
            const subCode = sch.subjects.subject_code.toLowerCase();
            if (!profName.includes(search) && !subCode.includes(search) && !sch.section.toLowerCase().includes(search)) match = false;
        }

        // Match Dropdowns
        if (profId && sch.professors.professor_id != profId) match = false;
        if (subId && sch.subjects.subject_id != subId) match = false;
        if (labId && sch.laboratory_rooms.lab_id != labId) match = false;

        // Match Dates
        if (dateF && s.session_date < dateF) match = false;
        if (dateT && s.session_date > dateT) match = false;

        return match;
    });

    renderTable();
    updateStats();
}

function resetFilters() {
    document.getElementById('filterSearch').value = '';
    document.getElementById('filterProfessor').value = '';
    document.getElementById('filterSubject').value = '';
    document.getElementById('filterLab').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    applyFilters();
}

// ── 4. RENDER TABLE TO HTML ──
function renderTable() {
    const tbody = document.getElementById('sessionsTableBody');
    tbody.innerHTML = '';

    document.getElementById('resultsCountText').innerHTML = `Showing <strong>${filteredSessions.length}</strong> sessions`;

    if (filteredSessions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="empty"><h3>No sessions found</h3></td></tr>`;
        return;
    }

    filteredSessions.forEach((s, index) => {
        const sch = s.lab_schedules;
        const profName = `${sch.professors.first_name} ${sch.professors.last_name}`;
        
        // Format times (Removing seconds for UI)
        const s_start = sch.start_time.substring(0, 5);
        const s_end   = sch.end_time.substring(0, 5);
        const a_start = s.actual_start_time ? s.actual_start_time.substring(0, 5) : '—';
        const a_end   = s.actual_end_time ? s.actual_end_time.substring(0, 5) : '—';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>
                <div style="font-weight:600">${s.session_date}</div>
                <div style="font-size:11px;color:var(--s500)">${sch.day_of_week}</div>
            </td>
            <td>
                <div class="subj-code">${sch.subjects.subject_code}</div>
                <div class="subj-name">${sch.subjects.subject_name}</div>
            </td>
            <td>${profName}</td>
            <td><span class="badge" style="background:var(--s100);color:var(--s900)">${sch.section}</span></td>
            <td><strong>${sch.laboratory_rooms.lab_code}</strong></td>
            <td>
                <div class="t-sched">${s_start} – ${s_end}</div>
                <div class="t-actual">${a_start} – ${a_end}</div>
            </td>
            <td><span class="badge ${s.status}">${s.status.toUpperCase()}</span></td>
            <td>
                ${s.status === 'completed' 
                    ? `<a href="#" class="act-btn act-view"><i class="fa-solid fa-users"></i></a>` 
                    : `—`}
            </td>
            <td>
                <button class="btn-del-row" onclick="deleteSession(${s.session_id})"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateStats() {
    const container = document.getElementById('statusPillsContainer');
    const counts = { total: filteredSessions.length, completed: 0, cancelled: 0, ongoing: 0, scheduled: 0 };
    
    filteredSessions.forEach(s => counts[s.status] = (counts[s.status] || 0) + 1);

    container.innerHTML = `
        <div class="pill p-all on"><i class="fa-solid fa-border-all"></i> All <b>${counts.total}</b></div>
        ${counts.completed ? `<div class="pill p-done"><i class="fa-solid fa-check"></i> Completed <b>${counts.completed}</b></div>` : ''}
        ${counts.cancelled ? `<div class="pill p-void"><i class="fa-solid fa-ban"></i> Voided <b>${counts.cancelled}</b></div>` : ''}
        ${counts.ongoing   ? `<div class="pill p-live"><i class="fa-solid fa-tower-broadcast"></i> Ongoing <b>${counts.ongoing}</b></div>` : ''}
    `;
}

// ── 5. DELETE OPERATIONS (Supabase directly) ──
async function deleteSession(id) {
    if (!confirm(`Are you sure you want to delete Session ID: ${id}?`)) return;
    
    // Supabase Delete Command
    const { error } = await supabaseClient.from('lab_sessions').delete().eq('session_id', id);
    if (!error) {
        alert("Session deleted successfully.");
        fetchSessions(); // Refresh data from cloud
    } else {
        alert("Error deleting session.");
    }
}

function showDeleteAll() { document.getElementById('delAllModal').classList.add('on'); }
function closeDelAll()   { document.getElementById('delAllModal').classList.remove('on'); }

async function deleteAllSessions() {
    const { error } = await supabaseClient.from('lab_sessions').delete().neq('session_id', 0); // Hack to delete all
    if (!error) {
        alert("All sessions have been wiped.");
        closeDelAll();
        fetchSessions();
    } else {
        alert("Error wiping sessions.");
    }
}

// ── 6. REPORT GENERATION ──

// ── State ─────────────────────────────────────────────────────
let META = {};                 // stats + filter info for print/PDF headers
let existingReportsToday = []; // stores objects: { name, dataString }

async function openReportModal() {
    document.getElementById('rmModal').classList.add('on');
    
    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = '';
    
    // Only show completed sessions in the report
    const reportData = filteredSessions.filter(s => s.status === 'completed');

    // ── Build META (mirrors laboratories.js pattern) ──────────
    const completed = reportData.length;
    const cancelled = filteredSessions.filter(s => s.status === 'cancelled').length;
    const ongoing   = filteredSessions.filter(s => s.status === 'ongoing').length;
    const genDate   = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Capture active filter labels for the report header
    const profSel = document.getElementById('filterProfessor');
    const subSel  = document.getElementById('filterSubject');
    const labSel  = document.getElementById('filterLab');
    const filterStr = [
        profSel.value ? profSel.options[profSel.selectedIndex].text : null,
        subSel.value  ? subSel.options[subSel.selectedIndex].text   : null,
        labSel.value  ? labSel.options[labSel.selectedIndex].text   : null,
    ].filter(Boolean).join(', ') || 'All';

    META = { total: filteredSessions.length, completed, cancelled, ongoing, filters: filterStr, date: genDate };

    document.getElementById('reportMetaText').innerText = `Generated ${genDate} · ${completed} completed records`;

    reportData.forEach((s, i) => {
        const sch = s.lab_schedules;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i+1}</td>
            <td>${s.session_date}</td>
            <td>${sch.day_of_week}</td>
            <td><b>${sch.subjects.subject_code}</b></td>
            <td>${sch.professors.first_name} ${sch.professors.last_name}</td>
            <td><span style="background:var(--g100);color:var(--g800);padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600">${sch.section}</span></td>
            <td>${sch.laboratory_rooms.lab_code}</td>
            <td>${sch.start_time.substring(0,5)}</td>
            <td>${s.actual_start_time ? s.actual_start_time.substring(0,5) : '—'}</td>
            <td>${s.actual_end_time ? s.actual_end_time.substring(0,5) : '—'}</td>
            <td><span class="rm-badge ${s.status}">${s.status.toUpperCase()}</span></td>
        `;
        tbody.appendChild(tr);
    });

    window.REPORT_DATA = reportData;

    // ── PRE-FETCH TODAY'S REPORTS TO PREVENT EXACT DUPLICATES ──
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    try {
        const { data } = await supabaseClient
            .from('las_reports')
            .select('report_name, report_data')
            .eq('report_type', 'sessions')
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
}

function closeReportModal() { document.getElementById('rmModal').classList.remove('on'); }

// ── Smart Duplicate Check Helper ──────────────────────────────
function checkDuplicateWarning(exportType) {
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const reportName = `Session History Report — ${dateStr} (${exportType})`;
    const currentDataString = JSON.stringify(window.REPORT_DATA);
    
    const isExactDuplicate = existingReportsToday.some(r => 
        r.name === reportName && r.dataString === currentDataString
    );
    
    if (isExactDuplicate) {
        return confirm(`A ${exportType} report with this EXACT data has already been saved today.\n\nAre you sure you want to generate a duplicate?`);
    }
    return true;
}

// ── Save to Reports (Manual Button) ───────────────────────────
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

// ── Auto-save helper ──────────────────────────────────────────
async function autoSaveReport(exportType) {
    const dateStr    = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const reportName = `Session History Report — ${dateStr} (${exportType})`;

    const currentFilters = {
        search:    document.getElementById('filterSearch').value,
        professor: document.getElementById('filterProfessor').options[document.getElementById('filterProfessor').selectedIndex]?.text || 'All',
        subject:   document.getElementById('filterSubject').options[document.getElementById('filterSubject').selectedIndex]?.text   || 'All',
        lab:       document.getElementById('filterLab').options[document.getElementById('filterLab').selectedIndex]?.text           || 'All',
    };

    const payload = {
        report_type: 'sessions',
        report_name: reportName,
        filters:     JSON.stringify(currentFilters),
        report_data: JSON.stringify(window.REPORT_DATA)
    };

    // ── Push to local memory IMMEDIATELY (before the async DB call) so that
    //    a second click while the network request is in-flight is still blocked.
    existingReportsToday.push({
        name: payload.report_name,
        dataString: payload.report_data
    });

    try {
        const { error } = await supabaseClient.from('las_reports').insert([payload]);
        if (error) throw error;

        if (exportType === 'Manual Save') {
            showToast('Report saved successfully!');
        } else {
            showToast(`${exportType} downloaded & report saved!`);
        }

    } catch (err) {
        console.error('Auto-save error:', err);
        showToast('Action complete but failed to save report: ' + err.message, true);
    }
}

// ── Toast helper (mirrors laboratories.js) ────────────────────
function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    t.className = 'toast on' + (isError ? ' error' : '');
    setTimeout(() => t.className = 'toast', 4000);
}

// ── Logo loader (canvas → base64, same as laboratories.js) ───
function loadImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

// ── Print ─────────────────────────────────────────────────────
async function printReport() {
    if (!checkDuplicateWarning('Print')) return;

    const cols = ['#','Date','Day','Subject Code','Professor','Section','Lab','Sched Time','Actual Start','Actual End','Status'];
    const nowStr = new Date().toLocaleString();

    const rows = window.REPORT_DATA.map((r, i) => {
        const sch = r.lab_schedules;
        
        let statusColor = '#64748b'; 
        const s = r.status.toLowerCase();
        if (s === 'completed')                    statusColor = '#166534'; 
        if (s === 'cancelled')                    statusColor = '#dc2626'; 
        if (s === 'ongoing' || s === 'dismissing') statusColor = '#d97706'; 
        if (s === 'scheduled')                    statusColor = '#2563eb'; 
        
        return `<tr>
            <td>${i + 1}</td>
            <td>${r.session_date}</td>
            <td>${sch.day_of_week}</td>
            <td><strong>${sch.subjects.subject_code}</strong></td>
            <td>${sch.professors.last_name}</td>
            <td>${sch.section}</td>
            <td><strong>${sch.laboratory_rooms.lab_code}</strong></td>
            <td>${sch.start_time.substring(0,5)}</td>
            <td>${r.actual_start_time ? r.actual_start_time.substring(0,5) : '—'}</td>
            <td>${r.actual_end_time ? r.actual_end_time.substring(0,5) : '—'}</td>
            <td><span style="color: ${statusColor}; font-weight: bold;">${r.status.toUpperCase()}</span></td>
        </tr>`;
    }).join('');

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>Session History Report</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;padding:20px;font-size:11px;color:#111}
        
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
        td:nth-child(4), td:nth-child(5) {text-align:left;}
        tr:nth-child(even){background:#f9fafb; -webkit-print-color-adjust: exact; print-color-adjust: exact;}
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
        <div class="report-title">Session History Report</div>
        <div class="report-meta">Generated: ${nowStr} &nbsp;&middot;&nbsp; Completed Records: ${META.completed} &nbsp;&middot;&nbsp; Filters: ${META.filters}</div>
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

// ── PDF ───────────────────────────────────────────────────────
async function downloadPDF() {
    if (!checkDuplicateWarning('PDF')) return;

    if (!window.jspdf) {
        alert("PDF Library not loaded yet. Please try again.");
        return;
    }
    
    try {
        const { jsPDF } = window.jspdf;
        const nowStr = new Date().toLocaleString();

        // Load logos first, then build the PDF (mirrors laboratories.js)
        const [plpData, ccsData] = await Promise.all([
            loadImage('../resc/assets/plp_logo.png'),
            loadImage('../resc/assets/ccs_logo.png')
        ]);

        const doc      = new jsPDF('landscape');
        const pageW    = doc.internal.pageSize.width;
        const centerX  = pageW / 2;
        const headerHeight = 45; 
        
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
        doc.text('SESSION HISTORY REPORT', centerX, 30, { align: 'center' });
        
        doc.setFontSize(8); 
        doc.setTextColor(187, 247, 208); 
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated: ${nowStr}  ·  Completed Records: ${META.completed}  ·  Filters: ${META.filters}`, centerX, 36, { align: 'center' });

        // ── AUTO-EXPANDING CLEAN TABLE ──
        doc.autoTable({
            head: [['#','Date','Day','Subject','Professor','Section','Lab','Sched\nTime','Actual\nStart','Actual\nEnd','Status']],
            body: window.REPORT_DATA.map((r, i) => {
                const sch = r.lab_schedules;
                return [
                    i + 1, r.session_date, sch.day_of_week, sch.subjects.subject_code,
                    sch.professors.last_name, sch.section, sch.laboratory_rooms.lab_code,
                    sch.start_time.substring(0,5), 
                    r.actual_start_time ? r.actual_start_time.substring(0,5) : '—',
                    r.actual_end_time ? r.actual_end_time.substring(0,5) : '—',
                    r.status.toUpperCase()
                ];
            }),
            startY: headerHeight + 8, 
            margin: { left: 14, right: 14 }, 
            theme: 'striped',
            headStyles: { 
                fillColor: [22, 101, 52], 
                fontSize: 7.5, 
                fontStyle: 'bold', 
                textColor: 255,
                halign: 'center',
                valign: 'middle'
            },
            styles: { 
                fontSize: 7.5, 
                cellPadding: 3,
                valign: 'middle'
            },
            columnStyles: {
                0:  { cellWidth: 10, halign: 'center' }, 
                1:  { halign: 'center', fontStyle: 'bold' }, 
                2:  { halign: 'center' }, 
                3:  { halign: 'left', fontStyle: 'bold' }, 
                4:  { halign: 'left' }, 
                5:  { halign: 'center' }, 
                6:  { halign: 'center', fontStyle: 'bold' }, 
                7:  { halign: 'center' }, 
                8:  { halign: 'center' }, 
                9:  { halign: 'center' }, 
                10: { halign: 'center' } 
            },
            didParseCell(d) {
                if (d.column.index === 10 && d.section === 'body') {
                    const s = (d.cell.text[0] || '').toLowerCase();
                    if (s === 'completed')                        { d.cell.styles.textColor = [22,101,52];  d.cell.styles.fontStyle = 'bold'; }
                    else if (s === 'cancelled')                   { d.cell.styles.textColor = [220,38,38];  d.cell.styles.fontStyle = 'bold'; }
                    else if (s === 'ongoing' || s === 'dismissing') { d.cell.styles.textColor = [217,119,6]; d.cell.styles.fontStyle = 'bold'; }
                    else if (s === 'scheduled')                   { d.cell.styles.textColor = [37,99,235];  d.cell.styles.fontStyle = 'bold'; }
                }
            }
        });

        const pages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i); doc.setFontSize(7); doc.setTextColor(156, 163, 175);
            doc.text(`Laboratory Attendance System  ·  Page ${i} of ${pages}  ·  ${nowStr}`,
                pageW / 2, doc.internal.pageSize.height - 8, { align: 'center' });
        }

        doc.save(`Session_History_Report_${new Date().toISOString().split('T')[0]}.pdf`);
        
        await autoSaveReport('PDF');
        
    } catch(err) {
        console.error("PDF Generation Error: ", err);
        showToast('There was an error generating the PDF. Check the console.', true);
    }
}

// ── CSV ───────────────────────────────────────────────────────
async function exportCSV() {
    if (!checkDuplicateWarning('CSV')) return;

    const cols = ['#','Date','Day','Subject Code','Professor','Section','Lab','Sched Time','Actual Start','Actual End','Status'];
    const lines = [
        cols.join(','),
        ...window.REPORT_DATA.map((s, i) => {
            const sch = s.lab_schedules;
            return [
                i + 1,
                `"${s.session_date}"`,
                `"${sch.day_of_week}"`,
                `"${sch.subjects.subject_code}"`,
                `"${sch.professors.last_name}"`,
                `"${sch.section}"`,
                `"${sch.laboratory_rooms.lab_code}"`,
                `"${sch.start_time.substring(0,5)}"`,
                `"${s.actual_start_time ? s.actual_start_time.substring(0,5) : ''}"`,
                `"${s.actual_end_time   ? s.actual_end_time.substring(0,5)   : ''}"`,
                `"${s.status}"`
            ].join(',');
        })
    ];
    
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `Session_History_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    
    await autoSaveReport('CSV');
}

// ── Excel ─────────────────────────────────────────────────────
async function exportExcel() {
    if (!checkDuplicateWarning('Excel')) return;

    if (!window.XLSX) {
        return exportCSV(); // Fallback if library fails
    }

    const wb = XLSX.utils.book_new();

    // ── Summary sheet ──
    const summaryData = [
        ['Session History Report'],
        ['Generated', new Date().toLocaleString()],
        ['Filters',   META.filters],
        [''],
        ['Total Sessions',     META.total],
        ['Completed',          META.completed],
        ['Cancelled / Voided', META.cancelled],
        ['Ongoing',            META.ongoing],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 22 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // ── Data sheet ──
    const headers = ['#', 'Date', 'Day', 'Subject Code', 'Professor', 'Section', 'Lab',
                     'Sched Time', 'Actual Start', 'Actual End', 'Status'];
    const rows = window.REPORT_DATA.map((r, i) => {
        const sch = r.lab_schedules;
        return [
            i + 1,
            r.session_date,
            sch.day_of_week,
            sch.subjects.subject_code,
            `${sch.professors.first_name} ${sch.professors.last_name}`,
            sch.section,
            sch.laboratory_rooms.lab_code,
            sch.start_time.substring(0,5),
            r.actual_start_time ? r.actual_start_time.substring(0,5) : '—',
            r.actual_end_time   ? r.actual_end_time.substring(0,5)   : '—',
            r.status.toUpperCase()
        ];
    });

    const dataSheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    dataSheet['!cols'] = [
        { wch: 5  },  // #
        { wch: 14 },  // Date
        { wch: 12 },  // Day
        { wch: 16 },  // Subject Code
        { wch: 24 },  // Professor
        { wch: 12 },  // Section
        { wch: 10 },  // Lab
        { wch: 13 },  // Sched Time
        { wch: 14 },  // Actual Start
        { wch: 14 },  // Actual End
        { wch: 14 },  // Status
    ];
    XLSX.utils.book_append_sheet(wb, dataSheet, 'Session History');

    XLSX.writeFile(wb, `Session_History_Report_${new Date().toISOString().split('T')[0]}.xlsx`);

    await autoSaveReport('Excel');
}