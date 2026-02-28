function loadUserInfo() {
    const userStr = sessionStorage.getItem('user');
    if (!userStr) {
        window.location.href = '../../auth/login.html';
        return;
    }
    
    try {
        const user = JSON.parse(userStr);
        const userName = document.getElementById('userName');
        const userAvatar = document.getElementById('userAvatar');
        const userAvatarLarge = document.getElementById('userAvatarLarge');
        const userFullName = document.getElementById('userFullName');
        const userEmail = document.getElementById('userEmail');
        
        let fullName = 'User';
        let email = 'user@email.com';
        let initials = 'U';
        
        if (user.userType === 'professor') {
            fullName = `${user.firstName} ${user.middleName ? user.middleName + ' ' : ''}${user.lastName}`;
            email = user.email || user.schoolEmail || 'faculty@plpasig.edu.ph';
            initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`;
        } else if (user.userType === 'admin') {
            fullName = user.adminName || 'Admin User';
            email = user.email || 'admin@plpasig.edu.ph';
            initials = user.adminName ? user.adminName.split(' ').map(n => n.charAt(0)).join('').substring(0, 2) : 'A';
        }
        
        if (userName) userName.textContent = fullName;
        if (userAvatar) userAvatar.textContent = initials.toUpperCase();
        if (userAvatarLarge) userAvatarLarge.textContent = initials.toUpperCase();
        if (userFullName) userFullName.textContent = fullName;
        if (userEmail) userEmail.textContent = email;
        
    } catch (e) {
        console.error('Error loading user info:', e);
        window.location.href = '../../auth/login.html';
    }
}

function initUserDropdown() {
    const userMenuToggle = document.getElementById('userMenuToggle');
    const userDropdown = document.getElementById('userDropdown');
    const logoutBtn = document.getElementById('logoutBtn');
    const viewProfile = document.getElementById('viewProfile');
    const accountSettings = document.getElementById('accountSettings');
    
    console.log('initUserDropdown called', {
        userMenuToggle: !!userMenuToggle,
        userDropdown: !!userDropdown,
        logoutBtn: !!logoutBtn
    });
    
    if (!userMenuToggle || !userDropdown) {
        console.log('Missing required elements - initUserDropdown aborted');
        return;
    }
    userMenuToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        console.log('User menu toggle clicked');
        userDropdown.classList.toggle('show');
        console.log('Dropdown classes after toggle:', userDropdown.className);
    });
    document.addEventListener('click', function(e) {
        if (!userMenuToggle.contains(e.target) && !userDropdown.contains(e.target)) {
            userDropdown.classList.remove('show');
        }
    });
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (confirm('Are you sure you want to logout?')) {
                sessionStorage.removeItem('user');
                sessionStorage.clear();
                window.location.href = '../../auth/login.html';
            }
        });
    }
    if (viewProfile) {
        viewProfile.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Profile page coming soon!');
            userDropdown.classList.remove('show');
        });
    }

    if (accountSettings) {
        accountSettings.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Account settings coming soon!');
            userDropdown.classList.remove('show');
        });
    }
}

function checkFacultySession() {
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
    checkFacultySession();
    const currentPage = window.location.pathname.split('/').pop();
    document.querySelectorAll('.nav-item').forEach(function (el) {
        if (el.getAttribute('href') === currentPage) {
            el.classList.add('active');
        }
    });
    const helpBtn = document.querySelector('.help-btn');
    if (helpBtn) {
        helpBtn.addEventListener('click', function () {
            alert('For assistance, please contact the CCS System Administrator.');
        });
    }
});
