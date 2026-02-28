let allActivities = [];
let filteredActivities = [];
let currentPage = 1;
const itemsPerPage = 15;

document.addEventListener('DOMContentLoaded', function () {
    if (!isDean()) {
        window.location.href = '../../auth/login.html';
        return;
    }

    loadActivities();
    setupEventListeners();
});

function setupEventListeners() {
    const searchInput = document.getElementById('activitySearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', filterActivities);
    }
    const actionFilter = document.getElementById('actionFilter');
    const dateFilter = document.getElementById('dateRangeFilter');
    
    if (actionFilter) {
        actionFilter.addEventListener('change', filterActivities);
    }
    if (dateFilter) {
        dateFilter.addEventListener('change', filterActivities);
    }
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => changePage(-1));
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => changePage(1));
    }
}

async function loadActivities() {
    try {
        const user = getCurrentUser();
        const department = user.department || 'Computer Science';

        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            loadPlaceholderActivities();
            updateStats();
            return;
        }

        // TODO: Load actual activities from audit log table
        loadPlaceholderActivities();
        updateStats();
        
    } catch (error) {
        console.error('Error loading activities:', error);
        loadPlaceholderActivities();
        updateStats();
    }
}

function loadPlaceholderActivities() {
    allActivities = [
        {
            id: 1,
            action: 'approve',
            user: 'Dean Pedro Reyes',
            userType: 'Dean',
            file: 'CS101_Syllabus_Q1_2025.pdf',
            category: 'syllabus',
            timestamp: '2026-02-22 14:45:30',
            status: 'success',
            comments: 'Approved'
        },
        {
            id: 2,
            action: 'upload',
            user: 'Dr. Juan Dela Cruz',
            userType: 'Professor',
            file: 'CS101_Grades_Final_2025.xlsx',
            category: 'grades',
            timestamp: '2026-02-22 14:00:15',
            status: 'success',
            comments: null
        },
        {
            id: 3,
            action: 'update',
            user: 'Prof. Maria Santos',
            userType: 'Professor',
            file: 'IT201_Syllabus_Q1_2025.pdf',
            category: 'syllabus',
            timestamp: '2026-02-22 14:35:50',
            status: 'success',
            comments: 'Updated version with corrections'
        },
        {
            id: 4,
            action: 'delete',
            user: 'Dr. Ana Garcia',
            userType: 'Professor',
            file: 'IS301_Draft.pdf',
            category: 'syllabus',
            timestamp: '2026-02-22 13:20:45',
            status: 'success',
            comments: 'Removed draft version'
        },
        {
            id: 5,
            action: 'reject',
            user: 'Dean Pedro Reyes',
            userType: 'Dean',
            file: 'CS201_Incomplete.pdf',
            category: 'syllabus',
            timestamp: '2026-02-22 12:15:30',
            status: 'success',
            comments: 'Missing required sections'
        },
        {
            id: 6,
            action: 'upload',
            user: 'Dr. Roberto Santos',
            userType: 'Professor',
            file: 'IT301_LectureNotes_Week1.pdf',
            category: 'notes',
            timestamp: '2026-02-22 11:45:20',
            status: 'success',
            comments: null
        },
        {
            id: 7,
            action: 'approve',
            user: 'Dean Pedro Reyes',
            userType: 'Dean',
            file: 'CS102_Attendance_Feb.xlsx',
            category: 'attendance',
            timestamp: '2026-02-22 10:30:15',
            status: 'success',
            comments: 'Approved'
        },
        {
            id: 8,
            action: 'upload',
            user: 'Prof. Linda Cruz',
            userType: 'Professor',
            file: 'IS101_Quiz1_2025.pdf',
            category: 'assessment',
            timestamp: '2026-02-22 09:20:00',
            status: 'success',
            comments: null
        }
    ];

    filteredActivities = [...allActivities];
    renderActivities();
}

function updateStats() {
    const uploads = allActivities.filter(a => a.action === 'upload').length;
    const approvals = allActivities.filter(a => a.action === 'approve').length;
    const rejections = allActivities.filter(a => a.action === 'reject').length;
    const updates = allActivities.filter(a => a.action === 'update').length;
    
    document.getElementById('uploadsCount').textContent = uploads;
    document.getElementById('approvalsCount').textContent = approvals;
    document.getElementById('rejectionsCount').textContent = rejections;
    document.getElementById('updatesCount').textContent = updates;
}

function filterActivities() {
    const searchTerm = document.getElementById('activitySearchInput')?.value.toLowerCase() || '';
    const actionFilter = document.getElementById('actionFilter')?.value || '';
    const dateFilter = document.getElementById('dateRangeFilter')?.value || 'month';
    
    filteredActivities = allActivities.filter(activity => {
        const matchesSearch = !searchTerm || 
            activity.user.toLowerCase().includes(searchTerm) ||
            activity.file.toLowerCase().includes(searchTerm) ||
            activity.action.toLowerCase().includes(searchTerm)
        const matchesAction = !actionFilter || activity.action === actionFilter;
        const matchesDate = checkDateFilter(activity.timestamp, dateFilter);
        
        return matchesSearch && matchesAction && matchesDate;
    });
    
    currentPage = 1;
    renderActivities();
}

function checkDateFilter(timestamp, filter) {
    const activityDate = new Date(timestamp);
    const now = new Date();
    const diffTime = now - activityDate;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    
    switch (filter) {
        case 'today':
            return diffDays < 1;
        case 'week':
            return diffDays < 7;
        case 'month':
            return diffDays < 30;
        case 'semester':
            return diffDays < 120;
        case 'all':
        default:
            return true;
    }
}

function renderActivities() {
    const container = document.getElementById('activityLog');
    if (!container) return;

    container.innerHTML = '';

    if (filteredActivities.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p>No activities found matching your filters</p>
            </div>
        `;
        document.getElementById('paginationControls').style.display = 'none';
        return;
    }
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageActivities = filteredActivities.slice(startIdx, endIdx);
    
    pageActivities.forEach(activity => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        
        item.innerHTML = `
            <div class="activity-icon ${activity.action}">
                ${getActionIcon(activity.action)}
            </div>
            <div class="activity-content">
                <div class="activity-header">
                    <span class="activity-user">${activity.user}</span>
                    <span class="activity-action">${getActionText(activity.action)}</span>
                </div>
                <span class="activity-file">File: ${activity.file}</span>
                <div class="activity-meta">
                    <span class="activity-badge ${activity.category}">${capitalizeFirst(activity.category)}</span>
                    <span>${formatActivityTime(activity.timestamp)}</span>
                </div>
            </div>
            <div class="activity-status">
                <span class="status-badge ${activity.status}">${capitalizeFirst(activity.status)}</span>
            </div>
        `;
        
        item.addEventListener('click', () => showActivityDetails(activity));
        container.appendChild(item);
    });
    updatePagination();
}

function getActionIcon(action) {
    const icons = {
        upload: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
        approve: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
        reject: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        update: '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        delete: '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
    };
    return icons[action] || icons.upload;
}

function getActionText(action) {
    const texts = {
        upload: 'Uploaded Document',
        approve: 'Approved Document',
        reject: 'Rejected Document',
        update: 'Updated Document',
        delete: 'Deleted Document'
    };
    return texts[action] || 'Performed Action';
}

function formatActivityTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function updatePagination() {
    const totalPages = Math.ceil(filteredActivities.length / itemsPerPage);
    
    if (totalPages <= 1) {
        document.getElementById('paginationControls').style.display = 'none';
        return;
    }
    
    document.getElementById('paginationControls').style.display = 'flex';
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
    
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
}

function changePage(direction) {
    const totalPages = Math.ceil(filteredActivities.length / itemsPerPage);
    const newPage = currentPage + direction;
    
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderActivities();
        document.getElementById('activityLog').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function showActivityDetails(activity) {
    document.getElementById('detailAction').textContent = getActionText(activity.action);
    document.getElementById('detailUser').textContent = `${activity.user} (${activity.userType})`;
    document.getElementById('detailFile').textContent = activity.file;
    document.getElementById('detailCategory').textContent = capitalizeFirst(activity.category);
    document.getElementById('detailDateTime').textContent = new Date(activity.timestamp).toLocaleString();
    const commentRow = document.getElementById('detailCommentRow');
    if (activity.comments) {
        document.getElementById('detailComments').textContent = activity.comments;
        commentRow.style.display = 'flex';
    } else {
        commentRow.style.display = 'none';
    }
    const modal = new bootstrap.Modal(document.getElementById('activityDetailsModal'));
    modal.show();
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}
