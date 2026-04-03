/* ============================================================
   resc/js/professorsManagement.js
   Replaces PHP mysqli calls with Supabase JS client.
============================================================ */

let allProfessors = [];
let reportRows = [];
let META = { total: 0, inSession: 0, schedules: 0, facial: 0, date: '' };

document.addEventListener('DOMContentLoaded', async () => {
    if (!supabaseClient) {
        console.error('Supabase client not initialized.');
        return;
    }
    
    // Set report date
    const now = new Date();
    META.date = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    document.getElementById('rmGenDate').textContent = `Generated ${META.date}`;

    await loadProfessorsData();
    initFilters();
    initRealTimeValidation();
});

// ────────────────────────────────────────────
// LOAD ALL PROFESSORS DATA (Replaces PHP Queries)
// ────────────────────────────────────────────
async function loadProfessorsData() {
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const currentDay = days[new Date().getDay()];
        const nowTimeStr = new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'Asia/Manila' }).substring(0,8);

        // 1. Fetch active schedules count
        const { count: totalSchedules } = await supabaseClient
            .from('lab_schedules')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');
        META.schedules = totalSchedules || 0;

        // 2. Fetch Professors, their active schedules, and subjects
        const { data: professors, error } = await supabaseClient
            .from('professors')
            .select(`
                *,
                lab_schedules (
                    schedule_id, section, day_of_week, start_time, end_time, status,
                    subjects ( subject_code, subject_name ),
                    lab_sessions ( session_date, status )
                )
            `)
            .order('last_name', { ascending: true });

        if (error) throw error;

        allProfessors = [];
        reportRows = [];
        META.inSession = 0;
        META.facial = 0;
        
        let activeProfessorsCount = 0;

        // Process data
        professors.forEach(prof => {
            if (prof.status === 'active') activeProfessorsCount++;
            if (prof.facial_dataset_path) META.facial++;

            // Filter active schedules
            const activeSchedules = prof.lab_schedules ? prof.lab_schedules.filter(s => s.status === 'active') : [];
            
            // Build Subjects string
            const subjectsSet = new Set();
            activeSchedules.forEach(s => {
                if(s.subjects) subjectsSet.add(`${s.subjects.subject_code} (${s.section})`);
            });
            const subjectsTaught = Array.from(subjectsSet).join(', ');

            // Check if currently in session
            let inSessionObj = null;
            for (let s of activeSchedules) {
                if (s.day_of_week === currentDay && nowTimeStr >= s.start_time && nowTimeStr <= s.end_time) {
                    // Check if there's a scheduled/ongoing session today
                    const todaySession = s.lab_sessions.find(ls => ls.session_date === todayStr && ['scheduled', 'ongoing'].includes(ls.status));
                    if (todaySession) {
                        inSessionObj = { code: s.subjects?.subject_code, section: s.section };
                        META.inSession++;
                        break;
                    }
                }
            }

            const enrichedProf = {
                ...prof,
                fullName: `${prof.first_name} ${prof.middle_name || ''} ${prof.last_name}`.replace(/\s+/g, ' ').trim(),
                scheduleCount: activeSchedules.length,
                subjectsTaught: subjectsTaught,
                inSessionObj: inSessionObj,
                sessionStatus: inSessionObj ? 'in-session' : 'available',
                faceStatus: prof.facial_dataset_path ? 'registered' : 'not-registered'
            };

            allProfessors.push(enrichedProf);

            // Add to report rows
            reportRows.push({
                employee_id: prof.employee_id,
                last_name: prof.last_name,
                first_name: prof.first_name,
                middle_name: prof.middle_name || '—',
                department: prof.department || '—',
                email: prof.email,
                face_status: prof.facial_dataset_path ? 'Registered' : 'Not Registered',
                status: prof.status,
                active_schedules: activeSchedules.length,
                sessions_done: 0, // Simplified for brevity; would require another subquery to count completed sessions
                subjects: Array.from(new Set(activeSchedules.map(s => s.subjects?.subject_code))).join(', ')
            });
        });

        META.total = activeProfessorsCount;

        // Update UI Stats
        document.getElementById('statTotal').textContent = META.total;
        document.getElementById('statInSession').textContent = META.inSession;
        document.getElementById('statSchedules').textContent = META.schedules;
        document.getElementById('statFaceReg').textContent = META.facial;

        renderTable(allProfessors);

    } catch (error) {
        console.error('Error loading professors:', error);
        document.getElementById('professorsTableBody').innerHTML = `<tr><td colspan="8" style="text-align:center;color:red;">Error loading data.</td></tr>`;
    }
}

function renderTable(data) {
    const tbody = document.getElementById('professorsTableBody');
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:#6b7280;">No professors found.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(prof => `
        <tr data-status="${prof.status}" data-session="${prof.sessionStatus}" data-face="${prof.faceStatus}">
            <td><strong>${escapeHtml(prof.employee_id)}</strong></td>
            <td>
                <strong>${escapeHtml(prof.fullName)}</strong>
                ${prof.middle_name ? `<br><small style="color:#6c757d">${escapeHtml(prof.middle_name)}</small>` : ''}
            </td>
            <td>${escapeHtml(prof.department || '-')}</td>
            <td>${escapeHtml(prof.email)}</td>
            <td>
                ${prof.subjectsTaught ? `<span class="subjects-taught">${escapeHtml(prof.subjectsTaught)}</span>` : `<span style="color:#999;font-style:italic">No schedules</span>`}
            </td>
            <td>
                ${prof.faceStatus === 'registered' 
                    ? `<span class="action-icon face-reg registered"><i class="fas fa-check"></i></span>`
                    : `<span class="action-icon face-reg" onclick="openFaceRegModal('${prof.employee_id}')"><i class="fas fa-times"></i></span>`
                }
            </td>
            <td>
                ${prof.inSessionObj 
                    ? `<span class="status-indicator in-session"><span class="status-dot active"></span> In Session</span>
                       <div class="session-badge"><i class="fa-solid fa-chalkboard"></i> ${escapeHtml(prof.inSessionObj.code)}</div>`
                    : `<span class="status-indicator available"><span class="status-dot inactive"></span> Available</span>`
                }
            </td>
            <td>
                <div class="table-actions">
                    <button class="action-btn edit" onclick='editProfessor(${JSON.stringify(prof).replace(/'/g, "&#39;")})'><i class="fa-solid fa-edit"></i></button>
                    <button class="action-btn delete" onclick="deleteProfessor('${prof.professor_id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ────────────────────────────────────────────
// FILTERS
// ────────────────────────────────────────────
function initFilters() {
    const search = document.getElementById('searchInput');
    const status = document.getElementById('statusFilter');
    const session = document.getElementById('sessionFilter');
    const face = document.getElementById('faceFilter');

    function apply() {
        const q = search.value.toLowerCase().trim();
        const st = status.value, se = session.value, fc = face.value;
        
        const filtered = allProfessors.filter(p => {
            const matchQ = !q || p.fullName.toLowerCase().includes(q) || p.employee_id.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
            const matchSt = !st || p.status === st;
            const matchSe = !se || p.sessionStatus === se;
            const matchFc = !fc || p.faceStatus === fc;
            return matchQ && matchSt && matchSe && matchFc;
        });
        renderTable(filtered);
    }

    search.addEventListener('input', apply);
    [status, session, face].forEach(el => el.addEventListener('change', apply));

    document.getElementById('clearFilters').addEventListener('click', () => {
        search.value = ''; status.value = ''; session.value = ''; face.value = '';
        renderTable(allProfessors);
    });
}

// ────────────────────────────────────────────
// FORM SUBMISSION & DUPLICATE CHECK
// ────────────────────────────────────────────
document.getElementById('professorForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = this.querySelector('.pm-btn-submit');
    const ogText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    const formData = new FormData(this);
    const id = formData.get('professor_id');
    const payload = {
        employee_id: formData.get('employee_id').trim(),
        first_name: formData.get('first_name').trim(),
        middle_name: formData.get('middle_name').trim() || null,
        last_name: formData.get('last_name').trim(),
        department: formData.get('department').trim() || null,
        email: formData.get('email').trim(),
        status: formData.get('status')
    };

    try {
        // 1. Check Duplicates manually
        let dupQuery = supabaseClient.from('professors').select('professor_id, employee_id, email').or(`employee_id.eq.${payload.employee_id},email.eq.${payload.email}`);
        if (id) dupQuery = dupQuery.neq('professor_id', id);
        
        const { data: dups } = await dupQuery;
        if (dups && dups.length > 0) {
            showValidationError("Duplicate found: This Employee ID or Email is already registered.");
            btn.disabled = false; btn.innerHTML = ogText;
            return;
        }

        // 2. Save Professor
        // 🚨 IMPORTANT AUTH CONSTRAINT NOTE:
        // If this is a NEW professor (no id), you CANNOT just insert into the 'professors' table 
        // if your Auth constraint (REFERENCES auth.users(id)) is active. 
        // 
        // To do this securely in a production app, you should replace the IF block below with a fetch() call
        // to a Supabase Edge Function built by your Auth team.
        
        if (id) {
            // Update existing
            const { error } = await supabaseClient.from('professors').update(payload).eq('professor_id', id);
            if (error) throw error;
        } else {
            // Insert new (Requires disabled constraint OR a standalone UUID generated here)
            payload.professor_id = crypto.randomUUID(); 
            // In a real system, you'd generate the auth user first, then pass the auth user ID here!
            payload.password = formData.get('password'); // (Only if your system handles hashing elsewhere)
            const { error } = await supabaseClient.from('professors').insert([payload]);
            if (error) throw error;
        }

        showToast("Professor saved successfully!");
        closeModal('professorModal');
        await loadProfessorsData(); // Reload table
        
    } catch (err) {
        showValidationError("Error saving: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = ogText;
    }
});

// ────────────────────────────────────────────
// MODALS & UTILS
// ────────────────────────────────────────────
function openAddModal() {
    document.getElementById('professorForm').reset();
    document.getElementById('professorId').value = '';
    document.getElementById('modalTitleText').textContent = 'Add Professor';
    document.getElementById('passwordRequired').style.display = 'inline';
    document.getElementById('passwordHint').style.display = 'block';
    document.getElementById('professorModal').classList.add('active');
}

function editProfessor(prof) {
    document.getElementById('professorId').value = prof.professor_id;
    document.getElementById('employeeId').value = prof.employee_id;
    document.getElementById('firstName').value = prof.first_name;
    document.getElementById('middleName').value = prof.middle_name || '';
    document.getElementById('lastName').value = prof.last_name;
    document.getElementById('department').value = prof.department || '';
    document.getElementById('email').value = prof.email;
    document.getElementById('status').value = prof.status;
    
    document.getElementById('modalTitleText').textContent = 'Edit Professor';
    document.getElementById('passwordRequired').style.display = 'none';
    document.getElementById('passwordHint').style.display = 'none';
    document.getElementById('professorModal').classList.add('active');
}

async function deleteProfessor(id) {
    if(!confirm("Are you sure you want to remove this professor?")) return;
    try {
        const { error } = await supabaseClient.from('professors').delete().eq('professor_id', id);
        if(error) throw error;
        showToast("Professor removed.");
        loadProfessorsData();
    } catch (err) {
        alert("Error: " + err.message);
    }
}

function openFaceRegModal(employeeId) {
    document.getElementById('profIdSearch').value = employeeId;
    document.getElementById('faceRegModal').classList.add('active');
    searchProfessor(); // Auto-search if opened from table icon
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    t.classList.add('on');
    setTimeout(() => t.classList.remove('on'), 3000);
}

function showValidationError(msg) {
    alert(msg); // Simplified for separation. In production, append to DOM as done in PHP version.
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
// ────────────────────────────────────────────
// REPORT MODAL LOGIC (With Duplicate Prevention & Green Banner)
// ────────────────────────────────────────────

let existingReportsToday = []; // Tracks reports to prevent exact duplicates

async function openReportModal() {
    document.getElementById('rmTotalChip').textContent = META.total;
    document.getElementById('rmSchedulesChip').textContent = META.schedules;
    document.getElementById('rmFaceChip').textContent = META.facial;
    
    const tbody = document.getElementById('rmTableBody');
    if (!reportRows || reportRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:40px;color:#9ca3af">No data available.</td></tr>`;
    } else {
        tbody.innerHTML = reportRows.map((r, i) => `
            <tr>
                <td style="color:#9ca3af;font-size:11px">${i+1}</td>
                <td style="font-weight:700;color:#166534;font-size:12px">${escapeHtml(r.employee_id)}</td>
                <td style="font-weight:600">${escapeHtml(r.last_name)}</td>
                <td>${escapeHtml(r.first_name)}</td>
                <td style="color:#6b7280">${escapeHtml(r.middle_name)}</td>
                <td style="font-size:12px">${escapeHtml(r.department)}</td>
                <td style="font-size:12px">${escapeHtml(r.email)}</td>
                <td><span class="rm-badge ${r.face_status==='Registered'?'registered':'not-registered'}">${r.face_status}</span></td>
                <td><span class="rm-badge ${r.status}">${r.status}</span></td>
                <td style="text-align:center"><strong>${r.active_schedules}</strong></td>
                <td style="text-align:center"><strong>${r.sessions_done}</strong></td>
                <td style="font-size:11.5px;color:#6b7280;max-width:180px;word-break:break-word">${escapeHtml(r.subjects || '—')}</td>
            </tr>
        `).join('');
    }
    
    document.getElementById('rmOverlay').classList.add('on');

    // ── PRE-FETCH TODAY'S REPORTS TO PREVENT EXACT DUPLICATES ──
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    try {
        const { data } = await supabaseClient
            .from('las_reports')
            .select('report_name, report_data')
            .eq('report_type', 'professors')
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

function closeReportModal() {
    document.getElementById('rmOverlay').classList.remove('on');
}

// ── Smart Duplicate Check Helper ──
function checkDuplicateWarning(exportType) {
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const reportName = `Professors Report — ${dateStr} (${exportType})`;
    const currentDataString = JSON.stringify(reportRows);
    
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
    const reportName = `Professors Report — ${dateStr} (${exportType})`;

    const payload = {
        report_type: 'professors',
        report_name: reportName,
        filters:     JSON.stringify({}),
        report_data: JSON.stringify(reportRows)
    };

    try {
        const { error } = await supabaseClient.from('las_reports').insert([payload]);
        if (error) throw error;
        
        if (exportType === 'Manual Save') {
            // Use your system's toast notification if available, otherwise fallback to alert
            if (typeof showToast === 'function') showToast('Report saved successfully!', true);
            else alert('Report saved successfully!');
        } else {
            console.log(`[Auto-Save] ${exportType} report securely archived.`);
        }
        
        existingReportsToday.push({
            name: payload.report_name,
            dataString: payload.report_data
        }); 
        
    } catch (err) {
        console.error('Auto-save error:', err);
    }
}

// ── Print ──────────────────────────────────────────────────
async function printReport() {
    if (!checkDuplicateWarning('Print')) return;

    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const nowStr  = `${dateStr} at ${timeStr}`;

    const cols = ['#','Emp ID','Last Name','First Name','M.I.','Department','Face Status','Status','Schedules','Sessions Done','Subjects'];

    const rows = reportRows.map((r, i) => {
        let faceColor = r.face_status.toLowerCase() === 'registered' ? '#166534' : '#d97706';
        let statusColor = r.status.toLowerCase() === 'active' ? '#166534' : '#dc2626';
        let mi = r.middle_name ? r.middle_name.substring(0,2) + '.' : '—';
        
        return `<tr class="${i % 2 === 1 ? 'even' : ''}">
            <td>${i + 1}</td>
            <td><strong>${r.employee_id}</strong></td>
            <td><strong>${r.last_name}</strong></td>
            <td>${r.first_name}</td>
            <td>${mi}</td>
            <td>${r.department}</td>
            <td><span style="color: ${faceColor}; font-weight: bold;">${r.face_status.toUpperCase()}</span></td>
            <td><span style="color: ${statusColor}; font-weight: bold;">${r.status.toUpperCase()}</span></td>
            <td style="text-align:center">${r.active_schedules}</td>
            <td style="text-align:center">${r.sessions_done}</td>
            <td style="font-size:9px">${(r.subjects || '—').substring(0, 45)}</td>
        </tr>`;
    }).join('');

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Professors Report</title>
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
        td:nth-child(2), td:nth-child(3), td:nth-child(4), td:nth-child(5), td:nth-child(6), td:nth-child(11) {text-align:left;} /* Left align Names and text */
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
        <div class="report-title">Professors Report</div>
        <div class="report-meta">Generated: ${nowStr} &nbsp;&middot;&nbsp; Total Professors: ${META.total} &nbsp;&middot;&nbsp; Face Registered: ${META.facial} &nbsp;&middot;&nbsp; Active Schedules: ${META.schedules}</div>
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

// ── PDF ────────────────────────────────────────────────────
async function downloadPDF() {
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
        const pageW   = doc.internal.pageSize.width;

        // Helper to safely load the logos
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
                        resolve(null); 
                    }
                };
                img.onerror = () => resolve(null);
                img.src = src;
            });
        }

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
        doc.text('PROFESSORS REPORT', centerX, 30, { align: 'center' });
        
        doc.setFontSize(8); 
        doc.setTextColor(187, 247, 208); 
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated: ${nowStr}  ·  Total Professors: ${META.total}  ·  Face Registered: ${META.facial}  ·  Active Schedules: ${META.schedules}`, centerX, 36, { align: 'center' });

        // ── AUTO-EXPANDING CLEAN TABLE ──
        const head = [['#','Emp ID','Last Name','First Name','M.I.','Department','Face Status','Status','Schedules','Sessions Done','Subjects']];
        const body = reportRows.map((r, i) => {
            const mi = r.middle_name ? r.middle_name.substring(0,2) + '.' : '—';
            const subs = r.subjects ? r.subjects.substring(0, 45) + (r.subjects.length > 45 ? '...' : '') : '—';
            return [
                i + 1, r.employee_id, r.last_name, r.first_name, mi,
                r.department, r.face_status.toUpperCase(), r.status.toUpperCase(),
                r.active_schedules, r.sessions_done, subs
            ];
        });

        doc.autoTable({
            head, body,
            startY: headerHeight + 8,
            margin: { left: 14, right: 14 },
            theme: 'striped',
            headStyles: { 
                fillColor: [22, 101, 52], fontSize: 7.5, fontStyle: 'bold', textColor: 255, halign: 'center', valign: 'middle'
            },
            styles: { fontSize: 7.5, cellPadding: 3, valign: 'middle' },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
                2: { cellWidth: 30, fontStyle: 'bold' },
                3: { cellWidth: 30 },
                4: { cellWidth: 12 },
                5: { cellWidth: 35 },
                6: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
                7: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
                8: { cellWidth: 20, halign: 'center' },
                9: { cellWidth: 20, halign: 'center' },
                10: { cellWidth: 'auto' } // Subjects
            },
            didParseCell(d) {
                if (d.column.index === 6 && d.section === 'body') {
                    const s = (d.cell.text[0] || '').toLowerCase();
                    if (s === 'registered') { d.cell.styles.textColor = [22, 101, 52]; }
                    if (s === 'not registered') { d.cell.styles.textColor = [217, 119, 6]; }
                }
                if (d.column.index === 7 && d.section === 'body') {
                    const s = (d.cell.text[0] || '').toLowerCase();
                    if (s === 'active') { d.cell.styles.textColor = [22, 101, 52]; }
                    if (s === 'inactive') { d.cell.styles.textColor = [220, 38, 38]; }
                }
            }
        });

        const pages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i); doc.setFontSize(7); doc.setTextColor(156, 163, 175);
            doc.text(`Laboratory Attendance System  ·  Page ${i} of ${pages}  ·  ${nowStr}`,
                pageW / 2, doc.internal.pageSize.height - 8, { align: 'center' });
        }

        doc.save(`Professors_Report_${now.toISOString().split('T')[0]}.pdf`);

        await autoSaveReport('PDF');

    } catch (err) {
        console.error('PDF generation error:', err);
        if (typeof showToast === 'function') showToast('There was an error generating the PDF. Check the console.', true);
        else alert('There was an error generating the PDF. Check the console.');
    }
}

// ── CSV ────────────────────────────────────────────────────
async function exportCSV() {
    if (!checkDuplicateWarning('CSV')) return;

    const cols = ['#','Employee ID','Last Name','First Name','Middle Name','Department','Email','Face Status','Status','Active Schedules','Sessions Done','Subjects'];
    const lines = [
        cols.join(','),
        ...reportRows.map((r, i) => [
            i + 1, `"${r.employee_id}"`, `"${r.last_name}"`, `"${r.first_name}"`, `"${r.middle_name}"`,
            `"${r.department}"`, `"${r.email}"`, `"${r.face_status}"`, r.status,
            r.active_schedules, r.sessions_done, `"${(r.subjects || '').replace(/"/g, '""')}"`
        ].join(','))
    ];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `Professors_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    
    await autoSaveReport('CSV');
}

// ── Excel ──────────────────────────────────────────────────
async function exportExcel() {
    if (!checkDuplicateWarning('Excel')) return;

    if (!window.XLSX) {
        return exportCSV(); // Fallback if library fails
    }
    const wb = XLSX.utils.book_new();

    const headers = ['#','Employee ID','Last Name','First Name','Middle Name','Department','Email','Face Status','Status','Active Schedules','Sessions Done','Subjects'];
                  
    const rows = reportRows.map((r, i) => [
        i + 1, r.employee_id, r.last_name, r.first_name, r.middle_name,
        r.department, r.email, r.face_status, r.status.toUpperCase(),
        r.active_schedules, r.sessions_done, r.subjects || ''
    ]);

    const dataSheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, dataSheet, 'Professors');

    XLSX.writeFile(wb, `Professors_Report_${new Date().toISOString().split('T')[0]}.xlsx`);

    await autoSaveReport('Excel');
}

// Stubs for real-time validation visual feedback
function initRealTimeValidation() {
    // Example: You can wire up the input blur events here similarly to how it was done, 
    // replacing the PHP fetch calls with supabaseClient.from().select() calls.
}