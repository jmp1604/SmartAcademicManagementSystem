function checkAdminSession() {
    const user = sessionStorage.getItem('user');
    if (!user) {
        window.location.href = '../auth/login.html';
        return false;
    }
    return true;
}

function requireAdmin() {
    const userStr = sessionStorage.getItem('user');
    
    if (!userStr) {
        window.location.href = '../auth/login.html';
        return false;
    }
    
    if (!isAdmin()) {
        alert('Access denied. This page is restricted to Administrators only.');
        window.location.href = '../portal/portal.html';
        return false;
    }
    return true;
}

function requireSuperAdmin() {
    const userStr = sessionStorage.getItem('user');
    
    if (!userStr) {
        window.location.href = '../auth/login.html';
        return false;
    }
    
    if (!isSuperAdmin()) {
        alert('Access denied. This page is restricted to Super Administrators only.');
        window.location.href = '../portal/portal.html';
        return false;
    }
    return true;
}

function loadHeader() {
    const headerContainer = document.getElementById('header-container');
    if (!headerContainer) return;

    const userStr = sessionStorage.getItem('user');
    let subtitle = 'Administration';
    let userDisplay = 'Administrator';

    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            if (user.adminLevel === 'super_admin') {
                subtitle = 'Super Administrator';
                userDisplay = 'Super Admin';
            } else {
                subtitle = 'Administrator';
                userDisplay = 'Admin';
            }
        } catch (e) {
            console.error('Error parsing user:', e);
        }
    }

    headerContainer.innerHTML = `
        <header class="topbar">
            <div class="topbar-left">
                <img src="../auth/assets/plplogo.png" alt="PLP Logo" class="topbar-logo"/>
                <img src="../auth/assets/ccslogo.png" alt="CCS Logo" class="topbar-logo-ccs"/>
                <div class="topbar-info">
                    <div class="topbar-title">SAMS Admin Panel</div>
                    <div class="topbar-subtitle" id="topbarSubtitle">${subtitle}</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:1rem;">
                <div class="supabase-indicator" id="supabaseIndicator" title="Checking Connection...">
                    <div class="status-light"></div>
                </div>
                <button class="btn-logout">
                    <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Log Out
                </button>
            </div>
        </header>
    `;
}

function loadSidebar(activePage = '') {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;

    const userStr = sessionStorage.getItem('user');
    let isSuperAdmin = false;
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            isSuperAdmin = user.adminLevel === 'super_admin';
        } catch (e) {
            console.error('Error parsing user:', e);
        }
    }

    const userManagementClass = activePage === 'usermanagement' ? 'active' : '';
    const backToPortalLink = isSuperAdmin ? '' : `
            <a href="../portal/portal.html" class="nav-item">
                <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                Back to Portal
            </a>`;

    sidebarContainer.innerHTML = `
        <nav class="sidebar">
            ${backToPortalLink}
            <a href="usermanagement.html" class="nav-item ${userManagementClass}">
                <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                User Management
            </a>
        </nav>
    `;
}

document.addEventListener('DOMContentLoaded', function () {
    checkAdminSession();
});
