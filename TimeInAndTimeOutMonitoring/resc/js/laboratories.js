/* ============================================================
   laboratories.js
   TimeInAndTimeOutMonitoring / resc / js / laboratories.js

   Uses: supabaseClient  (from config/config.js)
   Table: laboratory_rooms
   ============================================================ */

// ── Wait for supabaseClient to be ready ──────────────────────
if (!supabaseClient) {
    console.error('Supabase client not initialized. Check config/config.js and .env.js');
}

// ── State ─────────────────────────────────────────────────────
let LABS     = [];   // all labs loaded from Supabase
let REPORT   = [];   // labs with schedule/session counts for report
let META     = {};   // stats for print/PDF

// ── Helpers ───────────────────────────────────────────────────
function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    t.className = 'toast on' + (isError ? ' error' : '');
    setTimeout(() => t.className = 'toast', 4000);
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Load all labs from Supabase ───────────────────────────────
async function loadLabs() {
    const { data, error } = await supabaseClient
        .from('laboratory_rooms')
        .select('*')
        .order('lab_code', { ascending: true });

    if (error) {
        console.error('Error loading labs:', error);
        showToast('Failed to load laboratories.', true);
        return;
    }

    LABS = data || [];
    renderTable(LABS);
    renderStats(LABS);
}

// ── Render stats cards ────────────────────────────────────────
function renderStats(labs) {
    const total       = labs.length;
    const available   = labs.filter(l => l.status === 'available').length;
    const maintenance = labs.filter(l => l.status === 'maintenance').length;
    const capacity    = labs.reduce((sum, l) => sum + (l.capacity || 0), 0);

    document.getElementById('statTotal').textContent       = total;
    document.getElementById('statAvailable').textContent   = available;
    document.getElementById('statMaintenance').textContent = maintenance;
    document.getElementById('statCapacity').textContent    = capacity;
}

// ── Render table rows ─────────────────────────────────────────
function renderTable(labs) {
    const tbody = document.getElementById('labsTableBody');

    if (!labs.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="empty-state">
                        <i class="fa-solid fa-flask"></i>
                        <h3>No Laboratories Found</h3>
                        <p>Get started by adding your first laboratory room.</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = labs.map(lab => {
        const eq = lab.equipment_details || '';
        const eqShort = eq.length > 30 ? eq.substring(0, 30) + '…' : eq;
        const statusClass = (lab.status || 'available').toLowerCase();

        return `<tr data-lab-id="${lab.lab_id}">
            <td><strong>${lab.lab_code}</strong></td>
            <td>${lab.lab_name}</td>
            <td>${lab.building || '—'}</td>
            <td>${lab.floor    || '—'}</td>
            <td>${lab.capacity} seats</td>
            <td>
                <span class="status-badge ${statusClass}">
                    ${lab.status.charAt(0).toUpperCase() + lab.status.slice(1)}
                </span>
            </td>
            <td title="${eq}">${eqShort || '—'}</td>
            <td>
                <div class="action-btns">
                    <button class="action-btn edit"   title="Edit"   onclick="openEditModal('${lab.lab_id}')">
                        <i class="fa-solid fa-edit"></i>
                    </button>
                    <button class="action-btn delete" title="Delete" onclick="deleteLab('${lab.lab_id}', '${lab.lab_code}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ── Search ────────────────────────────────────────────────────
document.getElementById('searchInput').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    const filtered = LABS.filter(l =>
        (l.lab_code  || '').toLowerCase().includes(q) ||
        (l.lab_name  || '').toLowerCase().includes(q) ||
        (l.building  || '').toLowerCase().includes(q) ||
        (l.floor     || '').toLowerCase().includes(q)
    );
    renderTable(filtered);
});

// ── Add modal ─────────────────────────────────────────────────
function openAddModal() {
    document.getElementById('modalTitle').innerHTML    = '<i class="fa-solid fa-plus"></i> Add Laboratory';
    document.getElementById('submitBtnText').textContent = 'Add Laboratory';
    document.getElementById('labId').value       = '';
    document.getElementById('labCode').value     = '';
    document.getElementById('labStatus').value   = 'available';
    document.getElementById('labName').value     = '';
    document.getElementById('labBuilding').value = '';
    document.getElementById('labFloor').value    = '';
    document.getElementById('labCapacity').value = '';
    document.getElementById('labEquipment').value= '';
    openLabModal();
}

// ── Edit modal ────────────────────────────────────────────────
function openEditModal(labId) {
    const lab = LABS.find(l => l.lab_id === labId);
    if (!lab) return;

    document.getElementById('modalTitle').innerHTML    = '<i class="fa-solid fa-edit"></i> Edit Laboratory';
    document.getElementById('submitBtnText').textContent = 'Update Laboratory';
    document.getElementById('labId').value       = lab.lab_id;
    document.getElementById('labCode').value     = lab.lab_code;
    document.getElementById('labStatus').value   = lab.status;
    document.getElementById('labName').value     = lab.lab_name;
    document.getElementById('labBuilding').value = lab.building  || '';
    document.getElementById('labFloor').value    = lab.floor     || '';
    document.getElementById('labCapacity').value = lab.capacity;
    document.getElementById('labEquipment').value= lab.equipment_details || '';
    openLabModal();
}

function openLabModal() {
    const m = document.getElementById('labModal');
    m.style.display = 'flex';
    setTimeout(() => m.classList.add('active'), 10);
}

function closeModal() {
    const m = document.getElementById('labModal');
    m.classList.remove('active');
    setTimeout(() => m.style.display = 'none', 300);
}

window.addEventListener('click', e => {
    if (e.target === document.getElementById('labModal')) closeModal();
});

// ── Form submit (Add or Update) ───────────────────────────────
document.getElementById('labForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const labId    = document.getElementById('labId').value.trim();
    const payload  = {
        lab_code:          document.getElementById('labCode').value.trim(),
        lab_name:          document.getElementById('labName').value.trim(),
        building:          document.getElementById('labBuilding').value.trim() || null,
        floor:             document.getElementById('labFloor').value.trim()    || null,
        capacity:          parseInt(document.getElementById('labCapacity').value),
        status:            document.getElementById('labStatus').value,
        equipment_details: document.getElementById('labEquipment').value.trim() || null,
        updated_at:        new Date().toISOString(),
    };

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

    try {
        let error;

        if (labId) {
            // UPDATE
            ({ error } = await supabaseClient
                .from('laboratory_rooms')
                .update(payload)
                .eq('lab_id', labId));
        } else {
            // INSERT
            ({ error } = await supabaseClient
                .from('laboratory_rooms')
                .insert(payload));
        }

        if (error) throw error;

        showToast(labId ? 'Laboratory updated!' : 'Laboratory added!');
        closeModal();
        await loadLabs();
    } catch (err) {
        console.error(err);
        showToast('Error: ' + (err.message || 'Unknown error'), true);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-save"></i> <span id="submitBtnText">${labId ? 'Update' : 'Add'} Laboratory</span>`;
    }
});

// ── Delete ────────────────────────────────────────────────────
async function deleteLab(labId, labCode) {
    if (!confirm(`Delete ${labCode}?\n\nThis will also remove all associated schedules and attendance records.`)) return;

    const { error } = await supabaseClient
        .from('laboratory_rooms')
        .delete()
        .eq('lab_id', labId);

    if (error) {
        console.error(error);
        showToast('Failed to delete: ' + error.message, true);
        return;
    }

    showToast(`${labCode} deleted.`);
    await loadLabs();
}

// ── Report Modal ──────────────────────────────────────────────
async function openReportModal() {
    document.getElementById('rmOverlay').classList.add('on');

    // Fetch labs with schedule + session counts using Supabase joins
    const { data, error } = await supabaseClient
        .from('laboratory_rooms')
        .select(`
            lab_id,
            lab_code,
            lab_name,
            building,
            floor,
            capacity,
            status,
            equipment_details,
            created_at,
            lab_schedules (
                schedule_id,
                status,
                lab_sessions ( session_id, status )
            )
        `)
        .order('lab_code', { ascending: true });

    if (error) {
        console.error(error);
        showToast('Failed to load report data.', true);
        return;
    }

    // Build report rows with computed counts
    REPORT = (data || []).map(lab => {
        const schedules       = lab.lab_schedules || [];
        const activeSchedules = schedules.filter(s => s.status === 'active').length;
        const sessionsDone    = schedules.flatMap(s => s.lab_sessions || [])
                                         .filter(sess => sess.status === 'completed').length;
        return {
            lab_code:         lab.lab_code,
            lab_name:         lab.lab_name,
            building:         lab.building         || '—',
            floor:            lab.floor            || '—',
            capacity:         lab.capacity,
            status:           lab.status,
            equipment:        lab.equipment_details || '—',
            active_schedules: activeSchedules,
            sessions_done:    sessionsDone,
            date_added:       fmtDate(lab.created_at),
        };
    });

    // Stats
    const total       = REPORT.length;
    const available   = REPORT.filter(r => r.status === 'available').length;
    const maintenance = REPORT.filter(r => r.status === 'maintenance').length;
    const capacity    = REPORT.reduce((s, r) => s + r.capacity, 0);
    const genDate     = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    META = { total, available, maintenance, capacity, date: genDate };

    // Update chips
    document.getElementById('rmSubtitle').textContent = `Generated ${genDate} · ${total} total laboratories`;
    document.getElementById('chipTotal').innerHTML     = `<i class="fa-solid fa-building"></i> ${total} Total`;
    document.getElementById('chipAvailable').innerHTML = `<i class="fa-solid fa-check-circle"></i> ${available} Available`;
    document.getElementById('chipCapacity').innerHTML  = `<i class="fa-solid fa-users"></i> ${capacity} Seats`;

    const chipMaint = document.getElementById('chipMaintenance');
    if (maintenance > 0) {
        chipMaint.style.display = '';
        chipMaint.innerHTML = `<i class="fa-solid fa-wrench"></i> ${maintenance} Maintenance`;
    } else {
        chipMaint.style.display = 'none';
    }

    // Render report table
    const tbody = document.getElementById('reportTableBody');
    if (!REPORT.length) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;color:#9ca3af">No laboratory data found.</td></tr>`;
        return;
    }

    tbody.innerHTML = REPORT.map((r, i) => `
        <tr>
            <td style="color:#9ca3af;font-size:12px">${i + 1}</td>
            <td><strong style="color:#166534">${r.lab_code}</strong></td>
            <td>${r.lab_name}</td>
            <td>${r.building}</td>
            <td>${r.floor}</td>
            <td><strong>${r.capacity}</strong> <span style="color:#9ca3af;font-size:12px">seats</span></td>
            <td><span class="rm-badge ${r.status.toLowerCase()}">${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span></td>
            <td style="text-align:center"><strong>${r.active_schedules}</strong></td>
            <td style="text-align:center"><strong>${r.sessions_done}</strong></td>
            <td style="font-size:12px;color:#6b7280;max-width:200px;word-break:break-word">
                ${r.equipment.length > 60 ? r.equipment.substring(0, 60) + '…' : r.equipment}
            </td>
            <td style="font-size:12px;color:#6b7280;white-space:nowrap">${r.date_added}</td>
        </tr>`).join('');
}

function closeReportModal() {
    document.getElementById('rmOverlay').classList.remove('on');
}

// ── Save to Reports (attendance_reports table) ────────────────
// ── Save to Reports (las_reports table) ────────────────
async function saveReport() {
    const btn = document.querySelector('.rm-btn[onclick="saveReport()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }

    // Generate a clean name for the report
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const reportName = `Laboratory Rooms Report — ${dateStr}`;

    const payload = {
        report_type: 'laboratories',
        report_name: reportName,
        filters: JSON.stringify({}), // Save empty filters as a JSON string
        report_data: JSON.stringify(REPORT) // Save the actual table data so it can be exported later!
    };

    try {
        const { error } = await supabaseClient
            .from('las_reports')
            .insert([payload]);

        if (error) throw error;

        showToast('Report saved successfully!');
    } catch (err) {
        console.error('Error saving report:', err);
        showToast('Error saving report: ' + err.message, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save to Reports';
        }
    }
}

// ── Auto-save helper ──────────────────────────────────────────
async function autoSaveReport(exportType) {
    const dateStr    = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const reportName = `Laboratory Rooms Report — ${dateStr} (${exportType})`;

    const payload = {
        report_type: 'laboratories',
        report_name: reportName,
        filters:     JSON.stringify({}),
        report_data: JSON.stringify(REPORT)
    };

    try {
        const { error } = await supabaseClient.from('las_reports').insert([payload]);
        if (error) throw error;
        showToast(`${exportType} downloaded & report saved!`);
    } catch (err) {
        console.error('Auto-save error:', err);
        showToast('Export done but failed to save report: ' + err.message, true);
    }
}

// ── Print ─────────────────────────────────────────────────────
async function printReport() {
    const cols = ['#','Lab Code','Lab Name','Building','Floor','Capacity','Status',
                  'Active Schedules','Sessions Done','Equipment','Date Added'];
    const nowStr = new Date().toLocaleString();

    const rows = REPORT.map((r, i) => `<tr>
        <td>${i + 1}</td>
        <td><strong>${r.lab_code}</strong></td>
        <td>${r.lab_name}</td>
        <td>${r.building}</td>
        <td>${r.floor}</td>
        <td>${r.capacity} seats</td>
        <td>${r.status}</td>
        <td style="text-align:center">${r.active_schedules}</td>
        <td style="text-align:center">${r.sessions_done}</td>
        <td style="font-size:9px">${r.equipment.substring(0, 60)}</td>
        <td>${r.date_added}</td>
    </tr>`).join('');

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>Laboratory Rooms Report</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;padding:24px;font-size:11px;color:#111}
        .hdr{display:flex;align-items:center;justify-content:space-between;
             padding-bottom:14px;margin-bottom:18px;border-bottom:3px solid #1a4731;gap:16px}
        .hdr-left{display:flex;flex-direction:column;gap:3px;flex:1}
        .hdr-title{font-size:18px;font-weight:700;color:#1a4731;line-height:1.2}
        .hdr-meta{font-size:10px;color:#5a7265;margin-top:2px}
        .hdr-summary{font-size:10px;color:#166534;font-weight:600;margin-top:3px}
        .hdr-logos{display:flex;align-items:center;gap:10px;flex-shrink:0}
        .hdr-logos img{height:52px;width:52px;object-fit:contain}
        .logo-divider{width:1px;height:40px;background:#d4e6d9}
        .hdr-school{display:flex;flex-direction:column;align-items:center;font-size:8px;
            color:#5a7265;text-align:center;max-width:120px;line-height:1.3;margin-left:6px}
        .hdr-school strong{font-size:8.5px;color:#1a4731}
        table{width:100%;border-collapse:collapse}
        th{background:#1a4731;color:#fff;padding:7px 9px;text-align:left;
           font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
        td{padding:6px 9px;border-bottom:1px solid #e5e7eb;font-size:10.5px}
        tr:nth-child(even){background:#f9fafb}
        .footer{margin-top:20px;text-align:center;font-size:9.5px;color:#9ca3af;
                border-top:1px solid #e5e7eb;padding-top:10px}
        @media print{body{padding:8px}}
    </style></head><body>
    <div class="hdr">
        <div class="hdr-left">
            <div class="hdr-title">Laboratory Rooms Report</div>
            <div class="hdr-meta">${nowStr} &nbsp;&middot;&nbsp; ${META.total} lab${META.total !== 1 ? 's' : ''}</div>
            <div class="hdr-summary">
                Total: ${META.total} &nbsp;&middot;&nbsp;
                Available: ${META.available} &nbsp;&middot;&nbsp;
                Maintenance: ${META.maintenance} &nbsp;&middot;&nbsp;
                Total Seats: ${META.capacity}
            </div>
        </div>
        <div class="hdr-logos">
            <img src="../../auth/assets/plplogo.png" alt="PLP Logo">
            <div class="logo-divider"></div>
            <img src="../../auth/assets/ccslogo.png" alt="CCS Logo">
            <div class="hdr-school">
                <strong>Pamantasan ng Lungsod ng Pasig</strong>
                College of Computer Studies
            </div>
        </div>
    </div>
    <table>
        <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
    </table>
    <div class="footer">Laboratory Attendance System &nbsp;&middot;&nbsp; ${nowStr}</div>
    <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script>
    </body></html>`);
    w.document.close();

    // Auto-save after opening print window
    await autoSaveReport('Print');
}

// ── PDF ───────────────────────────────────────────────────────
function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc    = new jsPDF('landscape');
    const pageW  = doc.internal.pageSize.width;
    const nowStr = new Date().toLocaleString();

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

    Promise.all([
        loadImage('../../auth/assets/plplogo.png'),
        loadImage('../../auth/assets/ccslogo.png')
    ]).then(async ([plpData, ccsData]) => {

        doc.setFontSize(16); doc.setTextColor(26, 71, 49); doc.setFont('helvetica', 'bold');
        doc.text('Laboratory Rooms Report', 14, 14);
        doc.setFontSize(8); doc.setTextColor(90, 114, 101); doc.setFont('helvetica', 'normal');
        doc.text(`${nowStr}  ·  ${META.total} lab${META.total !== 1 ? 's' : ''}`, 14, 21);
        doc.setFontSize(7.5); doc.setTextColor(22, 101, 52);
        doc.text(`Total: ${META.total}   Available: ${META.available}   Maintenance: ${META.maintenance}   Total Seats: ${META.capacity}`, 14, 27);

        const logoSize = 16, logoGap = 4, rightEdge = pageW - 14;
        if (ccsData) doc.addImage(ccsData, 'PNG', rightEdge - logoSize, 4, logoSize, logoSize);
        if (plpData) doc.addImage(plpData, 'PNG', rightEdge - logoSize * 2 - logoGap, 4, logoSize, logoSize);
        doc.setFontSize(6.5); doc.setTextColor(26, 71, 49); doc.setFont('helvetica', 'bold');
        doc.text('Pamantasan ng Lungsod ng Pasig', rightEdge - logoSize * 2 - logoGap, 22, { maxWidth: logoSize * 2 + logoGap });
        doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 114, 101);
        doc.text('College of Computer Studies', rightEdge - logoSize * 2 - logoGap, 26, { maxWidth: logoSize * 2 + logoGap });

        doc.setDrawColor(212, 230, 217); doc.setLineWidth(0.5);
        doc.line(14, 31, pageW - 14, 31);

        doc.autoTable({
            head: [['#','Lab Code','Lab Name','Building','Floor','Capacity','Status','Schedules','Sessions','Equipment','Date Added']],
            body: REPORT.map((r, i) => [
                i + 1, r.lab_code, r.lab_name, r.building, r.floor,
                r.capacity + ' seats', r.status,
                r.active_schedules, r.sessions_done,
                r.equipment.substring(0, 45), r.date_added
            ]),
            startY: 34, theme: 'striped',
            headStyles: { fillColor: [26, 71, 49], fontSize: 7, fontStyle: 'bold', textColor: 255 },
            styles: { fontSize: 7, cellPadding: 2.5 },
            columnStyles: {
                0:{cellWidth:8},  1:{cellWidth:22}, 2:{cellWidth:36},
                3:{cellWidth:22}, 4:{cellWidth:14}, 5:{cellWidth:18},
                6:{cellWidth:20}, 7:{cellWidth:16}, 8:{cellWidth:16},
                9:{cellWidth:42}, 10:{cellWidth:20}
            },
            didParseCell(d) {
                if (d.column.index === 6 && d.section === 'body') {
                    const v = (d.cell.text[0] || '').toLowerCase();
                    if (v === 'available')   { d.cell.styles.fillColor = [220,252,231]; d.cell.styles.textColor = [22,101,52]; }
                    if (v === 'maintenance') { d.cell.styles.fillColor = [254,226,226]; d.cell.styles.textColor = [185,28,28]; }
                    if (v === 'inactive')    { d.cell.styles.fillColor = [241,245,249]; d.cell.styles.textColor = [100,116,139]; }
                }
            }
        });

        const pages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i); doc.setFontSize(7); doc.setTextColor(156, 163, 175);
            doc.text(`Laboratory Attendance System  ·  Page ${i} of ${pages}  ·  ${nowStr}`,
                pageW / 2, doc.internal.pageSize.height - 8, { align: 'center' });
        }

        doc.save(`Laboratory_Report_${new Date().toISOString().split('T')[0]}.pdf`);

        // Auto-save after PDF is downloaded
        await autoSaveReport('PDF');
    });
}

// ── CSV ───────────────────────────────────────────────────────
async function exportCSV() {
    const cols = ['#','Lab Code','Lab Name','Building','Floor','Capacity','Status',
                  'Active Schedules','Sessions Done','Equipment','Date Added'];
    const lines = [
        cols.join(','),
        ...REPORT.map((r, i) => [
            i + 1,
            `"${r.lab_code}"`,
            `"${r.lab_name}"`,
            `"${r.building}"`,
            `"${r.floor}"`,
            r.capacity,
            r.status,
            r.active_schedules,
            r.sessions_done,
            `"${r.equipment.replace(/"/g, '""')}"`,
            `"${r.date_added}"`
        ].join(','))
    ];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `Laboratory_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);

    // Auto-save after CSV is downloaded
    await autoSaveReport('Excel/CSV');
}

// ── Excel ─────────────────────────────────────────────────────
async function exportExcel() {
    const wb = XLSX.utils.book_new();

    // ── Summary sheet ──
    const summaryData = [
        ['Laboratory Rooms Report'],
        ['Generated', new Date().toLocaleString()],
        [''],
        ['Total Labs',        META.total],
        ['Available',         META.available],
        ['Under Maintenance', META.maintenance],
        ['Total Seats',       META.capacity],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 22 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // ── Data sheet ──
    const headers = [
        '#', 'Lab Code', 'Lab Name', 'Building', 'Floor',
        'Capacity', 'Status', 'Active Schedules', 'Sessions Completed',
        'Equipment', 'Date Added'
    ];
    const rows = REPORT.map((r, i) => [
        i + 1,
        r.lab_code,
        r.lab_name,
        r.building,
        r.floor,
        r.capacity,
        r.status.charAt(0).toUpperCase() + r.status.slice(1),
        r.active_schedules,
        r.sessions_done,
        r.equipment,
        r.date_added
    ]);

    const dataSheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Column widths
    dataSheet['!cols'] = [
        { wch: 5  },   // #
        { wch: 12 },   // Lab Code
        { wch: 20 },   // Lab Name
        { wch: 18 },   // Building
        { wch: 12 },   // Floor
        { wch: 12 },   // Capacity
        { wch: 14 },   // Status
        { wch: 18 },   // Active Schedules
        { wch: 22 },   // Sessions Completed
        { wch: 30 },   // Equipment
        { wch: 16 },   // Date Added
    ];

    XLSX.utils.book_append_sheet(wb, dataSheet, 'Laboratories');

    // Download
    XLSX.writeFile(wb, `Laboratory_Report_${new Date().toISOString().split('T')[0]}.xlsx`);

    // Auto-save to reports page
    await autoSaveReport('Excel');
}

// ── Keyboard close ────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeReportModal(); }
});

// ── Init ──────────────────────────────────────────────────────
loadLabs();