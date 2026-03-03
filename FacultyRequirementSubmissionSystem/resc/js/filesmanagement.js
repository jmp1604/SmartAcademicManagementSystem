let allSubmissions = [];
let currentSubmissionId = null;

document.addEventListener('DOMContentLoaded', function () {
    if (!isAdmin()) {
        window.location.href = '../../auth/login.html';
        return;
    }

    loadSubmissions();
    setupEventListeners();
});

function setupEventListeners() {
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('input', applyFileFilters);
    }

    const deptFilter = document.querySelector('.dept-filter');
    if (deptFilter) {
        deptFilter.addEventListener('change', applyFileFilters);
    }

    const catFilter = document.querySelector('.cat-filter');
    if (catFilter) {
        catFilter.addEventListener('change', applyFileFilters);
    }

    const statusFilter = document.querySelector('.status-filter');
    if (statusFilter) {
        statusFilter.addEventListener('change', applyFileFilters);
    }

    const approveBtn = document.getElementById('approveSubmissionBtn');
    const rejectBtn = document.getElementById('rejectSubmissionBtn');
    
    if (approveBtn) {
        approveBtn.addEventListener('click', () => handleReviewSubmission('approved'));
    }
    if (rejectBtn) {
        rejectBtn.addEventListener('click', () => handleReviewSubmission('rejected'));
    }
}

async function loadSubmissions() {
    try {
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            showPlaceholderData();
            return;
        }

        // Load all submissions from all faculty
        const { data: submissions, error } = await supabaseClient
            .from('submissions')
            .select(`
                *,
                professors:professor_id(first_name, middle_name, last_name, department, employee_id),
                categories:requirement_id(name, description)
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading submissions:', error);
            showPlaceholderData();
            return;
        }

        allSubmissions = submissions || [];
        updateStatistics();
        renderSubmissions();
        
    } catch (error) {
        console.error('Error loading submissions:', error);
        showPlaceholderData();
    }
}

function updateStatistics() {
    const totalFiles = allSubmissions.length;
    const approvedCount = allSubmissions.filter(s => s.status === 'approved').length;
    const pendingCount = allSubmissions.filter(s => s.status === 'pending').length;
    const totalBytes = allSubmissions.reduce((sum, s) => sum + (s.file_size || 0), 0);
    const totalStorage = (totalBytes / (1024 * 1024)).toFixed(2);

    document.getElementById('totalFilesCount').textContent = totalFiles;
    document.getElementById('totalStorage').textContent = totalStorage + ' MB';
    document.getElementById('approvedCount').textContent = approvedCount;
    document.getElementById('pendingCount').textContent = pendingCount;
}

function renderSubmissions() {
    const tbody = document.getElementById('filesTableBody');
    
    if (!allSubmissions || allSubmissions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    <p>No submissions found</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = allSubmissions.map(submission => {
        const faculty = submission.professors;
        const category = submission.categories;
        const facultyName = faculty ? `${faculty.first_name} ${faculty.last_name}` : 'Unknown';
        const department = faculty?.department || 'N/A';
        const categoryName = category?.name || 'Unknown';
        const dateStr = formatDate(submission.created_at);
        const sizeStr = formatFileSize(submission.file_size);
        
        let statusBadge = '';
        if (submission.status === 'pending') {
            statusBadge = '<span class="badge-status status-pending">Pending</span>';
        } else if (submission.status === 'approved') {
            statusBadge = '<span class="badge-status status-approved">Approved</span>';
        } else if (submission.status === 'rejected') {
            statusBadge = '<span class="badge-status status-rejected">Rejected</span>';
        }

        const flagBadge = submission.flagged_by_dean 
            ? '<span style="color: #f59e0b; font-size: 1.2rem; margin-left: 0.5rem;" title="Flagged by Dean">⚠️</span>' 
            : '';

        return `
            <tr class="searchable-row" 
                data-dept="${department.toLowerCase()}" 
                data-cat="${categoryName.toLowerCase()}" 
                data-status="${submission.status.toLowerCase()}">
                <td>
                    <div class="file-cell">
                        <div class="file-icon small">
                            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </div>
                        <span>${submission.file_name || 'document.pdf'}${flagBadge}</span>
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
    const dept   = (document.querySelector('.dept-filter')?.value   || '').toLowerCase();
    const cat    = (document.querySelector('.cat-filter')?.value    || '').toLowerCase();
    const status = (document.querySelector('.status-filter')?.value || '').toLowerCase();
    const q      = (document.querySelector('.search-input')?.value  || '').toLowerCase();

    document.querySelectorAll('.searchable-row').forEach(function (row) {
        const matchDept   = !dept   || dept   === 'all depts'       || (row.dataset.dept   || '').toLowerCase() === dept;
        const matchCat    = !cat    || cat    === 'all categories'   || (row.dataset.cat    || '').toLowerCase() === cat;
        const matchStatus = !status || status === 'all status'       || (row.dataset.status || '').toLowerCase() === status;
        const matchQ      = !q      || row.textContent.toLowerCase().includes(q);
        row.style.display = (matchDept && matchCat && matchStatus && matchQ) ? '' : 'none';
    });
}

function showReviewModal(submissionId) {
    const submission = allSubmissions.find(s => s.id === submissionId);
    if (!submission) return;

    currentSubmissionId = submissionId;
    
    const faculty = submission.professors;
    const category = submission.categories;
    
    document.getElementById('modalFileName').textContent = submission.file_name || 'document.pdf';
    document.getElementById('modalFileCategory').textContent = category?.name || 'Unknown Category';
    document.getElementById('modalUploader').textContent = faculty ? `${faculty.first_name} ${faculty.last_name}` : 'Unknown';
    document.getElementById('modalDepartment').textContent = faculty?.department || 'N/A';
    document.getElementById('modalUploadDate').textContent = formatDate(submission.created_at);
    document.getElementById('modalSize').textContent = formatFileSize(submission.file_size);
    
    // Show flag info if flagged
    const flagInfo = document.getElementById('flagInfo');
    if (submission.flagged_by_dean) {
        flagInfo.style.display = 'block';
        document.getElementById('modalFlagReason').textContent = submission.flag_reason || 'No reason provided';
        document.getElementById('modalDeanNotes').textContent = submission.dean_notes || 'No notes';
    } else {
        flagInfo.style.display = 'none';
    }
    
    document.getElementById('adminRemarks').value = '';

    const modal = new bootstrap.Modal(document.getElementById('reviewModal'));
    modal.show();
}

function viewSubmissionDetails(submissionId) {
    // Similar to showReviewModal but without approve/reject buttons
    showReviewModal(submissionId);
}

async function handleReviewSubmission(action) {
    if (!currentSubmissionId) return;

    const remarks = document.getElementById('adminRemarks').value.trim();
    
    if (action === 'rejected' && !remarks) {
        alert('Please provide remarks for rejection');
        return;
    }

    try {
        const user = getCurrentUser();
        
        const { error } = await supabaseClient
            .from('submissions')
            .update({
                status: action,
                reviewed_by: user.id,
                reviewed_at: new Date().toISOString(),
                remarks: remarks,
                flagged_by_dean: false  // Clear flag after review
            })
            .eq('id', currentSubmissionId);

        if (error) throw error;

        // Log the action
        await supabaseClient
            .from('audit_logs')
            .insert({
                user_id: user.id,
                action: action === 'approved' ? 'approve' : 'reject',
                file_name: allSubmissions.find(s => s.id === currentSubmissionId)?.file_name,
                comments: remarks || (action === 'approved' ? 'Approved' : 'Rejected')
            });

        alert(`Submission ${action} successfully`);
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('reviewModal'));
        modal.hide();
        
        // Reload submissions
        loadSubmissions();
        
    } catch (error) {
        console.error(`Error ${action} submission:`, error);
        alert(`Failed to ${action} submission: ` + error.message);
    }
}

async function deleteSubmission(submissionId) {
    if (!confirm('Are you sure you want to delete this submission? This action cannot be undone.')) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('submissions')
            .delete()
            .eq('id', submissionId);

        if (error) throw error;

        alert('Submission deleted successfully');
        loadSubmissions();
        
    } catch (error) {
        console.error('Error deleting submission:', error);
        alert('Failed to delete submission: ' + error.message);
    }
}

function formatFileSize(bytes) {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function showPlaceholderData() {
    // Show empty state
    updateStatistics();
    renderSubmissions();
}
