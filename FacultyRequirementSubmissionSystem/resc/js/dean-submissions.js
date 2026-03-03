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
    
    // Flag submission button
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

        // Load categories from database
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

        // Get all submissions from faculty in this dean's department
        const { data: submissions, error: submissionsError } = await supabaseClient
            .from('submissions')
            .select(`
                *,
                professors!inner(department)
            `)
            .eq('professors.department', department);

        if (submissionsError) {
            console.error('Error loading submissions:', submissionsError);
        }

        // Map categories with submission counts
        allCategories = (categories || []).map(category => {
            const categorySubmissions = submissions?.filter(s => s.requirement_id === category.id) || [];
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
    
    // Hide categories view, show files view
    document.getElementById('categoriesView').style.display = 'none';
    document.getElementById('filesView').style.display = 'block';
    
    // Update header
    document.getElementById('categoryTitle').textContent = category.name;
    document.getElementById('categoryDescription').textContent = category.description;
    
    // Update stats
    document.getElementById('catTotalFiles').textContent = category.totalFiles;
    document.getElementById('catApprovedFiles').textContent = category.approved;
    document.getElementById('catPendingFiles').textContent = category.pending;
    
    // Load files for this category
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

        // Load files from faculty in this dean's department for this category
        const { data: files, error } = await supabaseClient
            .from('submissions')
            .select(`
                *,
                professors!inner(first_name, middle_name, last_name, department)
            `)
            .eq('requirement_id', categoryId)
            .eq('professors.department', department)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading files:', error);
            allFiles = [];
            renderFiles(allFiles);
            return;
        }

        // Transform files to match expected format
        allFiles = (files || []).map(file => ({
            id: file.id,
            filename: file.file_name,
            category: categoryId,
            uploadedBy: file.professors 
                ? `${file.professors.first_name} ${file.professors.middle_name ? file.professors.middle_name + ' ' : ''}${file.professors.last_name}` 
                : 'Unknown',
            department: file.professors?.department || 'N/A',
            date: file.created_at,
            size: formatFileSize(file.file_size),
            status: file.status,
            fileUrl: file.file_url
        }));

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

    files.forEach(file => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.innerHTML = `
            <div class="file-card-preview">
                ${file.status !== 'pending' ? `<div class="file-status-badge ${file.status}">${file.status}</div>` : ''}
                <div class="file-icon">
                    <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
            </div>
            <div class="file-card-body">
                <div class="file-card-title">${file.filename}</div>
                <div class="file-card-meta">
                    <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Uploaded by: ${file.uploadedBy}
                </div>
                <div class="file-card-meta">
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Date: ${formatFileDate(file.date)}
                </div>
                <div class="file-card-meta">
                    <svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    Size: ${file.size}
                </div>
                <div class="file-card-actions">
                    <button class="btn-view" onclick="viewFileDetails(${file.id})" style="background: #2563eb; color: white;">
                        <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View Details
                    </button>
                    ${file.status === 'pending' && !file.flagged_by_dean ? `
                        <button class="btn-flag" onclick="showFlagModal(${file.id})" style="background: #f59e0b; color: white;">
                            <svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                            Flag for Admin
                        </button>
                    ` : ''}
                    ${file.flagged_by_dean ? '<span style="color: #f59e0b; font-size: 0.85rem;">⚠️ Flagged</span>' : ''}
                </div>
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

    // Populate modal
    document.getElementById('modalFileName').textContent = file.filename;
    document.getElementById('modalFileCategory').textContent = currentCategory?.name || '';
    document.getElementById('modalUploader').textContent = file.uploadedBy;
    document.getElementById('modalDepartment').textContent = file.department;
    document.getElementById('modalDate').textContent = formatFileDate(file.date);
    document.getElementById('modalSize').textContent = file.size;
    document.getElementById('modalStatus').textContent = file.status.toUpperCase();
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('fileDetailsModal'));
    modal.show();
}

function showFlagModal(fileId) {
    const file = allFiles.find(f => f.id === fileId);
    if (!file) return;

    // Store file ID for later
    document.getElementById('flagModal').dataset.fileId = fileId;
    document.getElementById('flagFileName').textContent = file.filename;
    document.getElementById('flagReason').value = '';
    document.getElementById('flagNotes').value = '';
    
    // Show modal
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

        // Update submission to flag it
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

        // Log the flagging action
        await supabaseClient
            .from('audit_logs')
            .insert({
                user_id: user.id,
                action: 'flag',
                file_name: allFiles.find(f => f.id === fileId)?.filename,
                category: currentCategory?.name,
                comments: `Flagged: ${reason}`
            });
        
        // Update local state
        const file = allFiles.find(f => f.id === fileId);
        if (file) {
            file.flagged_by_dean = true;
        }
        
        // Refresh display
        filterFiles();
        
        // Close modal
        bootstrap.Modal.getInstance(modal).hide();
        
        // Show success message
        alert('Submission flagged successfully! Admin will review it.');
        
        // Reload to refresh UI
        if (currentCategory) {
            loadFiles(currentCategory.id);
        }
        
    } catch (error) {
        console.error('Error flagging submission:', error);
        alert('Failed to flag submission: ' + error.message);
    }
}

// Dean can no longer approve/reject - only admins can do that
// Deans can view and flag submissions for admin review

function formatFileDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
