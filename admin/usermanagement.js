let allUsers = [];
let currentUser = null;
let isUserSuperAdmin = false;

function initializeUserSession() {
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
        try {
            currentUser = JSON.parse(userStr);
            isUserSuperAdmin = currentUser.userType === 'admin' && currentUser.adminLevel === 'super_admin';
            console.log('Current user role:', isUserSuperAdmin ? 'Super Admin' : 'Admin');
        } catch (e) {
            console.error('Error parsing user session:', e);
        }
    }
}

async function loadUsers() {
    try {
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            return;
        }

        const { data: professors, error: profError } = await supabaseClient
            .from('professors')
            .select('*')
            .order('created_at', { ascending: false });

        if (profError) throw profError;

        const { data: admins, error: adminError } = await supabaseClient
            .from('admins')
            .select('*')
            .order('created_at', { ascending: false });

        if (adminError) throw adminError;

        allUsers = [];

        if (professors) {
            professors.forEach(prof => {
                allUsers.push({
                    id: prof.professor_id,
                    type: 'professor',
                    name: `${prof.first_name} ${prof.middle_name ? prof.middle_name + ' ' : ''}${prof.last_name}`,
                    email: prof.email,
                    role: prof.role || 'faculty',
                    department: prof.department || 'N/A',
                    status: prof.status || 'inactive',
                    created_at: prof.created_at,
                    rawData: prof
                });
            });
        }

        if (admins) {
            admins.forEach(admin => {
                const adminRole = admin.admin_level === 'super_admin' ? 'super admin' : 'admin';
                
                if (!isUserSuperAdmin && admin.admin_level) {
                    return; 
                }
                
                allUsers.push({
                    id: admin.admin_id,
                    type: 'admin',
                    name: admin.admin_name || 'N/A',
                    email: admin.email,
                    role: adminRole,
                    department: 'Administration',
                    status: admin.status || 'active',
                    created_at: admin.created_at,
                    rawData: admin
                });
            });
        }

        displayUsers(allUsers);
        updateStatistics();
        applyRoleBasedRestrictions();

    } catch (error) {
        console.error('Error loading users:', error);
        alert('Failed to load users. Please try again.');
    }
}

function applyRoleBasedRestrictions() {
    if (!isUserSuperAdmin) {
        const roleFilter = document.querySelector('.role-filter');
        if (roleFilter) {
            const superAdminOption = Array.from(roleFilter.options).find(opt => 
                opt.textContent.toLowerCase() === 'super admin'
            );
            if (superAdminOption) {
                superAdminOption.style.display = 'none';
            }
        }
        
        const addUserBtn = document.querySelector('.btn-add-user');
        if (addUserBtn) {
            const btnText = addUserBtn.textContent.trim();
            if (btnText === 'Add New User') {
                addUserBtn.innerHTML = `
                    <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                    Add Faculty/Dean
                `;
            }
        }
    }
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">
                    No users found
                </td>
            </tr>
        `;
        return;
    }

    users.forEach(user => {
        const row = document.createElement('tr');
        row.classList.add('searchable-row');
        row.dataset.role = user.role;
        row.dataset.userId = user.id;
        row.dataset.userType = user.type;
        let roleBadgeClass = 'badge-faculty';
        if (user.role === 'dean') roleBadgeClass = 'badge-dean';
        else if (user.role === 'admin' || user.role === 'super admin') roleBadgeClass = 'badge-admin';
        const statusBadgeClass = user.status === 'active' ? 'badge-active' : 'badge-inactive';
        const statusText = user.status === 'active' ? 'Active' : 'Pending';
        let actionButtons = '';
        const canModify = checkModifyPermission(user);
        
        if (user.status === 'inactive' && user.type === 'professor' && canModify) {
            actionButtons = `
                <button class="btn-action btn-approve" title="Approve User" onclick="approveUser('${user.id}', '${user.type}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Approve
                </button>
                <button class="btn-action btn-reject" title="Reject User" onclick="deleteUser('${user.id}', '${user.type}', '${user.name}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                    Reject
                </button>
            `;
        } else if (canModify && user.role !== 'super admin') {
            actionButtons = `
                <button class="btn-action btn-delete" title="Delete User" onclick="deleteUser('${user.id}', '${user.type}', '${user.name}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Delete
                </button>
            `;
        } else if (!canModify) {
            actionButtons = `
                <span style="color:var(--text-muted);font-size:.8rem;font-style:italic;">No permissions</span>
            `;
        }

        row.innerHTML = `
            <td style="font-weight:500;">${user.name}</td>
            <td>${user.email}</td>
            <td><span class="badge ${roleBadgeClass}">${capitalizeWords(user.role)}</span></td>
            <td>${user.department}</td>
            <td><span class="badge ${statusBadgeClass}">${statusText}</span></td>
            <td>${actionButtons}</td>
        `;

        tbody.appendChild(row);
    });
}

function checkModifyPermission(targetUser) {
    if (isUserSuperAdmin) {
        return true;
    }
    
    if (targetUser.type === 'admin') {
        return false;
    }
    
    return true;
}

async function approveUser(userId, userType) {
    if (!confirm('Are you sure you want to approve this user?')) {
        return;
    }

    try {
        if (!supabaseClient) {
            throw new Error('Supabase client not initialized');
        }

        const tableName = userType === 'professor' ? 'professors' : 'admins';
        const idColumn = userType === 'professor' ? 'professor_id' : 'admin_id';

        const { error } = await supabaseClient
            .from(tableName)
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq(idColumn, userId);

        if (error) throw error;

        alert('User approved successfully!');
        await loadUsers(); 

    } catch (error) {
        console.error('Error approving user:', error);
        alert('Failed to approve user. Please try again.');
    }
}

async function deleteUser(userId, userType, userName) {
    if (userType === 'admin' && !isUserSuperAdmin) {
        alert('Only Super Admins can delete admin users.');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete "${userName}"? This action cannot be undone.`)) {
        return;
    }

    try {
        if (!supabaseClient) {
            throw new Error('Supabase client not initialized');
        }

        const tableName = userType === 'professor' ? 'professors' : 'admins';
        const idColumn = userType === 'professor' ? 'professor_id' : 'admin_id';

        const { error } = await supabaseClient
            .from(tableName)
            .delete()
            .eq(idColumn, userId);

        if (error) throw error;

        alert('User deleted successfully!');
        await loadUsers();

    } catch (error) {
        console.error('Error deleting user:', error);
        alert('Failed to delete user. Please try again.');
    }
}

function updateStatistics() {
    const totalUsers = allUsers.length;
    const facultyCount = allUsers.filter(u => u.type === 'professor' && u.role !== 'dean').length;
    const deansCount = allUsers.filter(u => u.role === 'dean').length;
    const adminsCount = allUsers.filter(u => u.type === 'admin').length;

    document.getElementById('totalUsersCount').textContent = totalUsers;
    document.getElementById('facultyCount').textContent = facultyCount;
    document.getElementById('deansCount').textContent = deansCount;
    document.getElementById('adminsCount').textContent = adminsCount;
}

function capitalizeWords(str) {
    return str.replace(/\b\w/g, char => char.toUpperCase());
}

function setupSearch() {
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            const query = this.value.toLowerCase();
            const filtered = allUsers.filter(user => {
                return user.name.toLowerCase().includes(query) ||
                       user.email.toLowerCase().includes(query) ||
                       user.department.toLowerCase().includes(query);
            });
            displayUsers(filtered);
        });
    }
}

function setupRoleFilter() {
    const roleFilter = document.querySelector('.role-filter');
    if (roleFilter) {
        roleFilter.addEventListener('change', function () {
            const selectedRole = this.value.toLowerCase();
            
            if (selectedRole === 'all roles') {
                displayUsers(allUsers);
                return;
            }

            const filtered = allUsers.filter(user => {
                return user.role.toLowerCase() === selectedRole;
            });
            displayUsers(filtered);
        });
    }
}

function setupAddUserButton() {
    const addUserBtn = document.querySelector('.btn-add-user');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', function () {
            if (isUserSuperAdmin) {
                alert('Add User feature: Super Admins can add Faculty, Deans, and Admins. Coming soon!');
            } else {
                alert('Add User feature: You can add Faculty and Deans. Coming soon!');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', function () {
    initializeUserSession();
    loadUsers();
    setupSearch();
    setupRoleFilter();
    setupAddUserButton();
});
