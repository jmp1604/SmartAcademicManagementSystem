let activeSemesterId   = null;
let activeSemesterName = null;
let allSubmissions     = [];
let allSemesters       = [];
let allProfessors      = [];
let activeDepartmentId   = null;
let activeDepartmentName = null;
let activeDepartmentLogoBase64 = null;
let plpLogoBase64      = null;

document.addEventListener('DOMContentLoaded', async () => {
    const userStr = sessionStorage.getItem('user');
    if (!userStr) { window.location.href = '../../auth/login.html'; return; }

    let sessionUser;
    try { sessionUser = JSON.parse(userStr); } catch (e) {
        window.location.href = '../../auth/login.html'; return;
    }

    if (sessionUser.userType !== 'admin') {
        alert('Access denied. Admin privileges required.');
        window.location.href = '../../portal/portal.html';
        return;
    }

    activeDepartmentId = sessionUser.departmentId || null;

    await loadAllSemesters();
    await loadProfessors();
    await loadReportData();

    populateStatusFilter();

    document.querySelectorAll('.btn-generate').forEach(btn => {
        btn.addEventListener('click', function () {
            generateReport(this.getAttribute('data-report-type'));
        });
    });
});

async function loadAllSemesters() {
    try {
        const { data: sems, error } = await supabaseClient
            .from('semesters')
            .select('id, name, is_active')
            .order('is_active', { ascending: false })
            .order('name',      { ascending: false });

        if (error) { console.error('Error loading semesters:', error); return false; }

        allSemesters = sems || [];

        const activeSem = allSemesters.find(s => s.is_active) || allSemesters[0];
        if (activeSem) {
            activeSemesterId   = activeSem.id;
            activeSemesterName = activeSem.name;
        }

        console.log('✓ Semesters loaded:', allSemesters.length);
        populateSemesterFilter();
        return true;
    } catch (e) {
        console.error('loadAllSemesters error:', e);
        return false;
    }
}

async function loadProfessors() {
    if (!activeDepartmentId) {
        console.warn('loadProfessors: no activeDepartmentId, skipping');
        return;
    }
    try {
        const { data, error } = await supabaseClient
            .from('professors')
            .select('professor_id, first_name, middle_name, last_name, department_id')
            .eq('department_id', activeDepartmentId)
            .eq('status', 'active')
            .order('last_name', { ascending: true });

        if (error) {
            console.error('Error loading professors:', error);
            return;
        }

        allProfessors = data || [];
        console.log('✓ Professors loaded:', allProfessors.length);
        populateProfessorFilter();
    } catch (e) {
        console.error('loadProfessors error:', e);
    }
}

async function loadReportData() {
    try {
        if (!activeSemesterId) {
            console.warn('No active semester — cannot load report data');
            return;
        }

        const selectedSemId  = getFilterValue('filter-semester')  || activeSemesterId;
        const selectedProfId = getFilterValue('filter-professor')  || null;
        const selectedCatId  = getFilterValue('filter-category')   || null;
        const selectedStatus = getFilterValue('filter-status')     || null;

        let query = supabaseClient
            .from('submissions')
            .select(`
                id,
                professor_id,
                requirement_id,
                semester_id,
                status,
                submitted_at,
                reviewed_at,
                remarks,
                updated_at,
                requirements (
                    name,
                    category_id,
                    categories ( name )
                ),
                submission_files (
                    id,
                    file_name,
                    file_url,
                    uploaded_at
                )
            `)
            .eq('semester_id', selectedSemId)
            .order('submitted_at', { ascending: false });

        if (selectedProfId) query = query.eq('professor_id', selectedProfId);
        if (selectedStatus)  query = query.eq('status', selectedStatus);

        const { data: submissions, error } = await query;

        if (error) {
            console.error('Error loading submissions:', error);
            return;
        }

        let filtered = submissions || [];

        // Filter to only professors in this department (when no specific prof selected)
        if (!selectedProfId && allProfessors.length > 0) {
            const deptProfIds = new Set(allProfessors.map(p => p.professor_id));
            filtered = filtered.filter(s => deptProfIds.has(s.professor_id));
        }

        // Category filter (client-side — nested field)
        if (selectedCatId) {
            filtered = filtered.filter(s => s.requirements?.category_id === selectedCatId);
        }

        allSubmissions = filtered;
        console.log('✓ Submissions loaded:', allSubmissions.length);

        // Load department name + logos once
        if (!activeDepartmentName && activeDepartmentId) {
            const { data: deptData } = await supabaseClient
                .from('departments')
                .select('department_name, logo_url')
                .eq('id', activeDepartmentId)
                .single();

            if (deptData) {
                activeDepartmentName = deptData.department_name || null;
                const deptLogoUrl    = deptData.logo_url || null;

                [plpLogoBase64, activeDepartmentLogoBase64] = await Promise.all([
                    plpLogoBase64 ? Promise.resolve(plpLogoBase64) : fetchImageAsBase64('../../auth/assets/plplogo.png'),
                    deptLogoUrl   ? fetchImageAsBase64(deptLogoUrl) : Promise.resolve(null)
                ]);

                console.log('✓ Logos — PLP:', !!plpLogoBase64, '| Dept:', !!activeDepartmentLogoBase64);
            }
        }

        populateCategoryFilter();

    } catch (err) {
        console.error('Error in loadReportData:', err);
    }
}

/* ── Filter population ───────────────────────────────────────────────────── */
function populateSemesterFilter() {
    const el = document.getElementById('filter-semester');
    if (!el) return;
    el.innerHTML = '';
    allSemesters.forEach(sem => {
        const opt = document.createElement('option');
        opt.value       = sem.id;
        opt.textContent = sem.name;
        if (sem.id === activeSemesterId) opt.selected = true;
        el.appendChild(opt);
    });
    if (!el.dataset.listenerAttached) {
        el.addEventListener('change', async () => {
            activeSemesterId   = el.value;
            const found = allSemesters.find(s => s.id === activeSemesterId);
            activeSemesterName = found ? found.name : '';
            await loadReportData();
        });
        el.dataset.listenerAttached = 'true';
    }
}

/**
 * FIX: Use `professor_id` as the option value and
 * `first_name + last_name` (DB column names) for display.
 */
function populateProfessorFilter() {
    const el = document.getElementById('filter-professor');
    if (!el) return;
    el.innerHTML = '<option value="">All Professors</option>';
    allProfessors.forEach(p => {
        const opt = document.createElement('option');
        opt.value       = p.professor_id;
        opt.textContent = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.professor_id;
        el.appendChild(opt);
    });
    if (!el.dataset.listenerAttached) {
        el.addEventListener('change', () => loadReportData());
        el.dataset.listenerAttached = 'true';
    }
}

function populateCategoryFilter() {
    const el = document.getElementById('filter-category');
    if (!el) return;
    const cats = new Set();
    allSubmissions.forEach(s => {
        const name = s.requirements?.categories?.name;
        if (name) cats.add(JSON.stringify({ id: s.requirements.category_id, name }));
    });
    el.innerHTML = '<option value="">All Categories</option>';
    Array.from(cats).map(c => JSON.parse(c)).sort((a, b) => a.name.localeCompare(b.name)).forEach(cat => {
        const opt = document.createElement('option');
        opt.value       = cat.id;
        opt.textContent = cat.name;
        el.appendChild(opt);
    });
    if (!el.dataset.listenerAttached) {
        el.addEventListener('change', () => loadReportData());
        el.dataset.listenerAttached = 'true';
    }
}

function populateStatusFilter() {
    const el = document.getElementById('filter-status');
    if (!el) return;
    const statuses = ['Approved', 'Pending', 'Rejected'];
    el.innerHTML = '<option value="">All Statuses</option>';
    statuses.forEach(s => {
        const opt = document.createElement('option');
        opt.value       = s.toLowerCase();
        opt.textContent = s;
        el.appendChild(opt);
    });
    if (!el.dataset.listenerAttached) {
        el.addEventListener('change', () => loadReportData());
        el.dataset.listenerAttached = 'true';
    }
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function getFilterValue(id) {
    const el = document.getElementById(id);
    return el ? (el.value || null) : null;
}

function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

async function fetchImageAsBase64(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror   = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('fetchImageAsBase64 failed for', url, e);
        return null;
    }
}

/**
 * Helper: resolve professor display name from allProfessors by professor_id.
 * Uses first_name + last_name (actual DB columns).
 */
function getProfName(professorId) {
    const prof = allProfessors.find(p => p.professor_id === professorId);
    if (prof) return `${prof.first_name || ''} ${prof.last_name || ''}`.trim();
    return professorId || 'Unknown';
}

/* ── Report generation ───────────────────────────────────────────────────── */

/**
 * FIX: Normalise the type key so both hyphenated HTML values
 * ('professor-performance', 'submission-status') and bare values work.
 */
const TYPE_ALIASES = {
    'professor-performance': 'performance',
    'submission-status':     'status',
};

const REPORT_LABELS = {
    'overview':    'Department Overview',
    'performance': 'Professor Performance',
    'status':      'Submission Status',
    'compliance':  'Compliance Report',
    // aliases → same labels
    'professor-performance': 'Professor Performance',
    'submission-status':     'Submission Status',
};

function generateReport(rawType) {
    const type = TYPE_ALIASES[rawType] || rawType;

    if (!activeSemesterId) {
        alert('Please wait for semester data to load, or select a semester.');
        return;
    }
    if (allSubmissions.length === 0) {
        if (!confirm('No submissions found for the current filters. Generate empty report anyway?')) return;
    }

    if (typeof html2pdf === 'undefined') {
        alert('PDF library not loaded. Please ensure html2pdf is included in the page.');
        return;
    }

    const activeBtn = document.querySelector(`.btn-generate[data-report-type="${rawType}"]`);
    if (activeBtn) {
        activeBtn.disabled    = true;
        activeBtn.textContent = 'Generating…';
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const filename  = `admin-${type}-report-${timestamp}.pdf`;

    const reportBody = createReportContent(type);
    const fullHtml   =
        `<!DOCTYPE html><html><head><meta charset="UTF-8"/>` +
        `<style>* { box-sizing: border-box; margin: 0; padding: 0; } ` +
        `body { font-family: Arial, sans-serif; color: #333; background: #fff; padding: 20px; }</style>` +
        `</head><body>${reportBody}</body></html>`;

    const options = {
        margin:      [10, 10, 10, 10],
        filename,
        image:       { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
        jsPDF:       { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };

    html2pdf().set(options).from(fullHtml).save()
        .then(() => {
            console.log('✓ Report generated:', filename);
            if (activeBtn) {
                activeBtn.disabled    = false;
                activeBtn.textContent = REPORT_LABELS[rawType] || 'Generate Report';
            }
        })
        .catch(err => {
            console.error('Error generating PDF:', err);
            if (activeBtn) {
                activeBtn.disabled    = false;
                activeBtn.textContent = REPORT_LABELS[rawType] || 'Generate Report';
            }
            alert('Error generating report: ' + err.message);
        });
}

/* ── Report content builder ──────────────────────────────────────────────── */
function createReportContent(type) {
    const timestamp  = new Date().toLocaleString();
    const department = escapeHtml(activeDepartmentName || 'Department');

    const plpImg  = plpLogoBase64
        ? `<img src="${plpLogoBase64}" style="height:70px;width:auto;object-fit:contain;" alt="PLP Logo"/>`
        : `<div style="width:70px;"></div>`;
    const deptImg = activeDepartmentLogoBase64
        ? `<img src="${activeDepartmentLogoBase64}" style="height:70px;width:auto;object-fit:contain;" alt="Dept Logo"/>`
        : `<div style="width:70px;"></div>`;

    const headerHtml = `
        <div style="display:flex;align-items:center;justify-content:space-between;
                    margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #145a2e;">
            ${plpImg}
            <div style="text-align:center;flex:1;padding:0 10px;">
                <h1 style="margin:0;color:#145a2e;font-size:20px;font-weight:bold;">
                    PAMANTASAN NG LUNGSOD NG PASIG</h1>
                <h2 style="margin:4px 0 0;color:#555;font-size:13px;">College of Computer Studies</h2>
                <h3 style="margin:4px 0 0;color:#145a2e;font-size:12px;">Admin Report</h3>
            </div>
            ${deptImg}
        </div>
        <div style="background-color:#145a2e;color:white;padding:12px;margin-bottom:20px;
                    border-radius:4px;text-align:center;">
            <p style="margin:0;font-size:15px;font-weight:bold;">${department}</p>
            <p style="margin:4px 0 0;font-size:11px;">${escapeHtml(activeSemesterName || 'Academic Report')}</p>
            <p style="margin:4px 0 0;font-size:10px;">Generated: ${timestamp}</p>
        </div>`;

    let reportContent = '';
    switch (type) {
        case 'overview':    reportContent = createOverviewReport();    break;
        case 'performance': reportContent = createPerformanceReport(); break;
        case 'status':      reportContent = createStatusReport();      break;
        case 'compliance':  reportContent = createComplianceReport();  break;
        default:            reportContent = '<p>Unknown report type</p>';
    }

    return `<div style="font-family:Arial,sans-serif;color:#333;background:white;">
                ${headerHtml}${reportContent}
            </div>`;
}

/* ── Individual report creators ──────────────────────────────────────────── */

function createOverviewReport() {
    const total    = allSubmissions.length;
    const approved = allSubmissions.filter(s => s.status === 'approved').length;
    const pending  = allSubmissions.filter(s => s.status === 'pending').length;
    const rejected = allSubmissions.filter(s => s.status === 'rejected').length;
    const rate     = total > 0 ? Math.round((approved / total) * 100) : 0;

    const byProf = {};
    allSubmissions.forEach(s => {
        const pid = s.professor_id;
        if (!byProf[pid]) byProf[pid] = { total: 0, approved: 0, pending: 0, rejected: 0 };
        byProf[pid].total++;
        byProf[pid][s.status] = (byProf[pid][s.status] || 0) + 1;
    });

    const profRows = Object.entries(byProf).map(([pid, stat]) => `
        <tr>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;">${escapeHtml(getProfName(pid))}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;">${stat.total}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;color:#155724;">${stat.approved || 0}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;color:#856404;">${stat.pending || 0}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;color:#721c24;">${stat.rejected || 0}</td>
        </tr>`).join('');

    return `
        <div style="margin-bottom:30px;">
            <h3 style="color:#145a2e;font-size:16px;margin:0 0 15px;padding-bottom:10px;border-bottom:2px solid #145a2e;">
                Department Overview</h3>
            <table style="width:100%;margin-bottom:20px;border-collapse:collapse;">
                <tr>
                    <td style="padding:12px;background:#f0f0f0;text-align:center;border:1px solid #ddd;width:25%;">
                        <div style="font-size:24px;font-weight:bold;color:#145a2e;">${total}</div>
                        <div style="font-size:11px;color:#666;margin-top:3px;">Total</div></td>
                    <td style="padding:12px;background:#d4edda;text-align:center;border:1px solid #ddd;width:25%;">
                        <div style="font-size:24px;font-weight:bold;color:#155724;">${approved}</div>
                        <div style="font-size:11px;color:#155724;margin-top:3px;">Approved</div></td>
                    <td style="padding:12px;background:#fff3cd;text-align:center;border:1px solid #ddd;width:25%;">
                        <div style="font-size:24px;font-weight:bold;color:#856404;">${pending}</div>
                        <div style="font-size:11px;color:#856404;margin-top:3px;">Pending</div></td>
                    <td style="padding:12px;background:#f8d7da;text-align:center;border:1px solid #ddd;width:25%;">
                        <div style="font-size:24px;font-weight:bold;color:#721c24;">${rejected}</div>
                        <div style="font-size:11px;color:#721c24;margin-top:3px;">Rejected</div></td>
                </tr>
            </table>
            <div style="background:#f9f9f9;padding:10px;border-left:3px solid #145a2e;margin-bottom:20px;">
                <strong style="color:#145a2e;">Overall Approval Rate: ${rate}%</strong>
            </div>
            <h3 style="color:#145a2e;font-size:14px;margin:0 0 10px;padding-bottom:8px;border-bottom:1px solid #ccc;">
                Breakdown by Professor</h3>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead><tr style="background:#145a2e;color:white;">
                    <th style="padding:8px;text-align:left;">Professor</th>
                    <th style="padding:8px;text-align:center;">Total</th>
                    <th style="padding:8px;text-align:center;">Approved</th>
                    <th style="padding:8px;text-align:center;">Pending</th>
                    <th style="padding:8px;text-align:center;">Rejected</th>
                </tr></thead>
                <tbody>${profRows || '<tr><td colspan="5" style="text-align:center;padding:20px;color:#999;">No data</td></tr>'}</tbody>
            </table>
        </div>`;
}

function createPerformanceReport() {
    const byProf = {};
    allSubmissions.forEach(s => {
        const pid = s.professor_id;
        if (!byProf[pid]) byProf[pid] = { total: 0, approved: 0, pending: 0, rejected: 0 };
        byProf[pid].total++;
        byProf[pid][s.status] = (byProf[pid][s.status] || 0) + 1;
    });

    const sorted = Object.entries(byProf).sort(([, a], [, b]) => {
        const rateA = a.total > 0 ? a.approved / a.total : 0;
        const rateB = b.total > 0 ? b.approved / b.total : 0;
        return rateB - rateA;
    });

    const rows = sorted.map(([pid, stat]) => {
        const rate = stat.total > 0 ? Math.round((stat.approved / stat.total) * 100) : 0;
        return `<tr>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;">${escapeHtml(getProfName(pid))}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;">${stat.total}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;color:#155724;">${stat.approved||0}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;color:#856404;">${stat.pending||0}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;color:#721c24;">${stat.rejected||0}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;
                       color:${rate>=80?'#155724':rate>=50?'#856404':'#721c24'};font-weight:bold;">${rate}%</td>
        </tr>`;
    }).join('');

    return `
        <div>
            <h3 style="color:#145a2e;font-size:16px;margin:0 0 15px;padding-bottom:10px;border-bottom:2px solid #145a2e;">
                Professor Performance</h3>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead><tr style="background:#145a2e;color:white;">
                    <th style="padding:8px;text-align:left;">Professor</th>
                    <th style="padding:8px;text-align:center;">Total</th>
                    <th style="padding:8px;text-align:center;">Approved</th>
                    <th style="padding:8px;text-align:center;">Pending</th>
                    <th style="padding:8px;text-align:center;">Rejected</th>
                    <th style="padding:8px;text-align:center;">Approval Rate</th>
                </tr></thead>
                <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#999;">No data</td></tr>'}</tbody>
            </table>
        </div>`;
}

function createStatusReport() {
    const rows = allSubmissions.map(sub => {
        const statusColor = sub.status === 'approved' ? '#155724' : sub.status === 'rejected' ? '#721c24' : '#856404';
        return `<tr>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;">${escapeHtml(getProfName(sub.professor_id))}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;">${escapeHtml(sub.requirements?.name||'N/A')}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;">${escapeHtml(sub.requirements?.categories?.name||'N/A')}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;">
                <strong style="color:${statusColor};">${sub.status.charAt(0).toUpperCase()+sub.status.slice(1)}</strong></td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;">${sub.submitted_at?new Date(sub.submitted_at).toLocaleDateString():'-'}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;">${sub.reviewed_at?new Date(sub.reviewed_at).toLocaleDateString():'Pending'}</td>
        </tr>`;
    }).join('');

    return `
        <div>
            <h3 style="color:#145a2e;font-size:16px;margin:0 0 15px;padding-bottom:10px;border-bottom:2px solid #145a2e;">
                Submission Status Report</h3>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead><tr style="background:#145a2e;color:white;">
                    <th style="padding:8px;text-align:left;">Professor</th>
                    <th style="padding:8px;text-align:left;">Requirement</th>
                    <th style="padding:8px;text-align:left;">Category</th>
                    <th style="padding:8px;text-align:center;">Status</th>
                    <th style="padding:8px;text-align:left;">Submitted</th>
                    <th style="padding:8px;text-align:left;">Reviewed</th>
                </tr></thead>
                <tbody>${rows||'<tr><td colspan="6" style="text-align:center;padding:20px;color:#999;">No submissions found</td></tr>'}</tbody>
            </table>
        </div>`;
}

function createComplianceReport() {
    const byProf = {};
    allSubmissions.forEach(s => {
        const pid = s.professor_id;
        if (!byProf[pid]) byProf[pid] = { submitted: 0, approved: 0, pending: 0, rejected: 0 };
        byProf[pid].submitted++;
        byProf[pid][s.status] = (byProf[pid][s.status] || 0) + 1;
    });

    const rows = Object.entries(byProf).map(([pid, stat]) => {
        const complianceColor = stat.pending > 0 ? '#856404' : stat.rejected > 0 ? '#721c24' : '#155724';
        const complianceLabel = stat.pending > 0 ? 'Has Pending' : stat.rejected > 0 ? 'Has Rejected' : 'Compliant';
        return `<tr>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;">${escapeHtml(getProfName(pid))}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;">${stat.submitted}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;color:#155724;">${stat.approved||0}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;color:#856404;">${stat.pending||0}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;color:#721c24;">${stat.rejected||0}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;">
                <strong style="color:${complianceColor};">${complianceLabel}</strong></td>
        </tr>`;
    }).join('');

    return `
        <div>
            <h3 style="color:#145a2e;font-size:16px;margin:0 0 15px;padding-bottom:10px;border-bottom:2px solid #145a2e;">
                Compliance Report</h3>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead><tr style="background:#145a2e;color:white;">
                    <th style="padding:8px;text-align:left;">Professor</th>
                    <th style="padding:8px;text-align:center;">Submitted</th>
                    <th style="padding:8px;text-align:center;">Approved</th>
                    <th style="padding:8px;text-align:center;">Pending</th>
                    <th style="padding:8px;text-align:center;">Rejected</th>
                    <th style="padding:8px;text-align:center;">Compliance</th>
                </tr></thead>
                <tbody>${rows||'<tr><td colspan="6" style="text-align:center;padding:20px;color:#999;">No data</td></tr>'}</tbody>
            </table>
        </div>`;
}