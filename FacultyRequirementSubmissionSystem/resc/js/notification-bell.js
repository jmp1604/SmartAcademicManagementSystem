/**
 * Notification Bell Component
 * Displays a bell icon with dropdown panel showing recent notifications
 * Works for both professors and admins
 */

class NotificationBell {
    constructor(options = {}) {
        this.options = {
            maxNotifications: options.maxNotifications || 8,
            pollingInterval: options.pollingInterval || 30000,
            containerId: options.containerId || 'notificationBellContainer',
            ...options
        };
        
        this.isOpen = false;
        this.pollingTimer = null;
        this.notifications = [];
        this.init();
    }

    async init() {
        try {
            this.createBellHTML();
            this.attachEventListeners();
            // Try to load notifications, but don't block rendering
            this.loadNotifications().catch(err => {
                console.warn('Failed to load notifications:', err);
            });
            this.startPolling();
            console.log('✓ Notification bell initialized');
        } catch (err) {
            console.error('Error initializing notification bell:', err);
            // Still try to show bell even if something failed
            this.createBellHTML();
            this.attachEventListeners();
        }
    }

    createBellHTML() {
        const container = document.getElementById(this.options.containerId);
        if (!container) {
            console.warn(`Container ${this.options.containerId} not found`);
            return;
        }

        // Ensure container is visible
        container.style.display = 'flex';
        container.style.alignItems = 'center';

        container.innerHTML = `
            <div class="notification-bell">
                <!-- Bell Icon Button -->
                <button class="bell-icon-btn" id="bellIconBtn" title="Notifications" style="display: flex; align-items: center; justify-content: center;">
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span class="bell-badge" id="notificationBadge" style="display: none;">0</span>
                </button>

                <!-- Dropdown Panel -->
                <div class="notification-panel" id="notificationPanel" style="display: none;">
                    <!-- Panel Header -->
                    <div class="panel-header">
                        <h3>Notifications</h3>
                        <button class="close-btn" id="closePanelBtn" title="Close">×</button>
                    </div>

                    <!-- Panel Content -->
                    <div class="panel-content" id="panelContent">
                        <div class="loading">Loading notifications...</div>
                    </div>
                </div>
            </div>
        `;
        
        console.log('✓ Bell HTML created in container');
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        const bellBtn = document.getElementById('bellIconBtn');
        const closeBtn = document.getElementById('closePanelBtn');
        const viewAllBtn = document.getElementById('viewAllBtn');
        const panel = document.getElementById('notificationPanel');

        if (bellBtn) {
            bellBtn.addEventListener('click', () => this.togglePanel());
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closePanel());
        }

        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isOpen && !e.target.closest('.notification-bell')) {
                this.closePanel();
            }
        });

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closePanel();
            }
        });
    }

    /**
     * Load notifications from database
     */
    async loadNotifications() {
        try {
            const user = getCurrentUser();
            if (!user?.id) {
                console.warn('User not authenticated');
                return;
            }

            const result = await getNotifications(user.id, 0, this.options.maxNotifications);
            this.notifications = result.notifications || [];
            
            await this.updateBadge(user.id);
            this.renderNotifications();
        } catch (err) {
            console.error('Error loading notifications:', err);
        }
    }

    /**
     * Update the badge count
     */
    async updateBadge(userId) {
        try {
            const count = await getUnreadNotificationCount(userId);
            const badge = document.getElementById('notificationBadge');
            
            if (badge) {
                if (count > 0) {
                    badge.textContent = count > 99 ? '99+' : count;
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (err) {
            console.error('Error updating badge:', err);
        }
    }

    renderNotifications() {
        const content = document.getElementById('panelContent');
        if (!content) return;

        if (!this.notifications || this.notifications.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <p>No notifications yet</p>
                </div>
            `;
            return;
        }

        const html = this.notifications.map(notif => `
            <div class="notification-item ${notif.is_read ? 'read' : 'unread'} type-${notif.notification_type}">
                <!-- Icon & Type Badge -->
                <div class="notif-icon">
                    ${this.getNotificationIcon(notif.notification_type)}
                </div>

                <!-- Content -->
                <div class="notif-content">
                    <div class="notif-title">${escapeHtml(notif.title)}</div>
                    <div class="notif-message">${escapeHtml(notif.message)}</div>
                    <div class="notif-time">${formatTimeAgo(notif.created_at)}</div>
                </div>

                <!-- Actions -->
                <div class="notif-actions">
                    ${!notif.is_read ? `
                        <button class="action-btn" 
                                onclick="event.stopPropagation(); window.notificationBellInstance.markAsRead('${notif.id}')" 
                                title="Mark as read">
                            ✓
                        </button>
                    ` : ''}
                    <button class="action-btn delete" 
                            onclick="event.stopPropagation(); window.notificationBellInstance.deleteNotification('${notif.id}')" 
                            title="Delete">
                        🗑️
                    </button>
                </div>
            </div>
        `).join('');

        content.innerHTML = html;
    }

    /**
     * Get icon for notification type
     */
    getNotificationIcon(type) {
        const icons = {
            'submission_approved': '✅',
            'submission_rejected': '❌',
            'new_submission': '📤',
            'deadline_reminder': '⏰',
            'resubmission_requested': '🔄',
            'new_requirement': '📋'
        };
        return icons[type] || '📬';
    }

    /**
     * Mark notification as read
     */
    async markAsRead(notificationId) {
        try {
            const result = await markNotificationAsRead(notificationId);
            if (!result.error) {
                const user = getCurrentUser();
                await this.updateBadge(user?.id);
                await this.loadNotifications();
            }
        } catch (err) {
            console.error('Error marking as read:', err);
        }
    }

    /**
     * Delete notification
     */
    async deleteNotification(notificationId) {
        try {
            const result = await deleteNotification(notificationId);
            if (!result.error) {
                const user = getCurrentUser();
                await this.updateBadge(user?.id);
                await this.loadNotifications();
            }
        } catch (err) {
            console.error('Error deleting notification:', err);
        }
    }

    /**
     * Toggle panel visibility
     */
    togglePanel() {
        if (this.isOpen) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    }

    /**
     * Open the panel
     */
    openPanel() {
        const panel = document.getElementById('notificationPanel');
        const btn = document.getElementById('bellIconBtn');
        
        if (panel && btn) {
            panel.style.display = 'block';
            btn.classList.add('active');
            this.isOpen = true;
        }
    }

    /**
     * Close the panel
     */
    closePanel() {
        const panel = document.getElementById('notificationPanel');
        const btn = document.getElementById('bellIconBtn');
        
        if (panel && btn) {
            panel.style.display = 'none';
            btn.classList.remove('active');
            this.isOpen = false;
        }
    }

    /**
     * Start polling for new notifications
     */
    startPolling() {
        this.pollingTimer = setInterval(async () => {
            await this.loadNotifications();
        }, this.options.pollingInterval);
    }

    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
    }

    /**
     * Refresh notifications manually
     */
    async refresh() {
        await this.loadNotifications();
    }

    /**
     * Destroy the component
     */
    destroy() {
        this.stopPolling();
        const container = document.getElementById(this.options.containerId);
        if (container) {
            container.innerHTML = '';
        }
    }
}

window.notificationBellInstance = null;

function initNotificationBell(options = {}) {
    const create = () => {
        if (!window.notificationBellInstance) {
            window.notificationBellInstance = new NotificationBell(options);
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', create);
    } else {
        create(); 
    }
}

window.addEventListener('beforeunload', () => {
    if (notificationBellInstance) {
        notificationBellInstance.destroy();
    }
});
