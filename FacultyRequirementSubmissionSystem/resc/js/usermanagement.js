let allUsers = [];

// Load all users from database
async function loadUsers() {
    try {
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            return;
        }

        // Fetch professors
        const { data: professors, error: profError } = await supabaseClient
            .from('professors')
            .select('*')
            .order('created_at', { ascending: false });

        if (profError) throw profError;

        // Fetch admins
        const { data: admins, error: adminError } = await supabaseClient
            .from('admins')
            .select('*')
            .order('created_at', { ascending: false });

        if (adminError) throw adminError;

        // Combine and format users
        allUsers = [];

        // Add professors
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

        // Add admins
        if (admins) {
            admins.forEach(admin => {
                allUsers.push({
                    id: admin.admin_id,
                    type: 'admin',
                    name: admin.admin_name || 'N/A',
                    email: admin.email,
                    role: admin.admin_level === 'super_admin' ? 'super admin' : 'admin',
                    department: 'Administration',
                    status: admin.status || 'active',
                    created_at: admin.created_at,
                    rawData: admin
                });
            });
        }

        displayUsers(allUsers);
        updateStatistics();

    } catch (error) {
        console.error('Error loading users:', error);
        alert('Failed to load users. Please try again.');
    }
}

// Display users in the table
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

        // Format role badge
        let roleBadgeClass = 'badge-faculty';
        if (user.role === 'dean') roleBadgeClass = 'badge-dean';
        else if (user.role === 'admin' || user.role === 'super admin') roleBadgeClass = 'badge-admin';

        // Format status badge
        const statusBadgeClass = user.status === 'active' ? 'badge-active' : 'badge-inactive';
        const statusText = user.status === 'active' ? 'Active' : 'Pending';

        // Actions based on status
        let actionButtons = '';
        if (user.status === 'inactive' && user.type === 'professor') {
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
        } else if (user.role !== 'super admin') {
            actionButtons = `
                <button class="btn-action btn-delete" title="Delete User" onclick="deleteUser('${user.id}', '${user.type}', '${user.name}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Delete
                </button>
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

// Approve user (activate their account)
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
        await loadUsers(); // Reload the list

    } catch (error) {
        console.error('Error approving user:', error);
        alert('Failed to approve user. Please try again.');
    }
}

// Delete user
async function deleteUser(userId, userType, userName) {
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
        await loadUsers(); // Reload the list

    } catch (error) {
        console.error('Error deleting user:', error);
        alert('Failed to delete user. Please try again.');
    }
}

// Update statistics
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

// Capitalize words helper
function capitalizeWords(str) {
    return str.replace(/\b\w/g, char => char.toUpperCase());
}

// Search functionality
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

// Role filter functionality
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

// Add new user button
function setupAddUserButton() {
    const addUserBtn = document.querySelector('.btn-add-user');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', function () {
            alert('This feature will allow adding new users manually. Coming soon!');
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function () {
    loadUsers();
    setupSearch();
    setupRoleFilter();
    setupAddUserButton();
});
