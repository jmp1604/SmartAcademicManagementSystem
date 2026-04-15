let notificationPollingInterval = null;

async function createNotification(notificationData) {
    try {
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            return { error: 'Supabase not initialized' };
        }
        if (!notificationData.recipient_id) {
            console.error('Cannot create notification: recipient_id is missing');
            return { error: 'recipient_id is required' };
        }

        const notificationPayload = {
            recipient_id: notificationData.recipient_id,
            recipient_type: notificationData.recipient_type,
            notification_type: notificationData.notification_type,
            title: notificationData.title,
            message: notificationData.message,
            related_submission_id: notificationData.related_submission_id || null,
            related_requirement_id: notificationData.related_requirement_id || null,
            department_id: notificationData.department_id || null,
            source_admin_id: notificationData.source_admin_id || null,
            action_required: notificationData.action_required || false,
            action_url: notificationData.action_url || null
        };

        const { data, error } = await supabaseClient
            .from('faculty_requirement_notifications')
            .insert([notificationPayload])
            .select();

        if (error) {
            console.error('Error creating notification:', error);
            return { error };
        }

        console.log('✓ Notification created:', data[0]?.id);
        
        // Optionally log delivery attempt — wrapped so logs table errors never block notifications
        if (data && data[0]) {
            logNotificationDelivery(data[0].id, 'in_app', 'sent').catch(logErr => {
                console.warn('Delivery log failed (non-critical):', logErr);
            });
        }

        return { data: data[0], error: null };
    } catch (err) {
        console.error('Exception creating notification:', err);
        return { error: err.message };
    }
}

async function notifySubmissionApproved(professorId, submissionId, requirementId, departmentId, adminId = null) {
    return createNotification({
        recipient_id: professorId,
        recipient_type: 'professor',
        notification_type: 'submission_approved',
        title: 'Submission Approved ✓',
        message: 'Your submitted requirement has been approved.',
        related_submission_id: submissionId,
        related_requirement_id: requirementId,
        department_id: departmentId,
        source_admin_id: adminId,
        action_required: false,
        action_url: '/faculty-myfiles.html'
    });
}

async function notifySubmissionRejected(professorId, submissionId, requirementId, departmentId, remarks = '', adminId = null) {
    return createNotification({
        recipient_id: professorId,
        recipient_type: 'professor',
        notification_type: 'submission_rejected',
        title: 'Submission Rejected ✗',
        message: `Your submitted requirement was rejected. ${remarks ? 'Remarks: ' + remarks : 'Please contact your administrator for more details.'}`,
        related_submission_id: submissionId,
        related_requirement_id: requirementId,
        department_id: departmentId,
        source_admin_id: adminId,
        action_required: true,
        action_url: '/faculty-myfiles.html'
    });
}

async function notifyAdminNewSubmission(adminId, submissionId, requirementId, departmentId, professorName = '') {
    return createNotification({
        recipient_id: adminId,
        recipient_type: 'admin',
        notification_type: 'new_submission',
        title: 'New Submission Received',
        message: `New submission received from ${professorName || 'a faculty member'}. Review required.`,
        related_submission_id: submissionId,
        related_requirement_id: requirementId,
        department_id: departmentId,
        source_admin_id: adminId,
        action_required: true,
        action_url: '/filesmanagement.html'
    });
}

async function notifyDeadlineReminder(professorId, requirementId, departmentId, deadline, requirementName = '') {
    const remainingDays = Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
    
    return createNotification({
        recipient_id: professorId,
        recipient_type: 'professor',
        notification_type: 'deadline_reminder',
        title: `Deadline Reminder: ${remainingDays} days left`,
        message: `The deadline for "${requirementName}" is approaching (${new Date(deadline).toLocaleDateString()}). Please submit your requirement soon.`,
        related_requirement_id: requirementId,
        department_id: departmentId,
        action_required: true,
        action_url: '/faculty-upload.html'
    });
}

async function notifyResubmissionRequested(professorId, submissionId, requirementId, departmentId, reason = '', adminId = null) {
    return createNotification({
        recipient_id: professorId,
        recipient_type: 'professor',
        notification_type: 'resubmission_requested',
        title: 'Resubmission Required',
        message: `Please resubmit your requirement. ${reason ? 'Reason: ' + reason : ''}`,
        related_submission_id: submissionId,
        related_requirement_id: requirementId,
        department_id: departmentId,
        source_admin_id: adminId,
        action_required: true,
        action_url: '/faculty-upload.html'
    });
}


async function notifyNewRequirement(departmentId, requirementId, requirementName = '', deadline = null, adminId = null) {
    try {
        // Get all professors in the department
        const { data: professors, error: profError } = await supabaseClient
            .from('professors')
            .select('professor_id')
            .eq('department_id', departmentId);

        if (profError) {
            console.error('Error fetching professors:', profError);
            return { error: profError };
        }

        if (!professors || professors.length === 0) {
            console.warn('No professors found in department:', departmentId);
            return { data: [], error: null };
        }

        // Create notification for each professor
        const notifications = professors.map(prof => ({
            recipient_id: prof.professor_id,
            recipient_type: 'professor',
            notification_type: 'new_requirement',
            title: 'New Requirement Added',
            message: `A new requirement "${requirementName}" has been added to your department. ${deadline ? `Deadline: ${new Date(deadline).toLocaleDateString()}` : ''}`,
            related_requirement_id: requirementId,
            department_id: departmentId,
            source_admin_id: adminId,
            action_required: true,
            action_url: '/faculty-upload.html'
            // created_at intentionally omitted — Supabase uses DEFAULT now()
        }));

        const { data, error } = await supabaseClient
            .from('faculty_requirement_notifications')
            .insert(notifications)
            .select();

        if (error) {
            console.error('Error creating notifications:', error);
            return { error };
        }

        console.log('✓ Created', data.length, 'new requirement notifications');
        return { data, error: null };
    } catch (err) {
        console.error('Exception in notifyNewRequirement:', err);
        return { error: err.message };
    }
}

// Check requirements for upcoming deadlines and send notifications
async function checkAndNotifyDeadlines() {
    console.log('🔍 checkAndNotifyDeadlines() called');
    try {
        const user = getCurrentUser();
        console.log('📌 Current user:', user);
        if (!user?.id) {
            console.log('❌ No user logged in, skipping deadline notifications');
            return;
        }

        if (!supabaseClient) {
            console.error('❌ Supabase client not initialized');
            return;
        }

        console.log('📡 Fetching requirements from database...');
        // Get all active requirements for this professor's department
        const { data: requirements, error } = await supabaseClient
            .from('requirements')
            .select('id, name, deadline, department_id')
            .eq('department_id', user.departmentId)
            .not('deadline', 'is', null);

        console.log('📊 Fetch result - Error:', error, 'Requirements count:', requirements?.length);

        if (error) {
            console.error('❌ Error fetching requirements:', error);
            return;
        }

        if (!requirements || requirements.length === 0) {
            console.log('⚠️ No requirements with deadlines found');
            return;
        }

        console.log('✅ Found', requirements.length, 'requirement(s) with deadlines');
        
        const now = new Date();
        console.log('⏰ Current time:', now.toISOString(), '(local:', now.toLocaleString(), ')');

        // Check each requirement and send notification based on deadline windows
        for (const req of requirements) {
            const deadline = new Date(req.deadline);
            const daysUntil = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));

            console.log(`📋 Requirement: "${req.name}"`);
            console.log(`   Deadline: ${deadline.toISOString()} (local: ${deadline.toLocaleString()})`);
            console.log(`   Now: ${now.toISOString()} (local: ${now.toLocaleString()})`);
            console.log(`   Days until: ${daysUntil}`);

            // Determine which notification window applies (using <= instead of exact match)
            let notificationWindow = null;
            if (daysUntil <= 1) {
                notificationWindow = 'deadline_reminder_1day';
                console.log(`✓ Within 1-day window!`);
            } else if (daysUntil <= 3) {
                notificationWindow = 'deadline_reminder_3day';
                console.log(`✓ Within 3-day window!`);
            } else if (daysUntil <= 7) {
                notificationWindow = 'deadline_reminder_7day';
                console.log(`✓ Within 7-day window!`);
            } else {
                console.log(`✗ NOT in any notification window (${daysUntil} days - checking for <= 7, <= 3, <= 1)`);
            }

            // If within a notification window, check if we already sent it
            if (notificationWindow) {
                console.log(`Checking notification for "${req.name}" (window: ${notificationWindow})`);

                // Check if we already notified for this deadline window
                const { data: existingNotif, error: notifCheckErr } = await supabaseClient
                    .from('faculty_requirement_notifications')
                    .select('id')
                    .eq('recipient_id', user.id)
                    .eq('related_requirement_id', req.id)
                    .eq('notification_type', 'deadline_reminder')
                    .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()) // Within last 24 hours
                    .limit(1);

                if (notifCheckErr) {
                    console.warn('Error checking existing notifications:', notifCheckErr);
                    continue;
                }

                // Only send if no recent notification for this requirement
                if (!existingNotif || existingNotif.length === 0) {
                    const result = await notifyDeadlineReminder(
                        user.id,
                        req.id,
                        req.department_id,
                        req.deadline,
                        req.name
                    );

                    if (!result.error) {
                        console.log(`✓ Deadline notification sent for "${req.name}" (${daysUntil} days left)`);
                    }
                } else {
                    console.log(`⊘ Notification already sent for "${req.name}" in the last 24 hours`);
                }
            } else {
                console.log(`✗ NOT in notification window for "${req.name}" (${daysUntil} days - checking for [7, 3, 1])`);
            }
        }
    } catch (err) {
        console.error('Exception in checkAndNotifyDeadlines:', err);
    }
}

async function getUnreadNotifications(userId = null) {
    try {
        if (!userId) {
            const user = getCurrentUser();
            userId = user?.id;
        }

        const { data, error } = await supabaseClient
            .from('faculty_requirement_notifications')
            .select('*')
            .eq('recipient_id', userId)
            .eq('is_read', false)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error fetching unread notifications:', err);
        return [];
    }
}

async function getNotifications(userId = null, page = 0, pageSize = 20) {
    try {
        if (!userId) {
            const user = getCurrentUser();
            userId = user?.id;
        }

        const start = page * pageSize;
        const end = start + pageSize - 1;

        const { data, error, count } = await supabaseClient
            .from('faculty_requirement_notifications')
            .select('*', { count: 'exact' })
            .eq('recipient_id', userId)
            .order('created_at', { ascending: false })
            .range(start, end);

        if (error) throw error;

        return {
            notifications: data || [],
            totalCount: count || 0,
            page,
            pageSize,
            totalPages: Math.ceil((count || 0) / pageSize)
        };
    } catch (err) {
        console.error('Error fetching notifications:', err);
        return {
            notifications: [],
            totalCount: 0,
            page,
            pageSize,
            totalPages: 0
        };
    }
}

async function getUnreadNotificationCount(userId = null) {
    try {
        if (!userId) {
            const user = getCurrentUser();
            userId = user?.id;
        }

        const { count, error } = await supabaseClient
            .from('faculty_requirement_notifications')
            .select('*', { count: 'exact', head: true })
            .eq('recipient_id', userId)
            .eq('is_read', false);

        if (error) throw error;
        return count || 0;
    } catch (err) {
        console.error('Error fetching unread count:', err);
        return 0;
    }
}

async function getNotificationsByType(userId = null, notificationType) {
    try {
        if (!userId) {
            const user = getCurrentUser();
            userId = user?.id;
        }

        const { data, error } = await supabaseClient
            .from('faculty_requirement_notifications')
            .select('*')
            .eq('recipient_id', userId)
            .eq('notification_type', notificationType)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error(`Error fetching ${notificationType} notifications:`, err);
        return [];
    }
}

async function markNotificationAsRead(notificationId) {
    try {
        const { data, error } = await supabaseClient
            .from('faculty_requirement_notifications')
            .update({
                is_read: true,
                read_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', notificationId)
            .select();

        if (error) throw error;
        console.log('✓ Notification marked as read:', notificationId);
        return { data: data[0], error: null };
    } catch (err) {
        console.error('Error marking notification as read:', err);
        return { error: err.message };
    }
}

async function markAllNotificationsAsRead(userId = null) {
    try {
        if (!userId) {
            const user = getCurrentUser();
            userId = user?.id;
        }

        const { error } = await supabaseClient
            .from('faculty_requirement_notifications')
            .update({
                is_read: true,
                read_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('recipient_id', userId)
            .eq('is_read', false);

        if (error) throw error;
        console.log('✓ All notifications marked as read');
        return { error: null };
    } catch (err) {
        console.error('Error marking all as read:', err);
        return { error: err.message };
    }
}

/**
 * Delete a notification
 * @param {UUID} notificationId - Notification ID
 * @returns {Promise<Object>}
 */
async function deleteNotification(notificationId) {
    try {
        const { error } = await supabaseClient
            .from('faculty_requirement_notifications')
            .delete()
            .eq('id', notificationId);

        if (error) throw error;
        console.log('✓ Notification deleted:', notificationId);
        return { error: null };
    } catch (err) {
        console.error('Error deleting notification:', err);
        return { error: err.message };
    }
}

/**
 * Delete all notifications for a user
 * @param {UUID} userId - User ID
 * @returns {Promise<Object>}
 */
async function deleteAllNotifications(userId = null) {
    try {
        if (!userId) {
            const user = getCurrentUser();
            userId = user?.id;
        }

        const { error } = await supabaseClient
            .from('faculty_requirement_notifications')
            .delete()
            .eq('recipient_id', userId);

        if (error) throw error;
        console.log('✓ All notifications deleted for user:', userId);
        return { error: null };
    } catch (err) {
        console.error('Error deleting all notifications:', err);
        return { error: err.message };
    }
}

async function logNotificationDelivery(notificationId, deliveryMethod, status, errorMessage = null) {
    try {
        const logData = {
            notification_id: notificationId,
            delivery_method: deliveryMethod,
            delivery_status: status,
            delivery_timestamp: new Date().toISOString(),
            error_message: errorMessage,
            retry_count: 0
        };

        const { data, error } = await supabaseClient
            .from('faculty_requirement_notification_logs')
            .insert([logData])
            .select();

        if (error) throw error;
        console.log('✓ Delivery logged:', { notificationId, status });
        return { data: data[0], error: null };
    } catch (err) {
        console.error('Error logging delivery:', err);
        return { error: err.message };
    }
}

/**
 * Get delivery log for a notification
 * @param {UUID} notificationId - Notification ID
 * @returns {Promise<Array>}
 */
async function getNotificationDeliveryLog(notificationId) {
    try {
        const { data, error } = await supabaseClient
            .from('faculty_requirement_notification_logs')
            .select('*')
            .eq('notification_id', notificationId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error fetching delivery log:', err);
        return [];
    }
}

async function getNotificationPreferences(userId = null) {
    try {
        if (!userId) {
            const user = getCurrentUser();
            userId = user?.id;
        }

        const { data, error } = await supabaseClient
            .from('faculty_requirement_notification_preferences')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error fetching preferences:', err);
        return [];
    }
}

async function updateNotificationPreference(userId = null, notificationType, enabled = true, deliveryMethods = 'in_app') {
    try {
        if (!userId) {
            const user = getCurrentUser();
            userId = user?.id;
        }

        // Try to update first
        const { data: existing } = await supabaseClient
            .from('faculty_requirement_notification_preferences')
            .select('id')
            .eq('user_id', userId)
            .eq('notification_type', notificationType)
            .single();

        let result;
        if (existing) {
            // Update existing
            result = await supabaseClient
                .from('faculty_requirement_notification_preferences')
                .update({
                    enabled, 
                    delivery_methods: deliveryMethods,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select();
        } else {
            // Create new
            result = await supabaseClient
                .from('faculty_requirement_notification_preferences')
                .insert([{
                    user_id: userId,
                    notification_type: notificationType,
                    enabled,
                    delivery_methods: deliveryMethods,
                    created_at: new Date().toISOString()
                }])
                .select();
        }

        if (result.error) throw result.error;
        console.log('✓ Preference updated:', notificationType);
        return { data: result.data[0], error: null };
    } catch (err) {
        console.error('Error updating preference:', err);
        return { error: err.message };
    }
}

async function updateNotificationBadge(useLocalElement = false) {
    try {
        const count = await getUnreadNotificationCount();
        
        // Update badge element
        const badges = document.querySelectorAll('[data-notification-badge]');
        badges.forEach(badge => {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-block' : 'none';
            badge.className = 'notification-badge ' + (count > 0 ? 'has-notifications' : '');
        });

        // Optional: Update bell icon animation
        const bells = document.querySelectorAll('[data-notification-bell]');
        bells.forEach(bell => {
            if (count > 0) {
                bell.classList.add('has-unread');
            } else {
                bell.classList.remove('has-unread');
            }
        });

        return count;
    } catch (err) {
        console.error('Error updating notification badge:', err);
        return 0;
    }
}

function renderNotifications(notifications, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('Container not found:', containerId);
        return;
    }

    if (!notifications || notifications.length === 0) {
        container.innerHTML = '<div class="empty-state">No notifications</div>';
        return;
    }

    const notificationHTML = notifications.map(notif => `
        <div class="notification-item ${notif.is_read ? 'read' : 'unread'} notification-${notif.notification_type}">
            <div class="notification-header">
                <h5 class="notification-title">${escapeHtml(notif.title)}</h5>
                <small class="notification-time">${formatTimeAgo(notif.created_at)}</small>
            </div>
            <p class="notification-message">${escapeHtml(notif.message)}</p>
            ${notif.action_required ? '<div class="action-badge">Action Required</div>' : ''}
            <div class="notification-actions">
                ${!notif.is_read ? `<button class="btn-small" onclick="markNotificationAsRead('${notif.id}')">Mark as Read</button>` : ''}
                ${notif.action_url ? `<a href="${notif.action_url}" class="btn-small btn-primary">View</a>` : ''}
                <button class="btn-small btn-danger" onclick="deleteNotification('${notif.id}')">Delete</button>
            </div>
        </div>
    `).join('');

    container.innerHTML = notificationHTML;
}

function formatTimeAgo(date) {
    let dateObj;

    if (typeof date === 'string') {
        // Supabase returns UTC timestamps without 'Z' — append it so JS parses correctly
        const normalized = date.endsWith('Z') || date.includes('+') ? date : date + 'Z';
        dateObj = new Date(normalized);
    } else {
        dateObj = date instanceof Date ? date : new Date(date);
    }

    const now = new Date();
    const seconds = Math.floor((now - dateObj) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return dateObj.toLocaleDateString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function startNotificationPolling(interval = 30000) {
    console.log('Starting notification polling...');
    
    // Initial load
    updateNotificationBadge();
    
    // Poll at intervals
    notificationPollingInterval = setInterval(() => {
        updateNotificationBadge();
    }, interval);
}

function stopNotificationPolling() {
    if (notificationPollingInterval) {
        clearInterval(notificationPollingInterval);
        notificationPollingInterval = null;
        console.log('Stopped notification polling');
    }
}

function subscribeToNotifications() {
    try {
        const user = getCurrentUser();
        if (!user?.id) {
            console.warn('User not authenticated');
            return;
        }

        const channel = supabaseClient
            .channel(`notifications:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'faculty_requirement_notifications',
                    filter: `recipient_id=eq.${user.id}`
                },
                (payload) => {
                    console.log('New notification received:', payload.new);
                    updateNotificationBadge();
                    
                    // Show toast notification
                    if (window.showNotificationToast) {
                        showNotificationToast(payload.new.title, payload.new.message);
                    }
                }
            )
            .subscribe();

        console.log('✓ Subscribed to real-time notifications');
        return channel;
    } catch (err) {
        console.error('Error subscribing to notifications:', err);
        return null;
    }
}

function unsubscribeFromNotifications(channel) {
    if (channel) {
        supabaseClient.removeChannel(channel);
        console.log('Unsubscribed from notifications');
    }
}