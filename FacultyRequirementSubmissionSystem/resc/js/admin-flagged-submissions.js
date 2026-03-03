let flaggedSubmissions = [];
let currentSubmissionId = null;

document.addEventListener('DOMContentLoaded', function () {
    if (!isAdmin()) {
        window.location.href = '../../auth/login.html';
        return;
    }

    loadFlaggedSubmissions();
    loadDeansList();
    setupEventListeners();
});

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const departmentFilter = document.getElementById('departmentFilter');
    const deanFilter = document.getElementById('deanFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterFlaggedSubmissions);
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', filterFlaggedSubmissions);
    }
    if (departmentFilter) {
        departmentFilter.addEventListener('change', filterFlaggedSubmissions);
    }
    if (deanFilter) {
        deanFilter.addEventListener('change', filterFlaggedSubmissions);
    }

    const approveFlaggedBtn = document.getElementById('approveFlaggedBtn');
    const rejectFlaggedBtn = document.getElementById('rejectFlaggedBtn');
    const unflagBtn = document.getElementById('unflagBtn');
    
    if (approveFlaggedBtn) {
        approveFlaggedBtn.addEventListener('click', () => handleReviewFlagged('approved'));
    }
    if (rejectFlaggedBtn) {
        rejectFlaggedBtn.addEventListener('click', () => handleReviewFlagged('rejected'));
    }
    if (unflagBtn) {
        unflagBtn.addEventListener('click', handleUnflagOnly);
    }
}

async function loadDeansList() {
    try {
        if (!supabaseClient) return;

        const { data: deans, error } = await supabaseClient
            .from('professors')
            .select('professor_id, first_name, last_name, department')
            .eq('role', 'dean')
            .order('last_name');

        if (error) {
            console.error('Error loading deans:', error);
            return;
        }

        const deanFilter = document.getElementById('deanFilter');
        if (deanFilter && deans) {
            deans.forEach(dean => {
                const option = document.createElement('option');
                option.value = dean.professor_id;
                option.textContent = `${dean.first_name} ${dean.last_name} (${dean.department})`;
                deanFilter.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading deans list:', error);
    }
}

async function loadFlaggedSubmissions() {
    try {
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            showPlaceholderData();
            return;
        }

        // Load all submissions flagged by any dean
        const { data: submissions, error } = await supabaseClient
            .from('submissions')
            .select(`
                *,
                professors:professor_id(first_name, middle_name, last_name, department, employee_id),
                categories:requirement_id(name, description),
                semesters:semester_id(name),
                admins:reviewed_by(admin_name)
            `)
            .eq('flagged_by_dean', true)
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Error loading flagged submissions:', error);
            showPlaceholderData();
            return;
        }

        flaggedSubmissions = submissions || [];
        updateStatistics();
        renderFlaggedSubmissions();
        
    } catch (error) {
        console.error('Error loading flagged submissions:', error);
        showPlaceholderData();
    }
}

function updateStatistics() {
    const pendingFlagged = flaggedSubmissions.filter(s => s.status === 'pending').length;
    const approvedFlagged = flaggedSubmissions.filter(s => s.status === 'approved').length;
    const rejectedFlagged = flaggedSubmissions.filter(s => s.status === 'rejected').length;
    
    // Count reviewed today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reviewedToday = flaggedSubmissions.filter(s => {
        if (!s.reviewed_at) return false;
        const reviewDate = new Date(s.reviewed_at);
        reviewDate.setHours(0, 0, 0, 0);
        return reviewDate.getTime() === today.getTime();
    }).length;

    document.getElementById('pendingFlaggedCount').textContent = pendingFlagged;
    document.getElementById('reviewedTodayCount').textContent = reviewedToday;
    document.getElementById('approvedFlaggedCount').textContent = approvedFlagged;
    document.getElementById('rejectedFlaggedCount').textContent = rejectedFlagged;
}

function renderFlaggedSubmissions() {
    const tbody = document.getElementById('flaggedTableBody');
    
    if (!flaggedSubmissions || flaggedSubmissions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    <svg viewBox="0 0 24 24" style="width: 48px; height: 48px; margin-bottom: 1rem; opacity: 0.3;"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                    <p>No dean-flagged submissions found</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = flaggedSubmissions.map(submission => {
        const faculty = submission.professors;
        const category = submission.categories;
        const facultyName = faculty ? `${faculty.first_name} ${faculty.last_name}` : 'Unknown';
        const department = faculty?.department || 'N/A';
        const categoryName = category?.name || 'Unknown';
        const flagDate = formatDate(submission.updated_at);
        
        // For now, we'll show "Dean" as flagged by since we don't have that specific field
        const flaggedBy = 'Dean'; // TODO: Add flagged_by field to track which dean flagged it
        
        let statusBadge = '';
        if (submission.status === 'pending') {
            statusBadge = '<span class="badge-status status-pending">Pending Review</span>';
        } else if (submission.status === 'approved') {
            statusBadge = '<span class="badge-status status-approved">Approved</span>';
        } else if (submission.status === 'rejected') {
            statusBadge = '<span class="badge-status status-rejected">Rejected</span>';
        }

        return `
            <tr>
                <td>
                    <div class="file-cell">
                        <div class="file-icon small">
                            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </div>
                        <span>${submission.file_name || 'document.pdf'}</span>
                    </div>
                </td>
                <td>${facultyName}</td>
                <td>${department}</td>
                <td>${categoryName}</td>
                <td>${flaggedBy}</td>
                <td>${flagDate}</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon" onclick="reviewFlaggedSubmission('${submission.id}')" title="Review">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function reviewFlaggedSubmission(submissionId) {
    const submission = flaggedSubmissions.find(s => s.id === submissionId);
    if (!submission) return;

    currentSubmissionId = submissionId;
    
    const faculty = submission.professors;
    const category = submission.categories;
    
    document.getElementById('modalFileName').textContent = submission.file_name || 'document.pdf';
    document.getElementById('modalFileCategory').textContent = category?.name || 'Unknown Category';
    document.getElementById('modalUploader').textContent = faculty ? `${faculty.first_name} ${faculty.last_name}` : 'Unknown';
    document.getElementById('modalDepartment').textContent = faculty?.department || 'N/A';
    document.getElementById('modalUploadDate').textContent = formatDate(submission.submitted_at || submission.created_at);
    document.getElementById('modalSize').textContent = formatFileSize(submission.file_size);
    document.getElementById('modalFlaggedBy').textContent = 'Dean'; // TODO: Show actual dean name
    document.getElementById('modalFlagDate').textContent = formatDate(submission.updated_at);
    document.getElementById('modalFlagReason').textContent = submission.flag_reason || 'No reason provided';
    document.getElementById('modalDeanNotes').textContent = submission.dean_notes || 'No additional notes';
    document.getElementById('adminRemarks').value = '';

    const modal = new bootstrap.Modal(document.getElementById('reviewFlaggedModal'));
    modal.show();
}

async function handleReviewFlagged(action) {
    if (!currentSubmissionId) return;

    const remarks = document.getElementById('adminRemarks').value.trim();
    
    if (!remarks && action === 'rejected') {
        alert('Please provide remarks for rejection');
        return;
    }

    try {
        const user = JSON.parse(sessionStorage.getItem('user'));
        
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

        alert(`Submission ${action} successfully`);
        bootstrap.Modal.getInstance(document.getElementById('reviewFlaggedModal')).hide();
        loadFlaggedSubmissions();
        
    } catch (error) {
        console.error(`Error ${action} submission:`, error);
        alert(`Failed to ${action} submission: ` + error.message);
    }
}

async function handleUnflagOnly() {
    if (!currentSubmissionId) return;

    if (!confirm('Remove flag without changing submission status?')) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('submissions')
            .update({
                flagged_by_dean: false,
                flag_reason: null,
                dean_notes: null
            })
            .eq('id', currentSubmissionId);

        if (error) throw error;

        alert('Flag removed successfully');
        bootstrap.Modal.getInstance(document.getElementById('reviewFlaggedModal')).hide();
        loadFlaggedSubmissions();
        
    } catch (error) {
        console.error('Error removing flag:', error);
        alert('Failed to remove flag: ' + error.message);
    }
}

function filterFlaggedSubmissions() {
    const searchText = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const departmentFilter = document.getElementById('departmentFilter').value;
    const deanFilter = document.getElementById('deanFilter').value;

    const filtered = flaggedSubmissions.filter(submission => {
        const faculty = submission.professors;
        const category = submission.categories;
        const facultyName = faculty ? `${faculty.first_name} ${faculty.last_name}`.toLowerCase() : '';
        const fileName = (submission.file_name || '').toLowerCase();
        const categoryName = (category?.name || '').toLowerCase();
        
        const matchesSearch = fileName.includes(searchText) || facultyName.includes(searchText) || categoryName.includes(searchText);
        const matchesStatus = !statusFilter || submission.status === statusFilter;
        const matchesDepartment = !departmentFilter || faculty?.department === departmentFilter;
        // TODO: Add dean filter matching when flagged_by field is added
        const matchesDean = !deanFilter; // Placeholder for now

        return matchesSearch && matchesStatus && matchesDepartment && matchesDean;
    });

    renderFilteredSubmissions(filtered);
}

function renderFilteredSubmissions(filtered) {
    const tbody = document.getElementById('flaggedTableBody');
    
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    <p>No matching flagged submissions found</p>
                </td>
            </tr>
        `;
        return;
    }

    // Temporarily replace flaggedSubmissions for rendering
    const temp = flaggedSubmissions;
    flaggedSubmissions = filtered;
    renderFlaggedSubmissions();
    flaggedSubmissions = temp;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatFileSize(bytes) {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function showPlaceholderData() {
    flaggedSubmissions = [];
    updateStatistics();
    renderFlaggedSubmissions();
}
