let activeSemesterId = null;

document.addEventListener('DOMContentLoaded', async function () {
    const searchInput    = document.querySelector('.files-search');
    const catFilter      = document.querySelector('.cat-filter');
    const statusFilter   = document.querySelector('.status-filter');
    const semesterFilter = document.querySelector('.semester-filter');
    await loadActiveSemester();
    await loadMyFiles();
    initializeModal();
    
    document.addEventListener('click', function(e) {
        const viewBtn = e.target.closest('.view-btn');
        const downloadBtn = e.target.closest('.download-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        const editBtn = e.target.closest('.edit-btn');
        
        if (viewBtn) {
            console.log('View button clicked');
            const fileUrl = viewBtn.dataset.fileUrl;
            const fileName = viewBtn.dataset.fileName || 'File Preview';
            console.log('File URL from dataset:', fileUrl);
            if (fileUrl) viewFile(fileUrl, fileName);
            else console.error('No fileUrl in dataset');
        } else if (downloadBtn) {
            console.log('Download button clicked');
            const fileUrl = downloadBtn.dataset.fileUrl;
            const fileName = downloadBtn.dataset.fileName;
            if (fileUrl && fileName) downloadFile(fileUrl, fileName);
        } else if (editBtn) {
            console.log('Edit button clicked');
            const submissionId = editBtn.dataset.submissionId;
            if (submissionId) editSubmission(submissionId);
        } else if (deleteBtn) {
            console.log('Delete button clicked');
            const submissionId = deleteBtn.dataset.submissionId;
            if (submissionId) deleteSubmission(submissionId);
        }
    });
    
    function applyFilters() {
        const q       = (searchInput?.value || '').toLowerCase();
        const cat     = (catFilter?.value    || '').toLowerCase();
        const status  = (statusFilter?.value || '').toLowerCase();
        const sem     = (semesterFilter?.value || '').toLowerCase();

        document.querySelectorAll('#files-grid tr[data-cat]').forEach(function (row) {
            const matchQ       = !q       || row.dataset.name?.toLowerCase().includes(q);
            const matchCat     = !cat     || cat === 'all categories' || row.dataset.cat?.toLowerCase() === cat;
            const matchStatus  = !status  || status === 'all status'  || row.dataset.status?.toLowerCase() === status;
            const matchSem     = !sem     || sem === 'all semesters' || row.dataset.semester?.toLowerCase() === sem;
            row.style.display = (matchQ && matchCat && matchStatus && matchSem) ? '' : 'none';
        });
    }
    searchInput?.addEventListener('input',  applyFilters);
    catFilter?.addEventListener('change',   applyFilters);
    statusFilter?.addEventListener('change', applyFilters);
    semesterFilter?.addEventListener('change', applyFilters);
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
        
        // Display the semester in the page
        const semesterEl = document.getElementById('myfiles-current-semester');
        if (semesterEl) semesterEl.textContent = sem.name;
        
        return true;
    } catch (e) {
        console.error('loadActiveSemester error:', e);
        return false;
    }
}

async function loadMyFiles() {
    try {
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            showNoFilesMessage('Configuration error. Please contact support.');
            return;
        }
        const sessionUser = getCurrentUser();
        if (!sessionUser || !sessionUser.id) {
            console.error('User not authenticated in session');
            showNoFilesMessage('Please log in to view your files.');
            return;
        }
        
        // Fetch semesters for mapping
        const { data: semesters, error: semestersError } = await supabaseClient
            .from('semesters')
            .select('id, name');
        const semesterMap = {};
        if (!semestersError && semesters) {
            semesters.forEach(sem => { semesterMap[sem.id] = sem.name; });
        }
        
        const { data: submissions, error: submissionsError } = await supabaseClient
            .from('submissions')
            .select(`
                *,
                submission_files(*),
                requirements!left(
                    name,
                    categories:category_id(
                        name,
                        icon
                    )
                )
            `)
            .eq('professor_id', sessionUser.id)
            .eq('semester_id', activeSemesterId)
            .order('submitted_at', { ascending: false });

        if (submissionsError) {
            console.error('Error loading submissions:', submissionsError);
            showNoFilesMessage('Error loading files. Please try again.');
            return;
        }

        if (!submissions || submissions.length === 0) {
            showNoFilesMessage('No files uploaded yet. Start by uploading your first file!');
            return;
        }
        
        console.log('Submissions loaded:', submissions);

        for (let submission of submissions) {
            // Map semester name from semester map
            if (submission.semester_id && semesterMap[submission.semester_id]) {
                submission.semester_name = semesterMap[submission.semester_id];
            }
            if (submission.submission_files && submission.submission_files.length > 0) {
                for (let file of submission.submission_files) {
                    file.signed_url = await resolveFileUrl(file.file_url || file.file_path, file.file_name);
                }
            }
        }

        try {
            console.log('Calling updateStatistics...');
            updateStatistics(submissions);
            
            console.log('Calling populateCategoryFilter...');
            populateCategoryFilter(submissions);
            
            console.log('Calling populateSemesterFilter...');
            populateSemesterFilter(submissions);
            
            console.log('Calling renderFiles...');
            renderFiles(submissions);
        } catch (err) {
            console.error('Error during rendering:', err);
            showNoFilesMessage('Error displaying files: ' + err.message);
        }

    } catch (error) {
        console.error('Error in loadMyFiles:', error);
        showNoFilesMessage('An unexpected error occurred. Please try again.');
    }
}

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

function updateStatistics(submissions) {
    const totalEl = document.getElementById('myfiles-total');
    const approvedEl = document.getElementById('myfiles-approved');
    const pendingEl = document.getElementById('myfiles-pending');
    const rejectedEl = document.getElementById('myfiles-rejected');

    // Submissions are already filtered by current semester in loadMyFiles
    const total = submissions.length;
    const approved = submissions.filter(s => s.status === 'approved').length;
    const pending = submissions.filter(s => s.status === 'pending').length;
    const rejected = submissions.filter(s => s.status === 'rejected').length;

    if (totalEl) totalEl.textContent = total;
    if (approvedEl) approvedEl.textContent = approved;
    if (pendingEl) pendingEl.textContent = pending;
    if (rejectedEl) rejectedEl.textContent = rejected;
}

function populateCategoryFilter(submissions) {
    try {
        const catFilter = document.querySelector('.cat-filter');
        if (!catFilter) return;
        const categories = new Set();
        submissions.forEach(submission => {
            const categoryName = submission.requirements?.categories?.name;
            if (categoryName) categories.add(categoryName);
        });
        const currentOptions = catFilter.innerHTML;
        const allCategoriesOption = '<option value="all categories">All Categories</option>';
        const categoryOptions = Array.from(categories)
            .sort()
            .map(cat => `<option value="${escapeHtml(cat.toLowerCase())}">${escapeHtml(cat)}</option>`)
            .join('');

        catFilter.innerHTML = allCategoriesOption + categoryOptions;
    } catch (err) {
        console.error('Error in populateCategoryFilter:', err);
    }
}

function populateSemesterFilter(submissions) {
    try {
        const semesterFilter = document.querySelector('.semester-filter');
        if (!semesterFilter) return;
        const semesters = new Map();
        submissions.forEach(submission => {
            const semId = submission.semester_id;
            if (semId) semesters.set(semId, submission.semester_name || `Semester ${semId}`);
        });
        const allSemestersOption = '<option value="all semesters">All Semesters</option>';
        const semesterOptions = Array.from(semesters.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, name]) => `<option value="${escapeHtml(name.toLowerCase())}">${escapeHtml(name)}</option>`)
            .join('');

        semesterFilter.innerHTML = allSemestersOption + semesterOptions;
    } catch (err) {
        console.error('Error in populateSemesterFilter:', err);
    }
}

function renderFiles(submissions) {
    const filesGrid = document.getElementById('files-grid');
    const emptyState = document.getElementById('emptyState');
    if (!filesGrid) {
        console.error('files-grid element not found');
        return;
    }

    console.log('Rendering files, count:', submissions.length);
    
    if (submissions.length === 0) {
        filesGrid.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    
    try {
        const statusBadges = {
            approved: '<span class="status-badge approved">Approved</span>',
            pending: '<span class="status-badge pending">Pending</span>',
            rejected: '<span class="status-badge rejected">Rejected</span>'
        };

        filesGrid.innerHTML = submissions.map(submission => {
            console.log('Processing submission:', submission.id, 'Files:', submission.submission_files);
            const file = submission.submission_files?.[0]; 
            if (!file) {
                console.warn('Submission without file:', submission);
                return '';
            }

            console.log('File found:', file.file_name);
            console.log('File URL:', file.file_url);

            const requirementName = submission.requirements?.name || 'Unknown Requirement';
            const categoryName = submission.requirements?.categories?.name || 'General';
            const status = submission.status || 'pending';
            const createdDate = new Date(submission.submitted_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            const fileSize = formatBytes(file.file_size);
            const fileName = file.file_name;
            const semesterName = submission.semester_name || `Semester ${submission.semester_id}`;
            const statusBadge = statusBadges[status] || '<span class="status-badge">Unknown</span>';

            return `
                <tr data-name="${escapeHtml(fileName)}" data-cat="${escapeHtml(categoryName.toLowerCase())}" data-status="${status}" data-semester="${escapeHtml(semesterName.toLowerCase())}">
                    <td>${escapeHtml(fileName)}</td>
                    <td>${escapeHtml(requirementName)}</td>
                    <td>${escapeHtml(categoryName)}</td>
                    <td>${escapeHtml(semesterName)}</td>
                    <td>${createdDate}</td>
                    <td>${fileSize}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon view-btn" data-file-url="${file.signed_url}" data-file-name="${escapeHtml(fileName)}" title="View">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                    <circle cx="12" cy="12" r="3"/>
                                </svg>
                            </button>
                            <button class="btn-icon download-btn" data-file-url="${file.signed_url}" data-file-name="${escapeHtml(fileName)}" title="Download">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                    <polyline points="7 10 12 15 17 10"/>
                                    <line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                            </button>
                            ${status === 'pending' ? `
                            <button class="btn-icon btn-edit edit-btn" data-submission-id="${submission.id}" title="Edit Submission">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button class="btn-icon btn-danger delete-btn" data-submission-id="${submission.id}" title="Delete Submission">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                            ` : `
                            <button class="btn-icon btn-locked" title="Status: ${status}" disabled style="opacity: 0.4; cursor: not-allowed;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                </svg>
                            </button>
                            `}
                        </div>
                    </td>
                </tr>
            `;
        }).filter(html => html).join('');
        
        console.log('Generated HTML length:', filesGrid.innerHTML.length);
        
    } catch (err) {
        console.error('Error in renderFiles:', err);
        filesGrid.innerHTML = `<tr><td colspan="8" style="text-align:center;color:red;padding:2rem;">Error rendering files: ${err.message}</td></tr>`;
    }
}

function getFileIcon(extension) {
    const icons = {
        pdf: '📄',
        doc: '📝',
        docx: '📝',
        xls: '📊',
        xlsx: '📊',
        ppt: '📊',
        pptx: '📊',
        txt: '📃',
        zip: '🗜️',
        rar: '🗜️',
        jpg: '🖼️',
        jpeg: '🖼️',
        png: '🖼️',
        gif: '🖼️',
        mp4: '🎥',
        avi: '🎥',
        mov: '🎥',
        mp3: '🎵',
        wav: '🎵'
    };
    return icons[extension] || '📎';
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text ? String(text).replace(/[&<>"']/g, m => map[m]) : '';
}

function showNoFilesMessage(message) {
    const filesGrid = document.getElementById('files-grid');
    const emptyState = document.getElementById('emptyState');
    if (!filesGrid) return;

    filesGrid.innerHTML = '';
    if (emptyState) {
        emptyState.style.display = 'block';
    }
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

    // Revoke any previous blob URL to avoid memory leaks
    if (iframe._blobUrl) {
        URL.revokeObjectURL(iframe._blobUrl);
        iframe._blobUrl = null;
    }

    try {
        // Fetch via signed URL in JS — then serve as blob so iframe
        // never makes its own unauthenticated request to Supabase storage
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

async function deleteSubmission(submissionId) {
    try {
        // Find the submission to check its status
        const { data: submission } = await supabaseClient
            .from('submissions')
            .select('status, requirements(name), submission_files(file_name)')
            .eq('id', submissionId)
            .single();

        if (!submission) {
            alert('Submission not found.');
            return;
        }

        // Only allow deletion of pending or rejected submissions
        if (submission.status !== 'pending' && submission.status !== 'rejected') {
            alert(`Cannot delete ${submission.status} submissions. Only pending and rejected submissions can be deleted by you. Contact your administrator if you need to modify an approved submission.`);
            return;
        }

        const requirementName = submission.requirements?.name || 'this submission';
        const fileName = submission.submission_files?.[0]?.file_name || 'the file';
        
        if (!confirm(`Are you sure you want to delete "${fileName}"?\n\nThis action cannot be undone. You can resubmit the requirement later.`)) {
            return;
        }

        // Capture submission record before deletion for audit log
        const { data: submissionToDelete } = await supabaseClient
            .from('submissions')
            .select('*')
            .eq('id', submissionId)
            .single();

        const { error } = await supabaseClient
            .from('submissions')
            .delete()
            .eq('id', submissionId);

        if (error) throw error;

        // AUDIT: log submission deletion
        const submissionName = `Submission for ${requirementName}`;
        await auditLog('DELETE_SUBMISSION', 'submissions', submissionId, submissionName, submissionToDelete || null, null);

        // Reload files
        await loadMyFiles();
        
        showNotification(`Submission deleted successfully. You can resubmit "${requirementName}" anytime.`);
    } catch (error) {
        console.error('Error deleting submission:', error);
        showNotification('Failed to delete submission. Please try again.', 'error');
    }
}

async function editSubmission(submissionId) {
    try {
        const { data: submission } = await supabaseClient
            .from('submissions')
            .select(`
                *,
                submission_files(*),
                requirements(
                    name,
                    categories(name)
                )
            `)
            .eq('id', submissionId)
            .single();

        if (!submission) {
            showNotification('Submission not found.', 'error');
            return;
        }

        // Only allow editing of pending submissions
        if (submission.status !== 'pending') {
            showNotification(`Cannot edit ${submission.status} submissions. Only pending submissions can be edited.`, 'error');
            return;
        }

        // Store current submission for update
        window.currentEditingSubmissionId = submissionId;
        window.currentEditingSubmission = submission;

        // Open the edit modal (we'll need to add this to the HTML)
        const modal = document.getElementById('edit-submission-modal');
        if (!modal) {
            // If modal doesn't exist, create a simple prompt for now
            const description = submission.remarks || '';
            const newDescription = prompt('Edit submission remarks/description:', description);
            
            if (newDescription !== null && newDescription !== description) {
                // Update the submission remarks
                const { error } = await supabaseClient
                    .from('submissions')
                    .update({ remarks: newDescription, updated_at: new Date().toISOString() })
                    .eq('id', submissionId);

                if (error) throw error;

                // AUDIT: log submission update
                await auditLog('UPDATE_SUBMISSION', 'submissions', submissionId, 
                    submission.requirements?.name || 'Unknown', 
                    submission,
                    { remarks: newDescription, updated_at: new Date().toISOString() }
                );

                showNotification('Submission updated successfully. Pending admin review.');
                await loadMyFiles();
            }
            return;
        }

        // Populate modal if it exists
        populateEditSubmissionModal(submission);
        modal.style.display = 'flex';

    } catch (error) {
        console.error('Error editing submission:', error);
        showNotification('Failed to load submission for editing.', 'error');
    }
}

function populateEditSubmissionModal(submission) {
    // Update modal content with submission data
    const modal = document.getElementById('edit-submission-modal');
    if (!modal) return;

    const file = submission.submission_files?.[0];
    const requirementName = submission.requirements?.name || 'Unknown';
    const categoryName = submission.requirements?.categories?.name || 'N/A';

    document.getElementById('edit-modal-title').textContent = `Edit Submission - ${requirementName}`;
    document.getElementById('edit-submission-requirement').textContent = requirementName;
    document.getElementById('edit-submission-category').textContent = categoryName;
    document.getElementById('edit-submission-status').textContent = `Pending Review`;
    
    if (file) {
        document.getElementById('edit-submission-current-file').innerHTML = `
            <div style="padding: 10px; background: #f5f5f5; border-radius: 4px; margin: 10px 0;">
                <strong>Current File:</strong> ${escapeHtml(file.file_name)}
                <br><small style="color: #666;">Size: ${formatBytes(file.file_size)} • Uploaded: ${new Date(file.uploaded_at).toLocaleDateString()}</small>
            </div>
        `;
    }

    document.getElementById('edit-submission-remarks').value = submission.remarks || '';
}

function closeEditSubmissionModal() {
    const modal = document.getElementById('edit-submission-modal');
    if (modal) modal.style.display = 'none';
    window.currentEditingSubmissionId = null;
    window.currentEditingSubmission = null;
}

async function submitEditedSubmission(e) {
    e.preventDefault();
    const submissionId = window.currentEditingSubmissionId;
    if (!submissionId) {
        showNotification('No submission selected for editing.', 'error');
        return;
    }

    try {
        const newRemarks = document.getElementById('edit-submission-remarks').value.trim();
        const fileInput = document.getElementById('edit-submission-file-input');
        
        // Update submission remarks
        const { error: updateError } = await supabaseClient
            .from('submissions')
            .update({ 
                remarks: newRemarks, 
                updated_at: new Date().toISOString() 
            })
            .eq('id', submissionId);

        if (updateError) throw updateError;

        // AUDIT: log submission update
        const submission = window.currentEditingSubmission;
        await auditLog('UPDATE_SUBMISSION', 'submissions', submissionId, 
            submission.requirements?.name || 'Unknown', 
            submission,
            { remarks: newRemarks, updated_at: new Date().toISOString() }
        );

        showNotification('Submission updated successfully! Your changes are pending admin review.');
        closeEditSubmissionModal();
        await loadMyFiles();

    } catch (error) {
        console.error('Error updating submission:', error);
        showNotification('Failed to update submission: ' + error.message, 'error');
    }
}

function showNotification(message, type = 'success') {
    if (type === 'error') {
        alert('Error: ' + message);
    } else {
        alert(message);
    }
}