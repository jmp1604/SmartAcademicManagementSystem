let activeSemesterId = null;
let activeSemesterName = null;
let allSubmissions = [];
let allSemesters = [];
let activeDepartmentName = null;
let activeDepartmentLogoBase64 = null;
let plpLogoBase64 = null;

// supabaseClient is initialised by config.js (loaded before this script in the HTML).
// No waitForDependencies needed — mirrors faculty-myfiles.js / faculty-upload.js pattern.


async function loadAllSemesters() {
    try {
        const { data: sems, error } = await supabaseClient
            .from('semesters')
            .select('id, name, is_active')
            .order('is_active', { ascending: false })
            .order('name', { ascending: false });
        
        if (error) {
            console.error('Error loading semesters:', error);
            return false;
        }
        
        allSemesters = sems || [];
        
        // Find active semester
        const activeSem = allSemesters.find(s => s.is_active);
        if (activeSem) {
            activeSemesterId = activeSem.id;
            activeSemesterName = activeSem.name;
        } else if (allSemesters.length > 0) {
            // Fallback to first semester if no active
            activeSemesterId = allSemesters[0].id;
            activeSemesterName = allSemesters[0].name;
        }
        
        console.log('✓ Semesters loaded:', allSemesters.length, 'records');
        return true;
    } catch (e) {
        console.error('loadAllSemesters error:', e);
        return false;
    }
}

async function loadReportData() {
    try {
        const _userStr = sessionStorage.getItem('user');
        if (!_userStr) { window.location.href = '../../auth/login.html'; return; }
        const sessionUser = JSON.parse(_userStr);
        if (!sessionUser?.id) {
            console.error('[faculty-reports] User not authenticated — cannot load report data.');
            return;
        }
        
        // Load submissions for current professor and selected semester
        const { data: submissions, error } = await supabaseClient
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
            .eq('professor_id', sessionUser.id)
            .eq('semester_id', activeSemesterId)
            .order('submitted_at', { ascending: false });
        
        if (error) {
            console.error('Error loading submissions:', error);
            return;
        }
        
        allSubmissions = submissions || [];
        console.log('✓ Submissions loaded:', allSubmissions.length, 'records');

        // Fetch professor's department + logo from professors -> departments join
        if (!activeDepartmentName) {
            const { data: profData, error: profError } = await supabaseClient
                .from('professors')
                .select('department_id, departments ( department_name, logo_url )')
                .eq('professor_id', sessionUser.id)
                .single();

            if (!profError && profData) {
                activeDepartmentName = profData.departments?.department_name || null;
                console.log('✓ Department loaded:', activeDepartmentName);

                // Pre-fetch both logos as base64 so html2pdf can embed them
                const deptLogoUrl = profData.departments?.logo_url || null;
                [plpLogoBase64, activeDepartmentLogoBase64] = await Promise.all([
                    fetchImageAsBase64('../../auth/assets/plplogo.png'),
                    deptLogoUrl ? fetchImageAsBase64(deptLogoUrl) : Promise.resolve(null)
                ]);
                console.log('✓ Logos loaded — PLP:', !!plpLogoBase64, '| Dept:', !!activeDepartmentLogoBase64);
            } else {
                console.warn('Could not load professor department:', profError);
            }
        }
        
        // Populate filters
        populateSemesterFilter();
        populateCategoryFilter();
        populateStatusFilter();
        
    } catch (err) {
        console.error('Error loading report data:', err);
    }
}

function populateSemesterFilter() {
    const semSelect = document.getElementById('filter-semester');
    if (!semSelect) return;
    
    semSelect.innerHTML = '';
    allSemesters.forEach(sem => {
        const opt = document.createElement('option');
        opt.value = sem.id;
        opt.textContent = sem.name;
        if (sem.id === activeSemesterId) {
            opt.selected = true;
        }
        semSelect.appendChild(opt);
    });
    
    // Add change listener
    semSelect.addEventListener('change', async function() {
        activeSemesterId = this.value;
        const selectedSem = allSemesters.find(s => s.id === activeSemesterId);
        if (selectedSem) {
            activeSemesterName = selectedSem.name;
        }
        await loadReportData();
    });
}

function populateCategoryFilter() {
    const catSelect = document.getElementById('filter-category');
    if (!catSelect) return;
    
    // Get unique categories from submissions
    const categories = new Set();
    allSubmissions.forEach(sub => {
        const catName = sub.requirements?.categories?.name;
        if (catName) categories.add(catName);
    });
    
    catSelect.innerHTML = '<option value="">All Categories</option>';
    Array.from(categories).sort().forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.toLowerCase();
        opt.textContent = cat;
        catSelect.appendChild(opt);
    });
}

function populateStatusFilter() {
    const statusSelect = document.getElementById('filter-status');
    if (!statusSelect) return;
    
    const statuses = ['Approved', 'Pending', 'Rejected'];
    statusSelect.innerHTML = '<option value="">All Statuses</option>';
    statuses.forEach(status => {
        const opt = document.createElement('option');
        opt.value = status.toLowerCase();
        opt.textContent = status;
        statusSelect.appendChild(opt);
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

document.addEventListener('DOMContentLoaded', async function () {
    // Load all semesters and data (supabaseClient is a global from config.js)
    await loadAllSemesters();
    await loadReportData();
    
    // Event listeners for report generation buttons
    document.querySelectorAll('.btn-generate').forEach(btn => {
        btn.addEventListener('click', function() {
            const reportType = this.getAttribute('data-report-type');
            generateReport(reportType);
        });
    });
});

function generateReport(type) {
    // Guard: ensure semester is loaded
    if (!activeSemesterId) {
        alert('Please wait for semester data to load, or select a semester.');
        return;
    }
    // Guard: warn if no data
    if (allSubmissions.length === 0) {
        if (!confirm('No submissions found for this semester. Generate empty report anyway?')) return;
    }

    const labels = {
        summary:  'Submission Summary Report',
        timeline: 'Timeline Report',
        category: 'Category Breakdown Report',
        semester: 'Semester Report',
    };

    if (typeof html2pdf === 'undefined') {
        alert('PDF library not loaded. Please add html2pdf script to the page.');
        console.error('html2pdf is not available');
        return;
    }

    const activeBtn = document.querySelector(`.btn-generate[data-report-type="${type}"]`);
    if (activeBtn) {
        activeBtn.disabled = true;
        activeBtn.textContent = 'Generating\u2026';
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${type}-report-${timestamp}.pdf`;

    // Pass HTML as a string directly to html2pdf.
    // This avoids all DOM visibility/opacity/z-index capture issues.
    const reportBody = createReportContent(type);
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>` +
        `<style>* { box-sizing: border-box; margin: 0; padding: 0; } ` +
        `body { font-family: Arial, sans-serif; color: #333; background: #fff; padding: 20px; }</style>` +
        `</head><body>${reportBody}</body></html>`;

    const options = {
        margin: [10, 10, 10, 10],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };

    html2pdf().set(options).from(fullHtml).save().then(() => {
        console.log('\u2713 Report generated:', filename);
        if (activeBtn) {
            activeBtn.disabled = false;
            activeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Generate ${labels[type] || 'Report'}`;
        }
    }).catch(err => {
        console.error('Error generating PDF:', err);
        if (activeBtn) {
            activeBtn.disabled = false;
            activeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Generate ${labels[type] || 'Report'}`;
        }
        alert('Error generating report: ' + err.message);
    });
}


async function fetchImageAsBase64(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result); // data:image/...;base64,...
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('fetchImageAsBase64 failed for', url, e);
        return null;
    }
}

function createReportContent(type) {
    const _u = sessionStorage.getItem('user');
    const sessionUser = _u ? JSON.parse(_u) : {};
    const userName = `${sessionUser?.firstName || ''} ${sessionUser?.lastName || ''}`.trim();
    const department = escapeHtml(activeDepartmentName || sessionUser?.department || sessionUser?.departmentName || 'N/A');
    const timestamp = new Date().toLocaleString();
    
    // Build header with PLP logo (left) and department logo (right)
    const plpImgTag = plpLogoBase64
        ? `<img src="${plpLogoBase64}" style="height:70px;width:auto;object-fit:contain;" alt="PLP Logo"/>`
        : `<div style="width:70px;"></div>`;
    const deptImgTag = activeDepartmentLogoBase64
        ? `<img src="${activeDepartmentLogoBase64}" style="height:70px;width:auto;object-fit:contain;" alt="Department Logo"/>`
        : `<div style="width:70px;"></div>`;

    let headerHtml = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #145a2e;">
            ${plpImgTag}
            <div style="text-align:center;flex:1;padding:0 10px;">
                <h1 style="margin:0;color:#145a2e;font-size:20px;font-weight:bold;">PAMANTASAN NG LUNGSOD NG PASIG</h1>
                <h2 style="margin:4px 0 0 0;color:#555;font-size:13px;">${department}</h2>
                <h3 style="margin:4px 0 0 0;color:#145a2e;font-size:12px;">Faculty Submission Report</h3>
            </div>
            ${deptImgTag}
        </div>
        <div style="background-color:#145a2e;color:white;padding:12px;margin-bottom:20px;border-radius:4px;text-align:center;">
            <p style="margin:0;font-size:15px;font-weight:bold;">${department}</p>
            <p style="margin:4px 0 0 0;font-size:11px;">${activeSemesterName || 'Academic Report'}</p>
            <p style="margin:4px 0 0 0;font-size:10px;">Generated: ${timestamp}</p>
        </div>
    `;
    
    let userInfoHtml = `
        <div style="background-color: #f9f9f9; padding: 15px; margin-bottom: 20px; border-left: 3px solid #145a2e;">
            <table style="width: 100%; font-size: 12px; border-spacing: 0;">
                <tr>
                    <td style="padding: 5px 10px; width: 50%;"><strong>Professor:</strong> ${escapeHtml(userName)}</td>
                    <td style="padding: 5px 10px; width: 50%;"><strong>Email:</strong> ${escapeHtml(sessionUser?.email || 'N/A')}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 10px;"><strong>Department:</strong> ${department}</td>
                    <td style="padding: 5px 10px;"><strong>Semester:</strong> ${activeSemesterName || 'N/A'}</td>
                </tr>
            </table>
        </div>
    `;
    
    let reportContent = '';
    
    switch(type) {
        case 'summary':
            reportContent = createSummaryReport();
            break;
        case 'timeline':
            reportContent = createTimelineReport();
            break;
        case 'category':
            reportContent = createCategoryReport();
            break;
        case 'semester':
            reportContent = createSemesterReport();
            break;
        default:
            reportContent = '<p>Unknown report type</p>';
    }
    
    return `
        <div style="font-family: Arial, sans-serif; color: #333; background-color: white;">
            ${headerHtml}
            ${userInfoHtml}
            ${reportContent}
        </div>
    `;
}

function createSummaryReport() {
    const approved = allSubmissions.filter(s => s.status === 'approved').length;
    const pending = allSubmissions.filter(s => s.status === 'pending').length;
    const rejected = allSubmissions.filter(s => s.status === 'rejected').length;
    const total = allSubmissions.length;
    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
    
    console.log('SUMMARY REPORT DATA:', { total, approved, pending, rejected });
    
    let tableRows = '';
    if (allSubmissions.length === 0) {
        tableRows = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #999;">No submissions found</td></tr>';
    } else {
        tableRows = allSubmissions.map(sub => `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; font-size: 11px;">${escapeHtml(sub.submission_files?.[0]?.file_name || 'N/A')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; font-size: 11px;">${escapeHtml(sub.requirements?.categories?.name || 'N/A')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; font-size: 11px; text-align: center;">
                    <strong style="color: ${sub.status === 'approved' ? '#155724' : sub.status === 'rejected' ? '#721c24' : '#856404'};">
                        ${sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                    </strong>
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; font-size: 11px;">${new Date(sub.submitted_at).toLocaleDateString()}</td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; font-size: 11px;">${sub.reviewed_at ? new Date(sub.reviewed_at).toLocaleDateString() : 'Pending'}</td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; font-size: 10px; color: #666;">${sub.remarks ? escapeHtml(sub.remarks.substring(0, 40)) + (sub.remarks.length > 40 ? '...' : '') : '-'}</td>
            </tr>
        `).join('');
    }
    
    return `
        <div style="margin-bottom: 30px;">
            <h3 style="color: #145a2e; font-size: 16px; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #145a2e;">Summary Statistics</h3>
            <table style="width: 100%; margin-bottom: 20px; border-collapse: collapse;">
                <tr>
                    <td style="padding: 12px; background-color: #f0f0f0; text-align: center; width: 25%; border: 1px solid #ddd;">
                        <div style="font-size: 24px; font-weight: bold; color: #145a2e;">${total}</div>
                        <div style="font-size: 11px; color: #666; margin-top: 3px;">Total</div>
                    </td>
                    <td style="padding: 12px; background-color: #d4edda; text-align: center; width: 25%; border: 1px solid #ddd;">
                        <div style="font-size: 24px; font-weight: bold; color: #155724;">${approved}</div>
                        <div style="font-size: 11px; color: #155724; margin-top: 3px;">Approved</div>
                    </td>
                    <td style="padding: 12px; background-color: #fff3cd; text-align: center; width: 25%; border: 1px solid #ddd;">
                        <div style="font-size: 24px; font-weight: bold; color: #856404;">${pending}</div>
                        <div style="font-size: 11px; color: #856404; margin-top: 3px;">Pending</div>
                    </td>
                    <td style="padding: 12px; background-color: #f8d7da; text-align: center; width: 25%; border: 1px solid #ddd;">
                        <div style="font-size: 24px; font-weight: bold; color: #721c24;">${rejected}</div>
                        <div style="font-size: 11px; color: #721c24; margin-top: 3px;">Rejected</div>
                    </td>
                </tr>
            </table>
            <div style="background-color: #f9f9f9; padding: 10px; border-left: 3px solid #145a2e;">
                <strong style="color: #145a2e;">Approval Rate: ${approvalRate}%</strong>
            </div>
        </div>
        
        <div>
            <h3 style="color: #145a2e; font-size: 16px; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #145a2e;">Submissions Detail</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <thead>
                    <tr style="background-color: #145a2e; color: white;">
                        <th style="padding: 10px; text-align: left;">File</th>
                        <th style="padding: 10px; text-align: left;">Category</th>
                        <th style="padding: 10px; text-align: center;">Status</th>
                        <th style="padding: 10px; text-align: left;">Submitted</th>
                        <th style="padding: 10px; text-align: left;">Reviewed</th>
                        <th style="padding: 10px; text-align: left;">Remarks</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
    `;
}

function createTimelineReport() {
    const sortedSubmissions = [...allSubmissions].sort((a, b) => 
        new Date(b.submitted_at) - new Date(a.submitted_at)
    );
    
    let timelineItems = sortedSubmissions.map((sub, idx) => `
        <div style="margin-bottom: 15px; padding: 12px; background-color: #f9f9f9; border-left: 3px solid #145a2e;">
            <div style="font-weight: bold; color: #145a2e; font-size: 12px; margin-bottom: 5px;">${escapeHtml(sub.submission_files?.[0]?.file_name || 'N/A')}</div>
            <table style="width: 100%; font-size: 11px; border-spacing: 0;">
                <tr>
                    <td style="padding: 3px 5px; width: 50%;"><strong>Submitted:</strong> ${new Date(sub.submitted_at).toLocaleString()}</td>
                    <td style="padding: 3px 5px; width: 50%;"><strong>Category:</strong> ${escapeHtml(sub.requirements?.categories?.name || 'N/A')}</td>
                </tr>
                <tr>
                    <td style="padding: 3px 5px;"><strong>Status:</strong> <span style="color: ${sub.status === 'approved' ? '#155724' : sub.status === 'rejected' ? '#721c24' : '#856404'}; font-weight: bold;">${sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}</span></td>
                    <td style="padding: 3px 5px;"><strong>Requirement:</strong> ${escapeHtml(sub.requirements?.name || 'N/A')}</td>
                </tr>
                ${sub.remarks ? `<tr><td colspan="2" style="padding: 5px; background-color: white; border-top: 1px solid #ddd; margin-top: 5px;"><strong>Remarks:</strong> ${escapeHtml(sub.remarks)}</td></tr>` : ''}
            </table>
        </div>
    `).join('');
    
    return `
        <div>
            <h3 style="color: #145a2e; font-size: 16px; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #145a2e;">Submission Timeline</h3>
            ${timelineItems}
        </div>
    `;
}

function createCategoryReport() {
    const categoryMap = {};
    allSubmissions.forEach(sub => {
        const cat = sub.requirements?.categories?.name || 'Uncategorized';
        if (!categoryMap[cat]) {
            categoryMap[cat] = { total: 0, approved: 0, pending: 0, rejected: 0, submissions: [] };
        }
        categoryMap[cat].total++;
        categoryMap[cat][sub.status]++;
        categoryMap[cat].submissions.push(sub);
    });
    
    let categoryDetails = Object.entries(categoryMap).map(([cat, stats]) => {
        const approvalRate = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;
        const submissionList = stats.submissions.map(sub => `<div style="font-size: 10px; padding: 5px 0; border-bottom: 1px solid #eee;">
            ${escapeHtml(sub.submission_files?.[0]?.file_name || 'N/A')} - <strong>${sub.status}</strong> (${new Date(sub.submitted_at).toLocaleDateString()})
        </div>`).join('');
        
        return `
        <div style="margin-bottom: 20px; background-color: white; padding: 12px; border-left: 3px solid #145a2e;">
            <div style="font-weight: bold; color: #145a2e; font-size: 13px; margin-bottom: 10px;">${escapeHtml(cat)}</div>
            <table style="width: 100%; margin-bottom: 10px; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px; background-color: #f0f0f0; text-align: center; border: 1px solid #ddd; width: 25%;"><strong style="color: #145a2e;">${stats.total}</strong><br/><span style="font-size: 10px; color: #666;">Total</span></td>
                    <td style="padding: 8px; background-color: #d4edda; text-align: center; border: 1px solid #ddd; width: 25%;"><strong style="color: #155724;">${stats.approved}</strong><br/><span style="font-size: 10px; color: #155724;">Approved</span></td>
                    <td style="padding: 8px; background-color: #fff3cd; text-align: center; border: 1px solid #ddd; width: 25%;"><strong style="color: #856404;">${stats.pending}</strong><br/><span style="font-size: 10px; color: #856404;">Pending</span></td>
                    <td style="padding: 8px; background-color: #f8d7da; text-align: center; border: 1px solid #ddd; width: 25%;"><strong style="color: #721c24;">${stats.rejected}</strong><br/><span style="font-size: 10px; color: #721c24;">Rejected</span></td>
                </tr>
            </table>
            <div style="font-size: 10px; padding: 5px; background-color: #f9f9f9;">
                <strong>Approval Rate: ${approvalRate}%</strong>
            </div>
            <div style="margin-top: 8px;">
                <div style="font-size: 11px; font-weight: bold; margin-bottom: 5px;">Submissions:</div>
                ${submissionList}
            </div>
        </div>
        `;
    }).join('');
    
    return `
        <div>
            <h3 style="color: #145a2e; font-size: 16px; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #145a2e;">Category Breakdown</h3>
            ${categoryDetails}
        </div>
    `;
}

function createSemesterReport() {
    const approved = allSubmissions.filter(s => s.status === 'approved').length;
    const pending = allSubmissions.filter(s => s.status === 'pending').length;
    const rejected = allSubmissions.filter(s => s.status === 'rejected').length;
    const total = allSubmissions.length;
    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
    
    let tableRows = '';
    if (allSubmissions.length === 0) {
        tableRows = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #999;">No submissions found</td></tr>';
    } else {
        tableRows = allSubmissions.map(sub => `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; font-size: 11px;">${escapeHtml(sub.submission_files?.[0]?.file_name || 'N/A')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; font-size: 11px;">${escapeHtml(sub.requirements?.name || 'N/A')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; font-size: 11px;">${escapeHtml(sub.requirements?.categories?.name || 'N/A')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; font-size: 11px; text-align: center;">
                    <strong style="color: ${sub.status === 'approved' ? '#155724' : sub.status === 'rejected' ? '#721c24' : '#856404'};">
                        ${sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                    </strong>
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; font-size: 11px;">${new Date(sub.submitted_at).toLocaleDateString()}</td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; font-size: 11px;">${sub.reviewed_at ? new Date(sub.reviewed_at).toLocaleDateString() : 'Pending'}</td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; font-size: 10px; color: #666;">${sub.remarks ? escapeHtml(sub.remarks.substring(0, 30)) + (sub.remarks.length > 30 ? '...' : '') : '-'}</td>
            </tr>
        `).join('');
    }
    
    return `
        <div style="margin-bottom: 30px;">
            <h3 style="color: #145a2e; font-size: 16px; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #145a2e;">Semester Summary</h3>
            <table style="width: 100%; margin-bottom: 15px; border-collapse: collapse;">
                <tr>
                    <td style="padding: 12px; background-color: #f0f0f0; border: 1px solid #ddd; width: 33%; text-align: center;">
                        <div style="font-size: 20px; font-weight: bold; color: #145a2e;">${total}</div>
                        <div style="font-size: 11px; color: #666;">Total Submissions</div>
                    </td>
                    <td style="padding: 12px; background-color: #d4edda; border: 1px solid #ddd; width: 33%; text-align: center;">
                        <div style="font-size: 20px; font-weight: bold; color: #155724;">${approvalRate}%</div>
                        <div style="font-size: 11px; color: #155724;">Approval Rate</div>
                    </td>
                    <td style="padding: 12px; background-color: #fff3cd; border: 1px solid #ddd; width: 33%; text-align: center;">
                        <div style="font-size: 20px; font-weight: bold; color: #856404;">${pending}</div>
                        <div style="font-size: 11px; color: #856404;">Pending</div>
                    </td>
                </tr>
            </table>
            <div style="background-color: #f9f9f9; padding: 12px; border-left: 3px solid #145a2e; margin-bottom: 15px;">
                <table style="width: 100%; font-size: 11px; border-spacing: 0;">
                    <tr>
                        <td style="padding: 3px 5px;"><strong style="color: #155724;">Approved:</strong> ${approved}</td>
                        <td style="padding: 3px 5px;"><strong style="color: #721c24;">Rejected:</strong> ${rejected}</td>
                        <td style="padding: 3px 5px;"><strong style="color: #145a2e;">Pending:</strong> ${pending}</td>
                    </tr>
                </table>
            </div>
        </div>
        
        <div>
            <h3 style="color: #145a2e; font-size: 16px; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #145a2e;">Detailed Submissions</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <thead>
                    <tr style="background-color: #145a2e; color: white;">
                        <th style="padding: 10px; text-align: left;">File</th>
                        <th style="padding: 10px; text-align: left;">Requirement</th>
                        <th style="padding: 10px; text-align: left;">Category</th>
                        <th style="padding: 10px; text-align: center;">Status</th>
                        <th style="padding: 10px; text-align: left;">Submitted</th>
                        <th style="padding: 10px; text-align: left;">Reviewed</th>
                        <th style="padding: 10px; text-align: left;">Remarks</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
    `;
}