// Update page content based on department
function updatePageDepartmentContent() {
    const userStr = sessionStorage.getItem('user');
    if (!userStr) return;
    
    try {
        const user = JSON.parse(userStr);
        const department = user.department || 'College of Computer Studies';
        
        // Update page header description if it contains "College of Computer Studies"
        const pageDesc = document.querySelector('.page-header p');
        if (pageDesc && pageDesc.textContent.includes('College of Computer Studies')) {
            // Extract the base text and replace the department
            const originalText = pageDesc.textContent;
            const newText = originalText.replace('College of Computer Studies', department);
            pageDesc.textContent = newText;
            console.log('Updated page description to:', newText);
        }
        
        // Update any other elements that reference the old department
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
            if (el.textContent && el.textContent.includes('College of Computer Studies') && el !== pageDesc) {
                // Only update text content if it's just the department reference
                if (el.textContent.trim() === 'College of Computer Studies') {
                    el.textContent = department;
                }
            }
        });
    } catch (e) {
        console.error('Error updating page department content:', e);
    }
}

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
        
        // Load department logo
        if (user.departmentLogo) {
            const deptLogoImg = document.getElementById('deptLogoFaculty');
            if (deptLogoImg) {
                deptLogoImg.src = user.departmentLogo;
                deptLogoImg.alt = user.department || 'Department Logo';
            }
        }
        
    } catch (e) {
        console.error('Error loading user info:', e);
        window.location.href = '../../auth/login.html';
    }
}

function initUserDropdown() {
    const logoutBtn = document.getElementById('logoutBtn');
    
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
    const titleElement = document.getElementById('headerSystemTitle');
    
    if (!userStr) return;
    
    try {
        const user = JSON.parse(userStr);
        let subtitle = 'Portal'; 
        let systemTitle = 'Faculty Requirement Submission System';
        
        // Update system title based on department
        if (user.department) {
            systemTitle = `${user.department} — Faculty Requirement Submission System`;
        }
        
        if (user.userType === 'admin') {
            if (user.adminLevel === 'super_admin') {
                subtitle = 'Super Administrator Portal';
            } else {
                subtitle = 'Administrator Portal';
            }
        } else if (user.userType === 'professor') {
            subtitle = 'Faculty Portal';
        } else if (user.userType === 'student') {
            subtitle = 'Student Portal';
        }
        
        if (subtitleElement) {
            subtitleElement.textContent = subtitle;
        }
        
        if (titleElement) {
            titleElement.textContent = systemTitle;
        }
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
    console.log('=== Faculty Specific DOMContentLoaded ===');
    checkFacultySession();
    // Update page department content
    updatePageDepartmentContent();
    
    const currentPage = window.location.pathname.split('/').pop();
    document.querySelectorAll('.nav-item').forEach(function (el) {
        if (el.getAttribute('href') === currentPage) {
            el.classList.add('active');
        }
    });
    const helpBtn = document.querySelector('.help-btn');
    if (helpBtn) {
        helpBtn.addEventListener('click', function () {
            const userStr = sessionStorage.getItem('user');
            let departmentName = 'CCS';
            if (userStr) {
                try {
                    const user = JSON.parse(userStr);
                    if (user.department) {
                        departmentName = user.department;
                    }
                } catch (e) {
                    console.error('Error parsing user:', e);
                }
            }
            alert(`For assistance, please contact the ${departmentName} System Administrator.`);
        });
    }
});
