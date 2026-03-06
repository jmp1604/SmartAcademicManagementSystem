let currentCategory = null;
let allFiles = [];
let allCategories = [];

document.addEventListener('DOMContentLoaded', function () {
    if (!isDean()) {
        window.location.href = '../../auth/login.html';
        return;
    }

    loadCategories();
    setupEventListeners();
    initializeModal();
});

function setupEventListeners() {
    const backBtn = document.getElementById('backToCategoriesBtn');
    if (backBtn) {
        backBtn.addEventListener('click', showCategoriesView);
    }
    const categorySearch = document.getElementById('categorySearchInput');
    if (categorySearch) {
        categorySearch.addEventListener('input', filterCategories);
    }
    const statusFilter = document.getElementById('fileStatusFilter');
    const deptFilter = document.getElementById('fileDepartmentFilter');
    
    if (statusFilter) {
        statusFilter.addEventListener('change', filterFiles);
    }
    if (deptFilter) {
        deptFilter.addEventListener('change', filterFiles);
    }
    const flagBtn = document.getElementById('flagSubmissionBtn');
    if (flagBtn) {
        flagBtn.addEventListener('click', handleFlagSubmission);
    }
}

async function loadCategories() {
    try {
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            allCategories = [];
            renderCategories(allCategories);
            updateOverallStats();
            return;
        }
        const { data: categories, error: categoriesError } = await supabaseClient
            .from('requirements')
            .select('*')
            .order('name');

        if (categoriesError) {
            console.error('Error loading categories:', categoriesError);
            allCategories = [];
            renderCategories(allCategories);
            updateOverallStats();
            return;
        }

        const user = getCurrentUser();
        const department = user.department || 'Computer Science';
        const { data: submissions, error: submissionsError } = await supabaseClient
            .from('submissions')
            .select(`*, submission_files(*)`);

        if (submissionsError) {
            console.error('Error loading submissions:', submissionsError);
        }
        const professorIds = [...new Set((submissions || []).map(s => s.professor_id).filter(Boolean))];
        let professorsMap = {};
        if (professorIds.length > 0) {
            const { data: professorsData } = await supabaseClient
                .from('professors')
                .select('professor_id, first_name, middle_name, last_name, department')
                .in('professor_id', professorIds);
            (professorsData || []).forEach(p => { professorsMap[p.professor_id] = p; });
        }
        const submissionsWithProfs = (submissions || []).map(s => ({
            ...s,
            professors: professorsMap[s.professor_id] || null
        }));
        const filteredSubmissions = submissionsWithProfs;

        if (filteredSubmissions && filteredSubmissions.length > 0) {
            for (let submission of filteredSubmissions) {
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
                            }
                        }
                    }
                }
            }
        }
        allCategories = (categories || []).map(category => {
            const categorySubmissions = filteredSubmissions?.filter(s => s.requirement_id === category.id) || [];
            const iconColors = ['purple', 'green', 'blue', 'orange', 'teal', 'pink'];
            const iconIndex = allCategories.length % iconColors.length;

            return {
                id: category.id,
                name: category.name,
                description: category.description || 'No description available',
                icon: iconColors[iconIndex],
                totalFiles: categorySubmissions.length,
                approved: categorySubmissions.filter(s => s.status === 'approved').length,
                pending: categorySubmissions.filter(s => s.status === 'pending').length
            };
        });

        renderCategories(allCategories);
        updateOverallStats();
        
    } catch (error) {
        console.error('Error loading categories:', error);
        allCategories = [];
        renderCategories(allCategories);
        updateOverallStats();
    }
}

function updateOverallStats() {
    const totalFiles = allCategories.reduce((sum, cat) => sum + cat.totalFiles, 0);
    const totalApproved = allCategories.reduce((sum, cat) => sum + cat.approved, 0);
    const totalPending = allCategories.reduce((sum, cat) => sum + cat.pending, 0);
    
    document.getElementById('totalFilesCount').textContent = totalFiles;
    document.getElementById('approvedCount').textContent = totalApproved;
    document.getElementById('pendingCount').textContent = totalPending;
    document.getElementById('categoriesCount').textContent = allCategories.length;
}

function renderCategories(categories) {
    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;

    grid.innerHTML = '';

    categories.forEach(category => {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.innerHTML = `
            <div class="category-card-header">
                <div class="category-icon ${category.icon}">
                    ${getCategoryIcon(category.id)}
                </div>
                <div class="category-info">
                    <h3>${category.name}</h3>
                    <p>${category.description}</p>
                </div>
            </div>
            <div class="category-stats">
                <div class="category-stat">
                    <div class="category-stat-label">Total Files</div>
                    <div class="category-stat-value">${category.totalFiles}</div>
                </div>
                <div class="category-stat">
                    <div class="category-stat-label">Approved</div>
                    <div class="category-stat-value approved">${category.approved}</div>
                </div>
                <div class="category-stat">
                    <div class="category-stat-label">Pending</div>
                    <div class="category-stat-value pending">${category.pending}</div>
                </div>
            </div>
            <div class="category-view-link">
                View Files
                <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
        `;
        
        card.addEventListener('click', () => showFilesView(category));
        grid.appendChild(card);
    });
}

function getCategoryIcon(categoryId) {
    const icons = {
        syllabus: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        grades: '<svg viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
        notes: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        attendance: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        assessment: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
        research: '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
    };
    return icons[categoryId] || icons.syllabus;
}

function filterCategories() {
    const searchTerm = document.getElementById('categorySearchInput').value.toLowerCase();
    const filtered = allCategories.filter(cat => 
        cat.name.toLowerCase().includes(searchTerm) || 
        cat.description.toLowerCase().includes(searchTerm)
    );
    renderCategories(filtered);
}

function showFilesView(category) {
    currentCategory = category;
    document.getElementById('categoriesView').style.display = 'none';
    document.getElementById('filesView').style.display = 'block';
    document.getElementById('categoryTitle').textContent = category.name;
    document.getElementById('categoryDescription').textContent = category.description;
    document.getElementById('catTotalFiles').textContent = category.totalFiles;
    document.getElementById('catApprovedFiles').textContent = category.approved;
    document.getElementById('catPendingFiles').textContent = category.pending;
    
    loadFiles(category.id);
}

function showCategoriesView() {
    document.getElementById('categoriesView').style.display = 'block';
    document.getElementById('filesView').style.display = 'none';
    currentCategory = null;
}

async function loadFiles(categoryId) {
    try {
        if (!supabaseClient) {
            allFiles = [];
            renderFiles(allFiles);
            return;
        }

        const user = getCurrentUser();
        const department = user.department || 'Computer Science';
        const { data: files, error } = await supabaseClient
            .from('submissions')
            .select(`*, submission_files(*)`)
            .eq('requirement_id', categoryId)
            .order('submitted_at', { ascending: false });

        if (error) {
            console.error('Error loading files:', error);
            allFiles = [];
            renderFiles(allFiles);
            return;
        }

        const professorIds = [...new Set((files || []).map(s => s.professor_id).filter(Boolean))];
        let professorsMap = {};
        if (professorIds.length > 0) {
            const { data: professorsData } = await supabaseClient
                .from('professors')
                .select('professor_id, first_name, middle_name, last_name, department')
                .in('professor_id', professorIds);
            (professorsData || []).forEach(p => { professorsMap[p.professor_id] = p; });
        }
        const filesWithProfs = (files || []).map(f => ({
            ...f,
            professors: professorsMap[f.professor_id] || null
        }));
        const filteredFiles = filesWithProfs;

        if (filteredFiles && filteredFiles.length > 0) {
            for (let file of filteredFiles) {
                if (file.submission_files && file.submission_files.length > 0) {
                    const submissionFile = file.submission_files[0];
                    const rawPath = submissionFile.file_path || submissionFile.file_url;
                    if (rawPath) {
                        let storagePath = rawPath;
                        const marker = '/object/public/faculty-submissions/';
                        if (rawPath.includes(marker)) {
                            storagePath = decodeURIComponent(rawPath.split(marker)[1]);
                        }
                        const { data: signedUrlData, error: signedUrlError } = await supabaseClient.storage
                            .from('faculty-submissions')
                            .createSignedUrl(storagePath, 3600);
                        if (!signedUrlError && signedUrlData?.signedUrl) {
                            file.signed_url = signedUrlData.signedUrl;
                        }
                    }
                }
            }
        }

        allFiles = (filteredFiles || []).map(file => {
            const submissionFile = file.submission_files?.[0];
            return {
                id: file.id,
                filename: submissionFile?.file_name || file.file_name || 'Unknown',
                category: categoryId,
                uploadedBy: file.professors 
                    ? `${file.professors.first_name} ${file.professors.middle_name ? file.professors.middle_name + ' ' : ''}${file.professors.last_name}` 
                    : 'Unknown',
                department: file.professors?.department || 'N/A',
                date: file.submitted_at,
                size: formatFileSize(submissionFile?.file_size || file.file_size),
                status: file.status,
                fileUrl: file.signed_url || submissionFile?.file_url || file.file_url,
                submissionFileData: submissionFile
            };
        });

        renderFiles(allFiles);
        
    } catch (error) {
        console.error('Error loading files:', error);
        allFiles = [];
        renderFiles(allFiles);
    }
}

function formatFileSize(bytes) {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderFiles(files) {
    const grid = document.getElementById('filesGrid');
    if (!grid) return;

    grid.innerHTML = '';

    if (files.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">No files found</p>';
        return;
    }

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

    files.forEach(file => {
        const card = document.createElement('div');
        const fileExt = file.filename.split('.').pop().toLowerCase();
        const fileIcon = getFileIcon(fileExt);
        const statusColor = statusColors[file.status] || '#6b7280';
        const statusIcon = statusIcons[file.status] || '';
        
        card.className = 'file-card';
        card.innerHTML = `
            <div class="file-icon ${fileExt}">${fileIcon}</div>
            <div class="file-info">
                <div class="file-name" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</div>
                <div class="file-meta">
                    <span>${file.size}</span>
                    <span>•</span>
                    <span>${formatFileDate(file.date)}</span>
                </div>
                <div class="file-requirement">
                    <span class="req-icon">👤</span>
                    <span class="req-text">${escapeHtml(file.uploadedBy)}</span>
                </div>
                <div class="file-category-badge">${escapeHtml(file.department)}</div>
            </div>
            <div class="file-status" style="background:${statusColor};">
                ${statusIcon}
                <span>${capitalizeFirst(file.status)}</span>
            </div>
            <div class="file-actions">
                <button class="btn-action" onclick="viewFilePreview('${file.id}')" title="Preview file">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                </button>
                <button class="btn-action" onclick="viewFileDetails('${file.id}')" title="View details">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                </button>
                ${file.status === 'pending' && !file.flagged_by_dean ? `
                <button class="btn-action" onclick="showFlagModal(${file.id})" title="Flag for admin" style="border-color: #f59e0b;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                        <line x1="4" y1="22" x2="4" y2="15"/>
                    </svg>
                </button>
                ` : ''}
            </div>
        `;
        grid.appendChild(card);
    });
}

function filterFiles() {
    const statusFilter = document.getElementById('fileStatusFilter').value;
    const deptFilter = document.getElementById('fileDepartmentFilter').value;
    
    let filtered = [...allFiles];
    
    if (statusFilter) {
        filtered = filtered.filter(f => f.status === statusFilter);
    }
    
    if (deptFilter) {
        filtered = filtered.filter(f => f.department === deptFilter);
    }
    
    renderFiles(filtered);
}

function viewFileDetails(fileId) {
    const file = allFiles.find(f => f.id === fileId);
    if (!file) return;
    document.getElementById('modalFileName').textContent = file.filename;
    document.getElementById('modalFileCategory').textContent = currentCategory?.name || '';
    document.getElementById('modalUploader').textContent = file.uploadedBy;
    document.getElementById('modalDepartment').textContent = file.department;
    document.getElementById('modalDate').textContent = formatFileDate(file.date);
    document.getElementById('modalSize').textContent = file.size;
    document.getElementById('modalStatus').textContent = file.status.toUpperCase();
    const modal = new bootstrap.Modal(document.getElementById('fileDetailsModal'));
    modal.show();
}

function showFlagModal(fileId) {
    const file = allFiles.find(f => f.id === fileId);
    if (!file) return;
    document.getElementById('flagModal').dataset.fileId = fileId;
    document.getElementById('flagFileName').textContent = file.filename;
    document.getElementById('flagReason').value = '';
    document.getElementById('flagNotes').value = '';
    const modal = new bootstrap.Modal(document.getElementById('flagModal'));
    modal.show();
}

async function handleFlagSubmission() {
    const modal = document.getElementById('flagModal');
    const fileId = modal.dataset.fileId;
    const reason = document.getElementById('flagReason').value;
    const notes = document.getElementById('flagNotes').value;
    
    if (!reason.trim()) {
        alert('Please provide a reason for flagging this submission');
        return;
    }
    
    try {
        if (!supabaseClient) {
            alert('Database connection not available');
            return;
        }
        const user = getCurrentUser();
        const { error } = await supabaseClient
            .from('submissions')
            .update({
                flagged_by_dean: true,
                flag_reason: reason,
                dean_notes: notes || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', fileId);

        if (error) throw error;
        await supabaseClient
            .from('audit_logs')
            .insert({
                user_id: user.id,
                action: 'flag',
                file_name: allFiles.find(f => f.id === fileId)?.filename,
                category: currentCategory?.name,
                comments: `Flagged: ${reason}`
            });
    
    const file = allFiles.find(f => f.id === fileId);
        if (file) {
            file.flagged_by_dean = true;
        }
        filterFiles();
        bootstrap.Modal.getInstance(modal).hide();
        alert('Submission flagged successfully! Admin will review it.');
        
        if (currentCategory) {
            loadFiles(currentCategory.id);
        }
        
    } catch (error) {
        console.error('Error flagging submission:', error);
        alert('Failed to flag submission: ' + error.message);
    }
}

function formatFileDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function viewFilePreview(fileId) {
    const file = allFiles.find(f => f.id === fileId);
    if (!file || !file.fileUrl) {
        alert('File URL not available');
        return;
    }
    viewFile(file.fileUrl, file.filename);
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

function capitalizeFirst(str) {
    if (!str) return '';
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