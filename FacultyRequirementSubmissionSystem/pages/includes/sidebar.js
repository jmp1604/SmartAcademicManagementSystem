function loadHeader() {
    const headerHTML = `
    <header class="topbar">
        <div class="topbar-left">
            <img src="../../auth/assets/plplogo.png" alt="PLP" class="topbar-logo"/>
            <img src="../../auth/assets/ccslogo.png" alt="CCS" class="topbar-logo-ccs"/>
            <div class="topbar-info">
                <span class="topbar-title">CCS Faculty Requirement Submission System</span>
                <span class="topbar-subtitle" id="topbarSubtitle">Faculty Portal</span>
            </div>
        </div>
        <div class="user-menu-wrapper">
            <div class="user-pill" id="userMenuToggle">
                <div class="user-avatar" id="userAvatar">--</div>
                <span class="user-name" id="userName">Loading...</span>
                <svg class="dropdown-arrow" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="user-dropdown" id="userDropdown">
                <div class="user-dropdown-header">
                    <div class="user-avatar-large" id="userAvatarLarge">--</div>
                    <div class="user-dropdown-info">
                        <div class="user-dropdown-name" id="userFullName">Loading...</div>
                        <div class="user-dropdown-email" id="userEmail">loading@email.com</div>
                    </div>
                </div>
                <div class="user-dropdown-divider"></div>
                <a href="#" class="user-dropdown-item" id="viewProfile">
                    <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    View Profile
                </a>
                <a href="#" class="user-dropdown-item" id="accountSettings">
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m5.2-15.8l-4.2 4.2m-1.8 1.8l-4.2 4.2M23 12h-6m-6 0H1m15.8 5.2l-4.2-4.2m-1.8-1.8l-4.2-4.2"/></svg>
                    Account Settings
                </a>
                <div class="user-dropdown-divider"></div>
                <a href="#" class="user-dropdown-item logout-item" id="logoutBtn">
                    <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Logout
                </a>
            </div>
        </div>
    </header>`;
    
    const headerContainer = document.getElementById('header-container');
    if (headerContainer) {
        console.log('Loading header HTML...');
        headerContainer.innerHTML = headerHTML;
        setTimeout(() => {
            console.log('Initializing header functions...');
            if (typeof loadUserInfo === 'function') {
                loadUserInfo();
            }
            if (typeof initUserDropdown === 'function') {
                initUserDropdown();
            }
            if (typeof updateHeaderSubtitle === 'function') {
                updateHeaderSubtitle();
            }
        }, 0);
    } else {
        console.error('header-container not found!');
    }
}

function loadSidebar(activePage) {
    let userStr = sessionStorage.getItem('user');
    let isSuperAdmin = false;
    let isProfessor = false;
    let isDean = false;
    let user = null;
    
    if (userStr) {
        try {
            user = JSON.parse(userStr);
            isSuperAdmin = user.userType === 'admin' && user.adminLevel === 'super_admin';
            isProfessor = user.userType === 'professor';
            isDean = user.userType === 'professor' && user.role === 'dean';
        } catch (e) {
            console.error('Error parsing user session:', e);
        }
    }
    
    if (isDean) {
        const sidebarHTML = `
        <nav class="sidebar">
            <a href="dashboard.html" class="nav-item ${activePage === 'dashboard' ? 'active' : ''}">
                <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                Department Dashboard
            </a>
            <a href="dean-submissions.html" class="nav-item ${activePage === 'dean-submissions' ? 'active' : ''}">
                <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                Monitor Submissions
            </a>
            <a href="dean-flagged.html" class="nav-item ${activePage === 'dean-flagged' ? 'active' : ''}">
                <svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                Flagged Items
            </a>
            <a href="dean-audit.html" class="nav-item ${activePage === 'dean-audit' ? 'active' : ''}">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Audit Trailing
            </a>
            <a href="dean-reports.html" class="nav-item ${activePage === 'dean-reports' ? 'active' : ''}">
                <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                Report Generation
            </a>
            <a href="faculty-upload.html" class="nav-item ${activePage === 'faculty-upload' ? 'active' : ''}">
                <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                My Uploads
            </a>
            <a href="faculty-myfiles.html" class="nav-item ${activePage === 'faculty-myfiles' ? 'active' : ''}">
                <svg viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                My Files
            </a>
        </nav>`;
        
        document.getElementById('sidebar-container').innerHTML = sidebarHTML;
        return;
    }
    
    if (isProfessor) {
        const sidebarHTML = `
        <nav class="sidebar">
            <a href="faculty-upload.html" class="nav-item ${activePage === 'faculty-upload' ? 'active' : ''}">
                <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Upload Files
            </a>
            <a href="faculty-myfiles.html" class="nav-item ${activePage === 'faculty-myfiles' ? 'active' : ''}">
                <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                My Files
            </a>
            <a href="faculty-reports.html" class="nav-item ${activePage === 'faculty-reports' ? 'active' : ''}">
                <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                My Reports
            </a>
        </nav>`;
        
        document.getElementById('sidebar-container').innerHTML = sidebarHTML;
        return;
    }
    
    const userManagementLink = isSuperAdmin ? `
        <a href="../../admin/usermanagement.html" class="nav-item ${activePage === 'usermanagement' ? 'active' : ''}">
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
        <a href="admin-category-management.html" class="nav-item ${activePage === 'admin-category-management' ? 'active' : ''}">
            <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Category Management
        </a>
        <a href="admin-requirement-management.html" class="nav-item ${activePage === 'admin-requirement-management' ? 'active' : ''}">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Requirement Management
        </a>
        <a href="filesmanagement.html" class="nav-item ${activePage === 'filesmanagement' ? 'active' : ''}">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="8" y2="11"/><line x1="12" y1="15" x2="8" y2="15"/></svg>
            Submission Approval
        </a>
        <a href="admin-flagged-submissions.html" class="nav-item ${activePage === 'admin-flagged-submissions' ? 'active' : ''}">
            <svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
            Flagged by Dean
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
