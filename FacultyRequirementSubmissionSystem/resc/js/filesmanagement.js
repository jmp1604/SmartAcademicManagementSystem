let allSubmissions = [];
let currentSubmissionId = null;
let currentFileUrl = null;
let currentFileName = null;
let activeSemesterId = null;
let activeSemesterName = null;

async function resolveFileUrl(raw, fileName) {
    if (!raw) { console.warn('No file URL for:', fileName); return null; }

    let storagePath;

    if (raw.startsWith('http')) {
        const marker = '/object/public/faculty-submissions/';
        const idx = raw.indexOf(marker);
        if (idx !== -1) {
            storagePath = decodeURIComponent(raw.substring(idx + marker.length));
        } else {
            return raw;
        }
    } else {
        storagePath = raw;
    }
    const pathsToTry = new Set();
    pathsToTry.add(storagePath);

    const parts = storagePath.split('/');
    if (parts.length === 2) {
        pathsToTry.add(`${parts[0]}/${parts[0]}/${parts[1]}`);
    }
    if (parts.length === 3 && parts[0] === parts[1]) {
        pathsToTry.add(`${parts[0]}/${parts[2]}`);
    }

    for (const path of [...pathsToTry]) {
        console.log('Trying path:', path);
        try {
            const { data, error } = await supabaseClient.storage
                .from('faculty-submissions')
                .createSignedUrl(path, 3600);

            if (!error && data?.signedUrl) {
                console.log('✓ Success with path:', path);
                return data.signedUrl;
            }
            console.warn(`✗ Failed (${path}):`, error?.message);
        } catch (err) {
            console.warn(`✗ Exception (${path}):`, err.message);
        }
    }

    console.error('All paths failed for:', storagePath);
    return raw;
}

document.addEventListener('DOMContentLoaded', async function () {
    if (!isAdmin()) {
        window.location.href = '../../auth/login.html';
        return;
    }

    await loadActiveSemester();
    loadSubmissions();
    setupEventListeners();
    populateDeptFilter();
    populateCatFilter();
});

async function loadActiveSemester() {
    try {
        const { data: sem, error } = await supabaseClient
            .from('semesters')
            .select('id, name')
            .eq('is_active', true)
            .limit(1)
            .single();
        
        if (error || !sem) {
            console.error('No active semester found');
            return false;
        }
        activeSemesterId = sem.id;
        activeSemesterName = sem.name;
        
        // Display the semester in the page
        const semesterEl = document.getElementById('filesmanagement-current-semester');
        if (semesterEl) semesterEl.textContent = activeSemesterName;
        
        return true;
    } catch (e) {
        console.error('loadActiveSemester error:', e);
        return false;
    }
}

function setupEventListeners() {
    const searchInput = document.querySelector('.search-input');
    if (searchInput) searchInput.addEventListener('input', applyFileFilters);

    const deptFilter = document.querySelector('.dept-filter');
    if (deptFilter) deptFilter.addEventListener('change', applyFileFilters);

    const catFilter = document.querySelector('.cat-filter');
    if (catFilter) catFilter.addEventListener('change', applyFileFilters);

    const statusFilter = document.querySelector('.status-filter');
    if (statusFilter) statusFilter.addEventListener('change', applyFileFilters);

    const approveBtn = document.getElementById('approveSubmissionBtn');
    const rejectBtn  = document.getElementById('rejectSubmissionBtn');

    if (approveBtn) approveBtn.addEventListener('click', () => handleReviewSubmission('approved'));
    if (rejectBtn)  rejectBtn.addEventListener('click',  () => handleReviewSubmission('rejected'));

    // Cleanup blob URLs when modal closes
    const reviewModal = document.getElementById('reviewModal');
    if (reviewModal) {
        reviewModal.addEventListener('hidden.bs.modal', function() {
            const iframe = document.getElementById('filePreviewIframe');
            if (iframe && iframe._blobUrl) {
                URL.revokeObjectURL(iframe._blobUrl);
                iframe._blobUrl = null;
                iframe.src = '';
            }
        });
    }
}


async function populateDeptFilter() {
    try {
        const { data: depts } = await supabaseClient
            .from('departments')
            .select('id, department_name, department_code')
            .eq('is_active', true)
            .order('department_name');

        if (!depts || depts.length === 0) return;

        const select = document.querySelector('.dept-filter');
        if (!select) return;

        select.innerHTML = '<option value="">All Depts</option>';
        depts.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.department_code?.toLowerCase() || d.id;
            opt.textContent = d.department_code || d.department_name;
            select.appendChild(opt);
        });
    } catch (e) {
        console.warn('Could not load departments for filter:', e);
    }
}

async function populateCatFilter() {
    try {
        const { data: cats } = await supabaseClient
            .from('categories')
            .select('id, name')
            .eq('status', 'active')
            .order('name');

        if (!cats || cats.length === 0) return;

        const select = document.querySelector('.cat-filter');
        if (!select) return;

        select.innerHTML = '<option value="">All Categories</option>';
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name.toLowerCase();
            opt.textContent = c.name;
            select.appendChild(opt);
        });
    } catch (e) {
        console.warn('Could not load categories for filter:', e);
    }
}


async function loadSubmissions() {
    try {
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            showPlaceholderData();
            return;
        }

        console.log('Loading submissions...');
        const { data: submissions, error } = await supabaseClient
            .from('submissions')
            .select(`
                id,
                professor_id,
                requirement_id,
                semester_id,
                status,
                submitted_at,
                reviewed_by,
                reviewed_at,
                remarks,
                updated_at,
                submission_files(
                    id,
                    file_name,
                    file_url,
                    file_size,
                    file_type,
                    uploaded_at
                )
            `)
            .order('submitted_at', { ascending: false });

        if (error) {
            console.error('Error loading submissions:', error);
            showPlaceholderData();
            return;
        }

        allSubmissions = submissions || [];
        // Filter submissions by active semester
        if (activeSemesterId) {
            allSubmissions = allSubmissions.filter(s => s.semester_id === activeSemesterId);
        }
        console.log('✓ Submissions loaded:', allSubmissions.length, 'records');
        if (allSubmissions.length > 0) console.log('Sample submission:', allSubmissions[0]);

        await enrichSubmissionsData();
        updateStatistics();
        renderSubmissions();

    } catch (err) {
        console.error('Error loading submissions:', err);
        showPlaceholderData();
    }
}


async function enrichSubmissionsData() {
    try {
        const { data: professors, error: profError } = await supabaseClient
            .from('professors')
            .select(`
                professor_id,
                first_name,
                last_name,
                middle_name,
                employee_id,
                department_id,
                departments(department_name, department_code)
            `);

        if (profError) console.warn('Professors query error:', profError);

        const professorMap = {};
        if (professors) {
            professors.forEach(prof => {
                professorMap[prof.professor_id] = prof;
            });
            console.log('✓ Professors loaded:', professors.length);
        }

        const { data: requirements, error: reqError } = await supabaseClient
            .from('requirements')
            .select(`
                id,
                name,
                title,
                category_id,
                categories(name)
            `);

        if (reqError) console.warn('Requirements query error:', reqError);

        const requirementMap = {};
        if (requirements) {
            requirements.forEach(req => {
                requirementMap[req.id] = req;
            });
            console.log('✓ Requirements loaded:', requirements.length);
        }

        // Enrich each submission
        allSubmissions = allSubmissions.map(submission => ({
            ...submission,
            _professor:   professorMap[submission.professor_id]   || null,
            _requirement: requirementMap[submission.requirement_id] || null
        }));

    } catch (err) {
        console.warn('Could not enrich submissions:', err);
    }
}


function updateStatistics() {
    const totalFiles   = allSubmissions.length;
    const approvedCount = allSubmissions.filter(s => s.status === 'approved').length;
    const pendingCount  = allSubmissions.filter(s => s.status === 'pending').length;

    // FIX: file_size lives in submission_files[], not on the submission row
    const totalBytes = allSubmissions.reduce((sum, s) => {
        const files = s.submission_files || [];
        return sum + files.reduce((fs, f) => fs + (f.file_size || 0), 0);
    }, 0);
    const totalStorage = (totalBytes / (1024 * 1024)).toFixed(2);

    document.getElementById('totalFilesCount').textContent = totalFiles;
    document.getElementById('totalStorage').textContent    = totalStorage + ' MB';
    document.getElementById('approvedCount').textContent   = approvedCount;
    document.getElementById('pendingCount').textContent    = pendingCount;
}


function renderSubmissions() {
    const tbody = document.getElementById('filesTableBody');

    if (!allSubmissions || allSubmissions.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-state-row">
                <td colspan="8" style="text-align:center;padding:3rem;color:var(--text-muted);">
                    <svg viewBox="0 0 24 24" style="width:48px;height:48px;margin:0 auto 1rem;opacity:0.3;stroke:currentColor;fill:none;stroke-width:1.5;">
                        <path d="M9 12h6m-6 4h6M9 8h6m-6-4h6M3 20h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"/>
                    </svg>
                    <p style="margin:0;font-weight:500;">No submissions found</p>
                    <p style="margin:0.5rem 0 0 0;font-size:0.9rem;color:var(--text-muted);">There are no submitted files to display.</p>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = allSubmissions.map(submission => {
        const professor   = submission._professor   || {};
        const requirement = submission._requirement || {};
        let fileName = 'document.pdf';
        let fileSize = 0;
        if (submission.submission_files && submission.submission_files.length > 0) {
            const file = submission.submission_files[0];
            fileName = file.file_name || fileName;
            fileSize = file.file_size || 0;
        }
        const facultyName  = professor.first_name
            ? `${professor.first_name} ${professor.last_name}`
            : 'Unknown';
        const deptObj      = professor.departments || {};
        const department   = deptObj.department_code || deptObj.department_name || 'N/A';
        const categoryName = requirement.categories?.name || requirement.name || 'Unknown';
        const dateStr = formatDate(submission.submitted_at);
        const sizeStr = formatFileSize(fileSize);

        let statusBadge = '';
        if (submission.status === 'pending') {
            statusBadge = '<span class="badge-status status-pending">Pending</span>';
        } else if (submission.status === 'approved') {
            statusBadge = '<span class="badge-status status-approved">Approved</span>';
        } else if (submission.status === 'rejected') {
            statusBadge = '<span class="badge-status status-rejected">Rejected</span>';
        }

        const deptLower = department.toLowerCase();
        const catLower  = categoryName.toLowerCase();
        const statusLower = (submission.status || '').toLowerCase();

        return `
            <tr class="searchable-row"
                data-dept="${deptLower}"
                data-cat="${catLower}"
                data-status="${statusLower}">
                <td>
                    <div class="file-cell">
                        <div class="file-icon small">
                            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </div>
                        <span>${fileName}</span>
                    </div>
                </td>
                <td>${facultyName}</td>
                <td>${department}</td>
                <td>${categoryName}</td>
                <td>${dateStr}</td>
                <td>${sizeStr}</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="action-buttons">
                        ${submission.status === 'pending' ? `
                            <button class="btn-icon" onclick="showReviewModal('${submission.id}')" title="Review & Approve/Reject">
                                <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                        ` : `
                            <button class="btn-icon" onclick="viewSubmissionDetails('${submission.id}')" title="View Details">
                                <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                        `}
                        <button class="btn-icon btn-delete" onclick="deleteSubmission('${submission.id}')" title="Delete">
                            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}


function applyFileFilters() {
    const dept   = (document.querySelector('.dept-filter')?.value   || '').trim().toLowerCase();
    const cat    = (document.querySelector('.cat-filter')?.value    || '').trim().toLowerCase();
    const status = (document.querySelector('.status-filter')?.value || '').trim().toLowerCase();
    const q      = (document.querySelector('.search-input')?.value  || '').trim().toLowerCase();

    let visibleCount = 0;

    document.querySelectorAll('.searchable-row').forEach(row => {
        const rowDept   = (row.dataset.dept   || '').toLowerCase();
        const rowCat    = (row.dataset.cat    || '').toLowerCase();
        const rowStatus = (row.dataset.status || '').toLowerCase();
        const rowText   = row.textContent.toLowerCase();

        const matchDept   = !dept   || dept === 'all depts'      || rowDept === dept;
        const matchCat    = !cat    || cat === 'all categories'  || rowCat === cat;
        const matchStatus = !status || status === 'all status'   || rowStatus === status;
        const matchQ      = !q      || rowText.includes(q);

        const isVisible = matchDept && matchCat && matchStatus && matchQ;
        row.style.display = isVisible ? '' : 'none';
        
        if (isVisible) visibleCount++;
    });

    const tbody = document.getElementById('filesTableBody');
    if (visibleCount === 0) {
        const emptyRow = tbody.querySelector('.empty-state-row');
        if (!emptyRow) {
            const row = document.createElement('tr');
            row.className = 'empty-state-row';
            row.innerHTML = '<td colspan="8" style="text-align:center;padding:3rem;color:var(--text-muted);"><svg viewBox="0 0 24 24" style="width:48px;height:48px;margin:0 auto 1rem;opacity:0.3;stroke:currentColor;fill:none;stroke-width:1.5;"><path d="M9 12h6m-6 4h6M9 8h6m-6-4h6M3 20h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"/></svg><p style="margin:0;font-weight:500;">No submissions found</p><p style="margin:0.5rem 0 0 0;font-size:0.9rem;">Try adjusting your filters or search terms</p></td>';
            tbody.appendChild(row);
        }
    } else {
        const emptyRow = tbody.querySelector('.empty-state-row');
        if (emptyRow) emptyRow.remove();
    }
}


async function showReviewModal(submissionId) {
    const submission = allSubmissions.find(s => s.id === submissionId);
    if (!submission) return;

    currentSubmissionId = submissionId;

    const professor   = submission._professor   || {};
    const requirement = submission._requirement || {};

    let fileName = 'document.pdf';
    let fileSize = 0;
    let fileUrl = '';
    
    if (submission.submission_files && submission.submission_files.length > 0) {
        const file = submission.submission_files[0];
        fileName = file.file_name || fileName;
        fileSize = file.file_size || 0;
        fileUrl = file.file_url || '';
    }

    // Resolve to signed URL
    if (fileUrl) {
        fileUrl = await resolveFileUrl(fileUrl, fileName);
    }

    // Store current file info for button actions
    currentFileUrl = fileUrl;
    currentFileName = fileName;

    const facultyName  = professor.first_name
        ? `${professor.first_name} ${professor.last_name}`
        : 'Unknown';
    const deptObj      = professor.departments || {};
    const department   = deptObj.department_code || deptObj.department_name || 'N/A';
    const categoryName = requirement.categories?.name || requirement.name || 'Unknown';

    document.getElementById('modalFileName').textContent    = fileName;
    document.getElementById('modalFileCategory').textContent = categoryName;
    document.getElementById('modalUploader').textContent    = facultyName;
    document.getElementById('modalDepartment').textContent  = department;
    document.getElementById('modalUploadDate').textContent  = formatDate(submission.submitted_at);
    document.getElementById('modalSize').textContent        = formatFileSize(fileSize);
    document.getElementById('adminRemarks').value           = submission.remarks || '';

    // Display file preview
    displayFilePreview(fileUrl, fileName);

    // Set up file action buttons
    const viewBtn = document.getElementById('viewFileBtn');
    const downloadBtn = document.getElementById('downloadFileBtn');
    
    if (viewBtn) {
        viewBtn.onclick = () => viewFile(fileUrl, fileName);
    }
    if (downloadBtn) {
        downloadBtn.onclick = () => downloadFile(fileUrl, fileName);
    }

    // Hide approve/reject buttons for already-reviewed submissions
    const approveBtn = document.getElementById('approveSubmissionBtn');
    const rejectBtn  = document.getElementById('rejectSubmissionBtn');
    const isPending  = submission.status === 'pending';
    if (approveBtn) approveBtn.style.display = isPending ? '' : 'none';
    if (rejectBtn)  rejectBtn.style.display  = isPending ? '' : 'none';

    const modal = new bootstrap.Modal(document.getElementById('reviewModal'));
    modal.show();
}

function viewSubmissionDetails(submissionId) {
    showReviewModal(submissionId);
}


async function handleReviewSubmission(action) {
    if (!currentSubmissionId) return;

    const remarks = document.getElementById('adminRemarks').value.trim();

    if (action === 'rejected' && !remarks) {
        alert('Please provide remarks for rejection.');
        return;
    }

    const approveBtn = document.getElementById('approveSubmissionBtn');
    const rejectBtn  = document.getElementById('rejectSubmissionBtn');
    
    try {
        // Disable buttons and show loading state
        if (approveBtn) approveBtn.disabled = true;
        if (rejectBtn) rejectBtn.disabled = true;

        const user = getCurrentUser();

        const updateData = {
            status:      action,
            reviewed_by: user?.id || null,
            reviewed_at: new Date().toISOString(),
            remarks:     remarks
        };

        console.log('Updating submission', currentSubmissionId, 'with:', updateData);

        const { error } = await supabaseClient
            .from('submissions')
            .update(updateData)
            .eq('id', currentSubmissionId);

        if (error) throw error;
        console.log('✓ Submission status updated');

        try {
            const submission = allSubmissions.find(s => s.id === currentSubmissionId);
            const fileName   = submission?.submission_files?.[0]?.file_name || 'document.pdf';

            await supabaseClient
                .from('audit_logs')
                .insert({
                    user_id:    user?.id || null,
                    action:     action === 'approved' ? 'approve' : 'reject',
                    file_name:  fileName,
                    comments:   remarks || (action === 'approved' ? 'Approved' : 'Rejected'),
                    created_at: new Date().toISOString()
                });
            console.log('✓ Audit log created');
        } catch (auditErr) {
            console.warn('Could not create audit log:', auditErr);
        }

        alert(`Submission ${action} successfully!`);

        const modalEl = document.getElementById('reviewModal');
        const modal   = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        await loadSubmissions();

    } catch (err) {
        console.error(`Error ${action} submission:`, err);
        alert(`Failed to ${action} submission: ${err.message}`);
    } finally {
        // Re-enable buttons
        if (approveBtn) approveBtn.disabled = false;
        if (rejectBtn) rejectBtn.disabled = false;
    }
}


async function deleteSubmission(submissionId) {
    if (!confirm('Are you sure you want to delete this submission? This action cannot be undone.')) return;

    try {
        const { error } = await supabaseClient
            .from('submissions')
            .delete()
            .eq('id', submissionId);

        if (error) throw error;

        alert('Submission deleted successfully.');
        await loadSubmissions();

    } catch (err) {
        console.error('Error deleting submission:', err);
        alert('Failed to delete submission: ' + err.message);
    }
}

function formatFileSize(bytes) {
    if (!bytes) return 'N/A';
    if (bytes < 1024)            return bytes + ' B';
    if (bytes < 1024 * 1024)     return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
    } catch (e) {
        return 'N/A';
    }
}

function showPlaceholderData() {
    updateStatistics();
    renderSubmissions();
}

function displayFilePreview(fileUrl, fileName) {
    const container = document.getElementById('filePreviewContainer');
    const iframe = document.getElementById('filePreviewIframe');
    const loading = document.getElementById('previewLoading');
    const error = document.getElementById('previewError');
    
    if (!container || !iframe) return;
    
    if (!fileUrl) {
        iframe.style.display = 'none';
        loading.style.display = 'none';
        error.style.display = 'flex';
        return;
    }
    iframe.style.display = 'none';
    loading.style.display = 'flex';
    error.style.display = 'none';
    fetchAndPreviewFile(fileUrl, iframe, loading, error);
}

async function fetchAndPreviewFile(fileUrl, iframe, loading, error) {
    try {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        iframe._blobUrl = blobUrl;

        iframe.onload = function() {
            loading.style.display = 'none';
            iframe.style.display = 'block';
        };
        
        iframe.onerror = function() {
            loading.style.display = 'none';
            error.style.display = 'flex';
            iframe.style.display = 'none';
        };

        iframe.src = blobUrl;

    } catch (err) {
        console.error('Error loading file preview:', err);
        loading.style.display = 'none';
        error.style.display = 'flex';
        iframe.style.display = 'none';
    }
}

function viewFile(fileUrl, fileName) {
    if (!fileUrl) {
        alert('File URL not available.');
        return;
    }
    
    const ext = fileName.split('.').pop().toLowerCase();
    
    if (['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        window.open(fileUrl, '_blank');
    } else {
        window.open(fileUrl, '_blank');
    }
}

function downloadFile(fileUrl, fileName) {
    if (!fileUrl) {
        alert('File URL not available.');
        return;
    }
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('✓ Download initiated for:', fileName);
}