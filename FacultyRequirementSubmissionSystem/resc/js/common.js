
function checkSupabaseConnection() {
    const indicator = document.getElementById('supabaseIndicator');
    
    if (typeof supabaseClient !== 'undefined' && supabaseClient !== null) {
        console.log('✓ Supabase client is connected to:', SUPABASE_CONFIG.projectUrl);
        if (indicator) {
            indicator.classList.add('connected');
            indicator.classList.remove('disconnected');
            indicator.title = 'Supabase Connected';
        }
        
        return true;
    } else {
        console.error('✗ Supabase client is not initialized');
        if (indicator) {
            indicator.classList.add('disconnected');
            indicator.classList.remove('connected');
            indicator.title = 'Supabase Disconnected';
        }
        
        return false;
    }
}

function checkUserSession() {
    const user = sessionStorage.getItem('user');
    if (!user) {
        window.location.href = '../../auth/login.html';
        return false;
    }
    return true;
}

function updateHeaderSubtitle() {
    const userStr = sessionStorage.getItem('user');
    const subtitleElement = document.getElementById('topbarSubtitle');
    
    if (!userStr || !subtitleElement) return;
    
    try {
        const user = JSON.parse(userStr);
        let subtitle = 'Portal'; 
        
        if (user.userType === 'admin') {
            if (user.adminLevel === 'super_admin') {
                subtitle = 'Super Administrator Portal';
            } else {
                subtitle = 'Administrator Portal';
            }
        } else if (user.userType === 'professor') {
            const role = (user.role || '').toLowerCase();
            if (role === 'dean') {
                subtitle = 'Dean Portal';
            } else if (role === 'professor' || role === 'faculty') {
                subtitle = 'Professor Portal';
            } else {
                subtitle = 'Faculty Portal';
            }
        } else if (user.userType === 'student') {
            subtitle = 'Student Portal';
        }
        
        subtitleElement.textContent = subtitle;
    } catch (e) {
        console.error('Error updating header subtitle:', e);
    }
}

function isSuperAdmin() {
    const userStr = sessionStorage.getItem('user');
    if (!userStr) return false;
    
    try {
        const user = JSON.parse(userStr);
        return user.userType === 'admin' && user.adminLevel === 'super_admin';
    } catch (e) {
        console.error('Error parsing user session:', e);
        return false;
    }
}

function isAdmin() {
    const userStr = sessionStorage.getItem('user');
    if (!userStr) return false;
    
    try {
        const user = JSON.parse(userStr);
        return user.userType === 'admin';
    } catch (e) {
        console.error('Error parsing user session:', e);
        return false;
    }
}

function requireSuperAdmin() {
    if (!isSuperAdmin()) {
        alert('Access denied. This page is restricted to Super Admins only.');
        window.location.href = 'dashboard.html';
        return false;
    }
    return true;
}

document.addEventListener('DOMContentLoaded', function () {
    checkUserSession();
    checkSupabaseConnection();
    
    const logoutBtn = document.querySelector('.btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function (e) {
            e.preventDefault();
            if (confirm('Are you sure you want to log out?')) {
                // Clear session
                sessionStorage.removeItem('user');
                window.location.href = '../../auth/login.html';
            }
        });
    }

    const helpBtn = document.querySelector('.help-btn');
    if (helpBtn) {
        helpBtn.addEventListener('click', function () {
            alert('For assistance, please contact the CCS System Administrator.');
        });
    }

});
