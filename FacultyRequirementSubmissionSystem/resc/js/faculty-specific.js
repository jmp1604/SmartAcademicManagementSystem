/* ═══════════════════════════════════════════
   faculty-specific.js — Faculty module utilities
   Dependencies: global.js (for shared functions)
   ═══════════════════════════════════════════ */

// Faculty-specific session check (different redirect path)  
function checkFacultySession() {
    const user = sessionStorage.getItem('user');
    if (!user) {
        window.location.href = '../../auth/login.html';
        return false;
    }
    return true;
}

// Update header subtitle based on user role (faculty-specific)
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

function requireSuperAdmin() {
    if (!isSuperAdmin()) {
        alert('Access denied. This page is restricted to Super Admins only.');
        window.location.href = 'dashboard.html';
        return false;
    }
    return true;
}

// Initialize faculty-specific features
document.addEventListener('DOMContentLoaded', function () {
    checkFacultySession();
    updateHeaderSubtitle();
});
