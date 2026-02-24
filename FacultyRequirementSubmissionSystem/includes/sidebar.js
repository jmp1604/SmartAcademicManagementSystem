function loadHeader() {
    const headerHTML = `
    <header class="topbar">
        <div class="topbar-left">
            <img src="../../auth/assets/plplogo.png" alt="PLP" class="topbar-logo"/>
            <img src="../../auth/assets/ccslogo.png" alt="CCS" class="topbar-logo-ccs"/>
            <div class="topbar-info">
                <span class="topbar-title">Faculty Requirement Submission System</span>
                <span class="topbar-subtitle" id="topbarSubtitle">System Administrator Portal</span>
            </div>
        </div>
        <div class="supabase-indicator" id="supabaseIndicator" title="Supabase Connection Status">
            <span class="status-light"></span>
        </div>
        <a href="../../auth/login.html" class="btn-logout">
            <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Logout
        </a>
    </header>`;
    
    document.getElementById('header-container').innerHTML = headerHTML;
    
    if (typeof updateHeaderSubtitle === 'function') {
        updateHeaderSubtitle();
    }
}

function loadSidebar(activePage) {
    let userStr = sessionStorage.getItem('user');
    let isSuperAdmin = false;
    
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            isSuperAdmin = user.userType === 'admin' && user.adminLevel === 'super_admin';
        } catch (e) {
            console.error('Error parsing user session:', e);
        }
    }
    
    const userManagementLink = isSuperAdmin ? `
        <a href="usermanagement.html" class="nav-item ${activePage === 'usermanagement' ? 'active' : ''}">
            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            User Management
        </a>` : '';
    
    const sidebarHTML = `
    <nav class="sidebar">
        <a href="dashboard.html" class="nav-item ${activePage === 'dashboard' ? 'active' : ''}">
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            System Dashboard
        </a>
        ${userManagementLink}
        <a href="filesmanagement.html" class="nav-item ${activePage === 'filesmanagement' ? 'active' : ''}">
            <svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
            Files Management
        </a>
        <a href="system-settings.html" class="nav-item ${activePage === 'system-settings' ? 'active' : ''}">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            System Settings
        </a>
        <a href="audit-logs.html" class="nav-item ${activePage === 'audit-logs' ? 'active' : ''}">
            <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Audit Logs
        </a>
    </nav>`;
    
    document.getElementById('sidebar-container').innerHTML = sidebarHTML;
}
