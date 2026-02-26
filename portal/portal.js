document.addEventListener('DOMContentLoaded', function () {
    checkUserSession();
    displayUserInfo();
    showAdminCardIfNeeded();

    const logoutBtn = document.querySelector('.btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function () {
            if (confirm('Are you sure you want to log out?')) {
                sessionStorage.removeItem('user');
                window.location.href = '../auth/login.html';
            }
        });
    }

    const helpBtn = document.querySelector('.help-btn');
    if (helpBtn) {
        helpBtn.addEventListener('click', function () {
            alert('For assistance, please contact the CCS System Administrator.');
        });
    }

    const cards = document.querySelectorAll('.system-card');
    cards.forEach(function (card) {
        card.addEventListener('click', function (e) {
            // Href is already set on the <a> tag; this handler can be used
            // for analytics or transition effects in the future.
            // Example: add a ripple / loading state before navigating
            card.style.opacity = '0.8';
            card.style.transform = 'scale(0.98)';
            setTimeout(function () {
                card.style.opacity = '';
                card.style.transform = '';
            }, 200);
        });
    });

});

function showAdminCardIfNeeded() {
    // System Administration card removed - not needed
    // Super admins go directly to user management
    // Regular admins access module-specific features
}

function checkUserSession() {
    const user = sessionStorage.getItem('user');
    if (!user) {
        window.location.href = '../auth/login.html';
    }
}

function displayUserInfo() {
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            const userNameEl = document.querySelector('.user-name');
            if (userNameEl) {
                const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
                userNameEl.textContent = fullName;
            }
            
            const userRoleEl = document.querySelector('.user-role');
            if (userRoleEl && user.role) {
                userRoleEl.textContent = capitalizeFirst(user.role);
            }

            const userAvatarEl = document.querySelector('.user-avatar');
            if (userAvatarEl) {
                const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
                const initials = getInitials(fullName);
                userAvatarEl.textContent = initials;
            }
        } catch (e) {
            console.error('Error parsing user session:', e);
        }
    }
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function getInitials(name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}