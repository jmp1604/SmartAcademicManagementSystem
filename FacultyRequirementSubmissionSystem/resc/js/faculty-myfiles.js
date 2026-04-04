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

        document.querySelectorAll('.file-card[data-cat]').forEach(function (card) {
            const matchQ       = !q       || card.dataset.name?.toLowerCase().includes(q);
            const matchCat     = !cat     || cat === 'all categories' || card.dataset.cat?.toLowerCase() === cat;
            const matchStatus  = !status  || status === 'all status'  || card.dataset.status?.toLowerCase() === status;
            const matchSem     = !sem     || sem === 'all semesters' || card.dataset.semester?.toLowerCase() === sem;
            card.style.display = (matchQ && matchCat && matchStatus && matchSem) ? '' : 'none';
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
    if (!filesGrid) {
        console.error('files-grid element not found');
        return;
    }

    console.log('Rendering files, count:', submissions.length);
    
    try {

    const statusColors = {
        approved: '#10b981',
        pending: '#f59e0b',
        rejected: '#ef4444'
    };

    const statusIcons = {
        approved: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
        pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        rejected: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
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
        let categoryIcon = submission.requirements?.categories?.icon || '📁';
        if (categoryIcon.includes('fa-')) {
            categoryIcon = `<i class="${categoryIcon}"></i>`;
        }
        const status = submission.status || 'pending';
        const statusColor = statusColors[status] || '#6b7280';
        const statusIcon = statusIcons[status] || '';
        const createdDate = new Date(submission.submitted_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        const fileSize = formatBytes(file.file_size);
        const fileName = file.file_name;
        const fileExt = fileName.split('.').pop().toLowerCase();
        const fileIcon = getFileIcon(fileExt);
        const semesterName = submission.semester_name || `Semester ${submission.semester_id}`;

        return `
            <div class="file-card" data-name="${escapeHtml(fileName)}" data-cat="${escapeHtml(categoryName.toLowerCase())}" data-status="${status}" data-semester="${escapeHtml(semesterName.toLowerCase())}">
                <div class="file-icon ${fileExt}">${fileIcon}</div>
                <div class="file-info">
                    <div class="file-name" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</div>
                    <div class="file-meta">
                        <span>${fileSize}</span>
                        <span>•</span>
                        <span>${createdDate}</span>
                    </div>
                    <div class="file-requirement">
                        <span class="req-icon">${categoryIcon}</span>
                        <span class="req-text">${escapeHtml(requirementName)}</span>
                    </div>
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                        <div class="file-category-badge">${escapeHtml(categoryName)}</div>
                        <div class="file-category-badge" style="background: rgba(59, 130, 246, 0.15); color: #1e40af;">${escapeHtml(semesterName)}</div>
                    </div>
                </div>
                <div class="file-status" style="background:${statusColor};">
                    ${statusIcon}
                    <span>${capitalizeFirst(status)}</span>
                </div>
                <div class="file-actions">
                    <button class="btn-action view-btn" data-file-url="${file.signed_url}" data-file-name="${escapeHtml(fileName)}" title="View file">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    <button class="btn-action download-btn" data-file-url="${file.signed_url}" data-file-name="${escapeHtml(fileName)}" title="Download file">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                    </button>
                    ${status === 'pending' ? `
                    <button class="btn-action delete delete-btn" data-submission-id="${submission.id}" title="Delete submission">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).filter(html => html).join('');
    
    console.log('Generated HTML length:', filesGrid.innerHTML.length);
    
    } catch (err) {
        console.error('Error in renderFiles:', err);
        filesGrid.innerHTML = `<div style="color:red;padding:2rem;">Error rendering files: ${err.message}</div>`;
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
    if (!filesGrid) return;

    filesGrid.innerHTML = `
        <div style="text-align:center; padding:4rem 2rem; grid-column:1/-1;">
            <div style="width:80px;height:80px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                    <polyline points="13 2 13 9 20 9"/>
                </svg>
            </div>
            <h3 style="font-family:'Merriweather',serif;color:#374151;margin-bottom:.5rem;font-size:1.2rem;">No Files Found</h3>
            <p style="color:#6b7280;font-size:.95rem;margin-bottom:1.5rem;">${escapeHtml(message)}</p>
            <a href="faculty-upload.html" style="display:inline-block;padding:.7rem 1.5rem;background:#1e40af;color:#fff;border-radius:.5rem;font-weight:600;text-decoration:none;">Upload File</a>
        </div>
    `;
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
    if (!confirm('Are you sure you want to delete this submission? This action cannot be undone.')) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('submissions')
            .delete()
            .eq('id', submissionId);

        if (error) throw error;

        // Reload files
        await loadMyFiles();
        
        alert('Submission deleted successfully.');
    } catch (error) {
        console.error('Error deleting submission:', error);
        alert('Failed to delete submission. Please try again.');
    }
}