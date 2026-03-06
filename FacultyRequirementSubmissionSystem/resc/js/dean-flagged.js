let flaggedSubmissions = [];
let currentSubmissionId = null;

document.addEventListener('DOMContentLoaded', function () {
    if (!isDean()) {
        window.location.href = '../../auth/login.html';
        return;
    }

    loadFlaggedSubmissions();
    setupEventListeners();
    initializeModal();
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
            .select(`*, requirements(name, description), semesters(name), submission_files(*)`)
            .eq('flagged_by_dean', true)
            .order('submitted_at', { ascending: false });

        if (error) {
            console.error('Error loading flagged submissions:', error);
            showPlaceholderData();
            return;
        }

        // Fetch professors separately (no FK constraint defined in DB)
        const professorIds = [...new Set((submissions || []).map(s => s.professor_id).filter(Boolean))];
        let professorsMap = {};
        if (professorIds.length > 0) {
            const { data: professorsData } = await supabaseClient
                .from('professors')
                .select('professor_id, first_name, middle_name, last_name, department')
                .in('professor_id', professorIds);
            (professorsData || []).forEach(p => { professorsMap[p.professor_id] = p; });
        }
        submissions?.forEach(s => { s.professors = professorsMap[s.professor_id] || null; });

        // Generate signed URLs for submission files
        if (submissions && submissions.length > 0) {
            for (let submission of submissions) {
                if (submission.submission_files && submission.submission_files.length > 0) {
                    for (let file of submission.submission_files) {
                        const rawPath = file.file_path || file.file_url;
                        if (rawPath) {
                            let storagePath = rawPath;
                            const marker = '/object/public/faculty-submissions/';
                            if (rawPath.includes(marker)) {
                                storagePath = decodeURIComponent(rawPath.split(marker)[1]);
                            }
                            const { data: signedUrlData, error: signedUrlError } = await supabaseClient.storage
                                .from('faculty-submissions')
                                .createSignedUrl(storagePath, 3600);
                            if (signedUrlError) {
                                console.error('Signed URL error for', storagePath, signedUrlError);
                            } else if (signedUrlData?.signedUrl) {
                                file.signed_url = signedUrlData.signedUrl;
                                submission.signed_url = signedUrlData.signedUrl; // Also store at submission level
                            }
                        }
                    }
                }
            }
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
        const category = submission.requirements;
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
                        <button class="btn-icon" onclick="viewFilePreview('${submission.id}')" title="Preview File">
                            <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                        <button class="btn-icon" onclick="viewFlagDetails('${submission.id}')" title="View Details">
                            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
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
    const category = submission.requirements;
    
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
    if (!submission) {
        alert('Submission not found');
        return;
    }
    
    const fileUrl = submission.signed_url || submission.submission_files?.[0]?.signed_url;
    const fileName = submission.submission_files?.[0]?.file_name || submission.file_name || 'document.pdf';
    
    if (fileUrl) {
        viewFile(fileUrl, fileName);
    } else {
        alert('File URL not available');
    }
}

function viewFilePreview(submissionId) {
    const submission = flaggedSubmissions.find(s => s.id === submissionId);
    if (!submission) {
        alert('Submission not found');
        return;
    }
    
    const fileUrl = submission.signed_url || submission.submission_files?.[0]?.signed_url;
    const fileName = submission.submission_files?.[0]?.file_name || submission.file_name || 'document.pdf';
    
    if (fileUrl) {
        viewFile(fileUrl, fileName);
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
        const category = submission.requirements;
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

function initializeModal() {
    const modal = document.getElementById('file-preview-modal');
    const closeBtn = document.getElementById('close-preview-modal');
    const overlay = document.querySelector('.preview-modal-overlay');
    
    if (!modal) return;
    
    closeBtn?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', closeModal);
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
    
    document.getElementById('preview-download-instead')?.addEventListener('click', function() {
        const iframe = document.getElementById('preview-iframe');
        const fileName = document.getElementById('preview-file-name')?.textContent || 'file';
        if (iframe.src) {
            downloadFile(iframe.src, fileName);
            closeModal();
        }
    });
}

async function viewFile(fileUrl, fileName = 'File Preview') {
    console.log('viewFile called with:', fileUrl);
    if (!fileUrl) {
        console.error('No file URL provided');
        alert('Unable to open file: URL is missing');
        return;
    }

    const modal = document.getElementById('file-preview-modal');
    const iframe = document.getElementById('preview-iframe');
    const loading = document.getElementById('preview-loading');
    const error = document.getElementById('preview-error');
    const titleElement = document.getElementById('preview-file-name');

    if (!modal || !iframe) {
        console.error('Modal elements not found');
        alert('Preview not available');
        return;
    }

    if (titleElement) titleElement.textContent = fileName;

    modal.classList.add('active');
    loading.style.display = 'block';
    error.style.display = 'none';
    iframe.style.display = 'none';
    document.body.style.overflow = 'hidden';

    if (iframe._blobUrl) {
        URL.revokeObjectURL(iframe._blobUrl);
        iframe._blobUrl = null;
    }

    try {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        iframe._blobUrl = blobUrl;

        iframe.onload = function() {
            loading.style.display = 'none';
            iframe.style.display = 'block';
        };
        iframe.onerror = function() {
            loading.style.display = 'none';
            error.style.display = 'block';
        };

        iframe.src = blobUrl;

    } catch (err) {
        console.error('Error fetching file for preview:', err);
        loading.style.display = 'none';
        error.style.display = 'block';
    }
}

function closeModal() {
    const modal = document.getElementById('file-preview-modal');
    const iframe = document.getElementById('preview-iframe');

    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';

        setTimeout(function() {
            if (iframe) {
                if (iframe._blobUrl) {
                    URL.revokeObjectURL(iframe._blobUrl);
                    iframe._blobUrl = null;
                }
                iframe.src = '';
            }
        }, 300);
    }
}

function downloadFile(fileUrl, fileName) {
    console.log('downloadFile called with:', fileUrl, fileName);
    if (!fileUrl || !fileName) {
        console.error('Missing file URL or name');
        alert('Unable to download file: Missing information');
        return;
    }
    try {
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = fileName;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        console.log('Download initiated successfully');
    } catch (error) {
        console.error('Error downloading file:', error);
        alert('Error downloading file: ' + error.message);
    }
}