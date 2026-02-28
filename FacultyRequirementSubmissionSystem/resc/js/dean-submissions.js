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
    const approveBtn = document.getElementById('approveFileBtn');
    const rejectBtn = document.getElementById('rejectFileBtn');
    
    if (approveBtn) {
        approveBtn.addEventListener('click', handleApproveFile);
    }
    if (rejectBtn) {
        rejectBtn.addEventListener('click', handleRejectFile);
    }
}

async function loadCategories() {
    try {
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            showPlaceholderCategories();
            return;
        }

        // TODO: Load categories from database
        showPlaceholderCategories();
        
    } catch (error) {
        console.error('Error loading categories:', error);
        showPlaceholderCategories();
    }
}

function showPlaceholderCategories() {
    allCategories = [
        {
            id: 'syllabus',
            name: 'Syllabus',
            description: 'Course syllabi and curriculum outlines',
            icon: 'purple',
            totalFiles: 45,
            approved: 40,
            pending: 5
        },
        {
            id: 'grades',
            name: 'Grade Sheets',
            description: 'Student grades and academic records',
            icon: 'green',
            totalFiles: 38,
            approved: 35,
            pending: 3
        },
        {
            id: 'notes',
            name: 'Lecture Notes',
            description: 'Teaching materials and lecture notes',
            icon: 'blue',
            totalFiles: 52,
            approved: 44,
            pending: 8
        },
        {
            id: 'attendance',
            name: 'Attendance Records',
            description: 'Student attendance tracking sheets',
            icon: 'orange',
            totalFiles: 28,
            approved: 26,
            pending: 2
        },
        {
            id: 'assessment',
            name: 'Assessment Tools',
            description: 'Quizzes, exams, and evaluation materials',
            icon: 'teal',
            totalFiles: 34,
            approved: 30,
            pending: 4
        },
        {
            id: 'research',
            name: 'Research Papers',
            description: 'Faculty research and publications',
            icon: 'pink',
            totalFiles: 15,
            approved: 14,
            pending: 1
        }
    ];

    renderCategories(allCategories);
    updateOverallStats();
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
            showPlaceholderFiles(categoryId);
            return;
        }

        // TODO: Load actual files from database
        showPlaceholderFiles(categoryId);
        
    } catch (error) {
        console.error('Error loading files:', error);
        showPlaceholderFiles(categoryId);
    }
}

function showPlaceholderFiles(categoryId) {
    // Sample files based on Figma design
    allFiles = [
        {
            id: 1,
            filename: 'CS101_Syllabus_Q1_2025.pdf',
            category: categoryId,
            uploadedBy: 'Dr. Juan Dela Cruz',
            department: 'Computer Science',
            date: '2026-02-20',
            size: '2.4 MB',
            status: 'approved'
        },
        {
            id: 2,
            filename: 'IT201_Syllabus_Q1_2025.pdf',
            category: categoryId,
            uploadedBy: 'Prof. Maria Santos',
            department: 'Information Technology',
            date: '2026-02-21',
            size: '2.1 MB',
            status: 'pending'
        },
        {
            id: 3,
            filename: 'IS301_Syllabus_Q1_2025.pdf',
            category: categoryId,
            uploadedBy: 'Dr. Ana Garcia',
            department: 'Information Systems',
            date: '2026-02-19',
            size: '2.8 MB',
            status: 'approved'
        }
    ];

    renderFiles(allFiles);
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
                ${file.status === 'pending' ? `
                    <div class="file-card-actions">
                        <button class="btn-approve" onclick="showReviewModal(${file.id}, 'approve')">
                            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                            Approve
                        </button>
                        <button class="btn-reject" onclick="showReviewModal(${file.id}, 'reject')">
                            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            Reject
                        </button>
                    </div>
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

function showReviewModal(fileId, action) {
    const file = allFiles.find(f => f.id === fileId);
    if (!file) return;

    // Populate modal
    document.getElementById('modalFileName').textContent = file.filename;
    document.getElementById('modalFileCategory').textContent = currentCategory?.name || '';
    document.getElementById('modalUploader').textContent = file.uploadedBy;
    document.getElementById('modalDepartment').textContent = file.department;
    document.getElementById('modalDate').textContent = formatFileDate(file.date);
    document.getElementById('modalSize').textContent = file.size;
    
    // Store file ID for later
    document.getElementById('fileReviewModal').dataset.fileId = fileId;
    document.getElementById('fileReviewModal').dataset.action = action;
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('fileReviewModal'));
    modal.show();
}

async function handleApproveFile() {
    const modal = document.getElementById('fileReviewModal');
    const fileId = parseInt(modal.dataset.fileId);
    const comments = document.getElementById('reviewComments').value;
    
    try {
        // TODO: Update file status in database
        console.log(`Approving file ${fileId} with comments:`, comments);
        
        // Update local state
        const file = allFiles.find(f => f.id === fileId);
        if (file) {
            file.status = 'approved';
        }
        
        // Refresh display
        filterFiles();
        
        // Close modal
        bootstrap.Modal.getInstance(modal).hide();
        
        // Show success message
        alert('File approved successfully!');
        
    } catch (error) {
        console.error('Error approving file:', error);
        alert('Failed to approve file. Please try again.');
    }
}

async function handleRejectFile() {
    const modal = document.getElementById('fileReviewModal');
    const fileId = parseInt(modal.dataset.fileId);
    const comments = document.getElementById('reviewComments').value;
    
    if (!comments.trim()) {
        alert('Please provide a reason for rejection');
        return;
    }
    
    try {
        // TODO: Update file status in database
        console.log(`Rejecting file ${fileId} with comments:`, comments);
        
        // Update local state
        const file = allFiles.find(f => f.id === fileId);
        if (file) {
            file.status = 'rejected';
        }
        
        // Refresh display
        filterFiles();
        
        // Close modal
        bootstrap.Modal.getInstance(modal).hide();
        
        // Show success message
        alert('File rejected successfully!');
        
    } catch (error) {
        console.error('Error rejecting file:', error);
        alert('Failed to reject file. Please try again.');
    }
}

function formatFileDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
