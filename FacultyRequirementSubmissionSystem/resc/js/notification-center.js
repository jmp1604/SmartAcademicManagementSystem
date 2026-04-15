/**
 * Faculty Requirement Submission System - Notification Center
 * Page for viewing and managing notifications
 * 
 * Include this in: pages/notification-center.html
 */

let currentPage = 0;
const pageSize = 10;
let totalPages = 1;
let allLoadedNotifications = [];
let currentFilterType = null;

document.addEventListener('DOMContentLoaded', async function() {
    const userStr = sessionStorage.getItem('user');
    if (!userStr) {
        window.location.href = '../../auth/login.html';
        return;
    }

    try {
        const user = JSON.parse(userStr);
        console.log('User:', user);
    } catch (err) {
        console.error('Error parsing user:', err);
        window.location.href = '../../auth/login.html';
        return;
    }

    // Initialize notification system
    initializeNotificationCenter();
});

/**
 * Initialize the notification center
 */
async function initializeNotificationCenter() {
    // Load initial notifications
    await loadAndDisplayNotifications();

    // Setup event listeners
    setupEventListeners();

    // Start polling for new notifications
    startNotificationPolling(30000);
}

/**
 * Load notifications and display them
 */
async function loadAndDisplayNotifications() {
    try {
        const result = await getNotifications(null, currentPage, pageSize);
        
        const { notifications, totalCount, page, pageSize: size, totalPages: pages } = result;
        allLoadedNotifications = notifications;
        totalPages = pages;

        // Render notifications
        renderNotificationsEnhanced(notifications, 'notificationContainer');

        // Update pagination
        updatePaginationControls(page, pages, totalCount);

    } catch (err) {
        console.error('Error loading notifications:', err);
        document.getElementById('notificationContainer').innerHTML = 
            '<div class="empty-state">Error loading notifications. Please try again.</div>';
    }
}

/**
 * Setup event listeners for buttons and filters
 */
function setupEventListeners() {
    // Mark all as read
    const markAllReadBtn = document.getElementById('markAllReadBtn');
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', handleMarkAllAsRead);
    }

    // Delete all
    const deleteAllBtn = document.getElementById('deleteAllBtn');
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', handleDeleteAll);
    }

    // Filter by type
    const filterSelect = document.getElementById('notificationFilter');
    if (filterSelect) {
        filterSelect.addEventListener('change', handleFilterChange);
    }

    // Pagination
    const prevBtn = document.getElementById('prevPage');
    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentPage > 0) {
                currentPage--;
                loadAndDisplayNotifications();
            }
        });
    }

    const nextBtn = document.getElementById('nextPage');
    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentPage < totalPages - 1) {
                currentPage++;
                loadAndDisplayNotifications();
            }
        });
    }
}

/**
 * Handle marking all notifications as read
 */
async function handleMarkAllAsRead() {
    if (confirm('Are you sure you want to mark all notifications as read?')) {
        try {
            await markAllNotificationsAsRead();
            await loadAndDisplayNotifications();
            await updateNotificationBadge();
            alert('All notifications marked as read');
        } catch (err) {
            console.error('Error:', err);
            alert('Error marking notifications as read');
        }
    }
}

/**
 * Handle deleting all notifications
 */
async function handleDeleteAll() {
    if (confirm('Are you sure you want to delete all notifications? This action cannot be undone.')) {
        try {
            await deleteAllNotifications();
            currentPage = 0;
            await loadAndDisplayNotifications();
            await updateNotificationBadge();
            alert('All notifications deleted');
        } catch (err) {
            console.error('Error:', err);
            alert('Error deleting notifications');
        }
    }
}

/**
 * Handle filter change
 */
async function handleFilterChange(event) {
    currentFilterType = event.target.value;
    currentPage = 0;

    try {
        const user = getCurrentUser();
        
        if (!currentFilterType) {
            // Load all notifications
            await loadAndDisplayNotifications();
        } else {
            // Load filtered notifications
            const notifications = await getNotificationsByType(user?.id, currentFilterType);
            
            // Simple pagination for filtered results
            const start = currentPage * pageSize;
            const end = start + pageSize;
            const paginatedNotifications = notifications.slice(start, end);
            
            const totalCount = notifications.length;
            const pages = Math.ceil(totalCount / pageSize);
            totalPages = pages;

            renderNotificationsEnhanced(paginatedNotifications, 'notificationContainer');
            updatePaginationControls(currentPage, pages, totalCount);
        }
    } catch (err) {
        console.error('Error filtering notifications:', err);
    }
}

/**
 * Update pagination controls
 */
function updatePaginationControls(page, pages, totalCount) {
    // Update page info
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) {
        pageInfo.innerHTML = `<span class="page-link">Page ${page + 1} of ${pages} (${totalCount} total)</span>`;
    }

    // Update button states
    const prevBtn = document.getElementById('prevPage');
    if (prevBtn) {
        if (page === 0) {
            prevBtn.classList.add('disabled');
        } else {
            prevBtn.classList.remove('disabled');
        }
    }

    const nextBtn = document.getElementById('nextPage');
    if (nextBtn) {
        if (page >= pages - 1) {
            nextBtn.classList.add('disabled');
        } else {
            nextBtn.classList.remove('disabled');
        }
    }
}

/**
 * Enhanced render function with delete and mark as read functionality
 */
function renderNotificationsEnhanced(notifications, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('Container not found:', containerId);
        return;
    }

    if (!notifications || notifications.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 No notifications</div>';
        return;
    }

    const notificationHTML = notifications.map(notif => `
        <div class="notification-item ${notif.is_read ? 'read' : 'unread'} notification-${notif.notification_type}"
             data-notification-id="${notif.id}">
            
            <div class="notification-header">
                <div class="notification-title-section">
                    <h5 class="notification-title">
                        ${notif.is_read ? '✓ ' : '● '}
                        ${escapeHtml(notif.title)}
                    </h5>
                    ${notif.action_required ? '<span class="action-badge">Action Required</span>' : ''}
                </div>
                <small class="notification-time">${formatTimeAgo(notif.created_at)}</small>
            </div>

            <p class="notification-message">${escapeHtml(notif.message)}</p>

            <div class="notification-metadata">
                <small class="notification-type">Type: ${notif.notification_type.replace(/_/g, ' ').toUpperCase()}</small>
                <small class="notification-date">${new Date(notif.created_at).toLocaleString()}</small>
            </div>

            <div class="notification-actions">
                ${!notif.is_read ? `
                    <button class="btn-small btn-info" 
                            onclick="markSingleNotificationAsRead('${notif.id}')">
                        Mark as Read
                    </button>
                ` : ''}
                ${notif.action_url ? `
                    <a href="${escapeHtml(notif.action_url)}" class="btn-small btn-primary">
                        View Details
                    </a>
                ` : ''}
                <button class="btn-small btn-danger" 
                        onclick="deleteSingleNotification('${notif.id}')">
                    Delete
                </button>
            </div>
        </div>
    `).join('');

    container.innerHTML = notificationHTML;
}

/**
 * Mark a single notification as read with UI update
 */
async function markSingleNotificationAsRead(notificationId) {
    try {
        await markNotificationAsRead(notificationId);
        
        // Update UI
        const element = document.querySelector(`[data-notification-id="${notificationId}"]`);
        if (element) {
            element.classList.remove('unread');
            element.classList.add('read');
            
            // Remove/update the mark as read button
            const btn = element.querySelector('button[onclick*="markSingleNotificationAsRead"]');
            if (btn) btn.remove();
        }

        await updateNotificationBadge();
    } catch (err) {
        console.error('Error marking notification as read:', err);
        alert('Error updating notification');
    }
}

/**
 * Delete a single notification with UI update
 */
async function deleteSingleNotification(notificationId) {
    if (confirm('Delete this notification?')) {
        try {
            await deleteNotification(notificationId);
            
            // Remove from UI with animation
            const element = document.querySelector(`[data-notification-id="${notificationId}"]`);
            if (element) {
                element.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => {
                    element.remove();
                    
                    // Check if empty
                    const container = document.getElementById('notificationContainer');
                    if (container.children.length === 0) {
                        container.innerHTML = '<div class="empty-state">📭 No notifications</div>';
                    }
                }, 300);
            }

            await updateNotificationBadge();
        } catch (err) {
            console.error('Error deleting notification:', err);
            alert('Error deleting notification');
        }
    }
}
