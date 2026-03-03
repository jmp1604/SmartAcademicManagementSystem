let flaggedSubmissions = [];
let currentSubmissionId = null;

document.addEventListener('DOMContentLoaded', function () {
    if (!isDean()) {
        window.location.href = '../../auth/login.html';
        return;
    }

    loadFlaggedSubmissions();
    setupEventListeners();
});

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const departmentFilter = document.getElementById('departmentFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterFlaggedSubmissions);
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', filterFlaggedSubmissions);
    }
    if (departmentFilter) {
        departmentFilter.addEventListener('change', filterFlaggedSubmissions);
    }

    const viewFileBtn = document.getElementById('viewFileBtn');
    const confirmUnflagBtn = document.getElementById('confirmUnflagBtn');
    
    if (viewFileBtn) {
        viewFileBtn.addEventListener('click', handleViewFile);
    }
    if (confirmUnflagBtn) {
        confirmUnflagBtn.addEventListener('click', handleUnflagSubmission);
    }
}

async function loadFlaggedSubmissions() {
    try {
        const user = JSON.parse(sessionStorage.getItem('user'));
        
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            showPlaceholderData();
            return;
        }

        // Load submissions flagged by this dean
        const { data: submissions, error } = await supabaseClient
            .from('submissions')
            .select(`
                *,
                professors:professor_id(first_name, middle_name, last_name, department),
                categories:requirement_id(name, description),
                semesters:semester_id(name)
            `)
            .eq('flagged_by_dean', true)
            .order('created_at', { ascending: false });

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
    const totalFlagged = flaggedSubmissions.length;
    const underReview = flaggedSubmissions.filter(s => s.status === 'pending').length;
    const resolved = flaggedSubmissions.filter(s => s.status === 'approved' || s.status === 'rejected').length;
    
    // Count flags from this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const thisWeek = flaggedSubmissions.filter(s => {
        const flagDate = new Date(s.updated_at);
        return flagDate >= weekAgo;
    }).length;

    document.getElementById('totalFlaggedCount').textContent = totalFlagged;
    document.getElementById('underReviewCount').textContent = underReview;
    document.getElementById('resolvedCount').textContent = resolved;
    document.getElementById('thisWeekCount').textContent = thisWeek;
}

function renderFlaggedSubmissions() {
    const tbody = document.getElementById('flaggedTableBody');
    
    if (!flaggedSubmissions || flaggedSubmissions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    <svg viewBox="0 0 24 24" style="width: 48px; height: 48px; margin-bottom: 1rem; opacity: 0.3;"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                    <p>No flagged submissions found</p>
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
        const flagReason = submission.flag_reason || 'No reason provided';
        
        let statusBadge = '';
        if (submission.status === 'pending') {
            statusBadge = '<span class="badge-status status-pending">Under Review</span>';
        } else if (submission.status === 'approved') {
            statusBadge = '<span class="badge-status status-approved">Resolved - Approved</span>';
        } else if (submission.status === 'rejected') {
            statusBadge = '<span class="badge-status status-rejected">Resolved - Rejected</span>';
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
                <td>${flagDate}</td>
                <td><span class="flag-reason-preview" title="${flagReason}">${truncateText(flagReason, 30)}</span></td>
                <td>${statusBadge}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon" onclick="viewFlagDetails('${submission.id}')" title="View Details">
                            <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                        ${submission.status === 'pending' ? `
                        <button class="btn-icon warning" onclick="showUnflagModal('${submission.id}')" title="Remove Flag">
                            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function viewFlagDetails(submissionId) {
    const submission = flaggedSubmissions.find(s => s.id === submissionId);
    if (!submission) return;

    currentSubmissionId = submissionId;
    
    const faculty = submission.professors;
    const category = submission.categories;
    
    document.getElementById('modalFileName').textContent = submission.file_name || 'document.pdf';
    document.getElementById('modalFileCategory').textContent = category?.name || 'Unknown Category';
    document.getElementById('modalUploader').textContent = faculty ? `${faculty.first_name} ${faculty.last_name}` : 'Unknown';
    document.getElementById('modalDepartment').textContent = faculty?.department || 'N/A';
    document.getElementById('modalFlagDate').textContent = formatDate(submission.updated_at);
    document.getElementById('modalStatus').textContent = getStatusText(submission.status);
    document.getElementById('modalFlagReason').textContent = submission.flag_reason || 'No reason provided';
    document.getElementById('modalDeanNotes').textContent = submission.dean_notes || 'No additional notes';

    const modal = new bootstrap.Modal(document.getElementById('flagDetailsModal'));
    modal.show();
}

function showUnflagModal(submissionId) {
    currentSubmissionId = submissionId;
    const modal = new bootstrap.Modal(document.getElementById('unflagModal'));
    modal.show();
}

async function handleUnflagSubmission() {
    if (!currentSubmissionId) return;

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
        bootstrap.Modal.getInstance(document.getElementById('unflagModal')).hide();
        loadFlaggedSubmissions();
        
    } catch (error) {
        console.error('Error removing flag:', error);
        alert('Failed to remove flag: ' + error.message);
    }
}

function handleViewFile() {
    const submission = flaggedSubmissions.find(s => s.id === currentSubmissionId);
    if (submission && submission.file_url) {
        window.open(submission.file_url, '_blank');
    } else {
        alert('File URL not available');
    }
}

function filterFlaggedSubmissions() {
    const searchText = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const departmentFilter = document.getElementById('departmentFilter').value;

    const filtered = flaggedSubmissions.filter(submission => {
        const faculty = submission.professors;
        const category = submission.categories;
        const facultyName = faculty ? `${faculty.first_name} ${faculty.last_name}`.toLowerCase() : '';
        const fileName = (submission.file_name || '').toLowerCase();
        const categoryName = (category?.name || '').toLowerCase();
        
        const matchesSearch = fileName.includes(searchText) || facultyName.includes(searchText) || categoryName.includes(searchText);
        const matchesStatus = !statusFilter || submission.status === statusFilter;
        const matchesDepartment = !departmentFilter || faculty?.department === departmentFilter;

        return matchesSearch && matchesStatus && matchesDepartment;
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

function getStatusText(status) {
    switch(status) {
        case 'pending': return 'Under Review';
        case 'approved': return 'Resolved - Approved';
        case 'rejected': return 'Resolved - Rejected';
        default: return status;
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function showPlaceholderData() {
    flaggedSubmissions = [];
    updateStatistics();
    renderFlaggedSubmissions();
}
