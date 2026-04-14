let requirements = [];
let categories = [];
let currentEditId = null;
let currentDeleteId = null;
let activeSemesterId = null;
let activeSemesterName = null;
let userDepartmentId = null;
let userDepartmentName = null;

document.addEventListener('DOMContentLoaded', async () => {
    const userStr = sessionStorage.getItem('user');
    if (!userStr) {
        console.log('No user session found, redirecting to login');
        window.location.href = '../../auth/login.html';
        return;
    }
    
    let user;
    try {
        user = JSON.parse(userStr);
        if (user.userType !== 'admin') {
            console.log('Access denied: User is not an admin');
            alert('Access denied. Admin privileges required.');
            window.location.href = '../../portal/portal.html';
            return;
        }
        // Store user's department ID
        userDepartmentId = user.departmentId;
    } catch (error) {
        console.error('Error parsing user session:', error);
        window.location.href = '../../auth/login.html';
        return;
    }
    if (typeof supabaseClient === 'undefined') {
        console.log('Waiting for Supabase client to initialize...');
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.href && item.href.includes('admin-requirement-management.html')) {
            item.classList.add('active');
        }
    });
    
    await loadActiveSemester();
    await loadCategories();
    await loadSemesters();
    await loadDepartments();
    await loadUserDepartmentName();
    await loadRequirements();
    initializeEventListeners();
});

async function loadActiveSemester() {
    try {
        const { data: sem, error } = await supabaseClient
            .from('semesters')
            .select('id, name')
            .eq('is_active', true)
            .limit(1)
            .single();
        
        if (error || !sem) {
            console.error('No active semester found');
            return false;
        }
        activeSemesterId = sem.id;
        activeSemesterName = sem.name;
        const semesterEl = document.getElementById('requirement-current-semester');
        if (semesterEl) semesterEl.textContent = activeSemesterName;
        
        return true;
    } catch (e) {
        console.error('loadActiveSemester error:', e);
        return false;
    }
}

async function loadUserDepartmentName() {
    try {
        if (!userDepartmentId) {
            console.warn('No department ID found for user');
            userDepartmentName = 'Unknown Department';
            return;
        }
        
        const { data, error } = await supabaseClient
            .from('departments')
            .select('department_name')
            .eq('id', userDepartmentId)
            .single();
        
        if (error || !data) {
            console.warn('Could not find department:', userDepartmentId);
            userDepartmentName = 'Unknown Department';
            return;
        }
        
        userDepartmentName = data.department_name || 'Unknown Department';
        console.log('User department loaded:', userDepartmentName);
    } catch (e) {
        console.error('loadUserDepartmentName error:', e);
        userDepartmentName = 'Unknown Department';
    }
}

async function loadCategories() {
    try {
        const currentUser = getCurrentUser();
        let query = supabaseClient
            .from('categories')
            .select('*')
            .eq('status', 'active');
        
        // Filter by department if user has one
        if (currentUser?.departmentId) {
            query = query.eq('department_id', currentUser.departmentId);
        }
        
        const { data, error } = await query.order('name', { ascending: true });

        if (error) throw error;

        categories = data || [];
        populateCategoryDropdowns();

    } catch (error) {
        console.error('Error loading categories:', error);
        showNotification('Error loading categories', 'error');
    }
}

function populateCategoryDropdowns() {
    // Populate modal category dropdown
    const modalSelect = document.getElementById('requirementCategory');
    if (modalSelect) {
        modalSelect.innerHTML = '<option value="">Select Category</option>' +
            categories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('');
    }

    // Populate filter dropdown
    const filterSelect = document.getElementById('categoryFilter');
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="all">All Categories</option>' +
            categories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('');
    }
}

async function loadSemesters() {
    try {
        const { data, error } = await supabaseClient
            .from('semesters')
            .select('id, name')
            .order('name', { ascending: true });

        if (error) throw error;

        const semesterSelect = document.getElementById('requirementSemester');
        if (semesterSelect && data) {
            semesterSelect.innerHTML = '<option value="">Select Semester</option>' +
                data.map(sem => `<option value="${sem.id}">${escapeHtml(sem.name)}</option>`).join('');
        }
    } catch (error) {
        console.error('Error loading semesters:', error);
    }
}

async function loadDepartments() {
    try {
        const { data, error } = await supabaseClient
            .from('departments')
            .select('id, department_name')
            .eq('is_active', true)
            .order('department_name', { ascending: true });

        if (error) throw error;

        departments = data || [];
        const departmentSelect = document.getElementById('requirementDepartment');
        if (departmentSelect && departments.length > 0) {
            departmentSelect.innerHTML = '<option value="">Select Department</option>' +
                departments.map(dept => `<option value="${dept.id}">${escapeHtml(dept.department_name)}</option>`).join('');
        }
    } catch (error) {
        console.error('Error loading departments:', error);
    }
}async function loadRequirements() {
    try {
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            showEmptyState();
            return;
        }

        // Get admin's department from session
        const userStr = sessionStorage.getItem('user');
        let departmentId = null;
        
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                departmentId = user.departmentId;
                console.log('Admin department ID:', departmentId);
            } catch (e) {
                console.error('Error parsing user session:', e);
            }
        }

        // Check if admin has a department assigned
        if (!departmentId) {
            console.warn('Admin user does not have a department assigned');
            showNotification('Warning: Your account is not assigned to a department. You cannot manage requirements.', 'warning');
            showEmptyState();
            return;
        }

        const { data, error } = await supabaseClient
            .from('requirements')
            .select(`
                *,
                categories:category_id(
                    name,
                    icon
                )
            `)
            .eq('department_id', departmentId)
            .eq('semester_id', activeSemesterId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        requirements = data || [];
        console.log('Loaded requirements for department:', requirements.length);
        
        // Fetch semester name for display
        if (activeSemesterId) {
            const { data: semData } = await supabaseClient
                .from('semesters')
                .select('name')
                .eq('id', activeSemesterId)
                .single();
            
            if (semData) {
                requirements.forEach(req => {
                    req.semesterName = semData.name;
                });
            }
        }
        
        updateStats();
        renderRequirements(requirements);

    } catch (error) {
        console.error('Error loading requirements:', error);
        showNotification('Error loading requirements', 'error');
        showEmptyState();
    }
}

function updateStats() {
    const total = requirements.length;
    const active = requirements.filter(r => r.status === 'active').length;
    const mandatory = requirements.filter(r => r.is_mandatory).length;
    
    // Count total submissions
    let totalSubs = 0;
    requirements.forEach(req => {
        totalSubs += req.submission_count || 0;
    });

    document.getElementById('totalRequirements').textContent = total;
    document.getElementById('activeRequirements').textContent = active;
    document.getElementById('mandatoryRequirements').textContent = mandatory;
    document.getElementById('totalSubmissions').textContent = totalSubs;
}

function renderRequirements(requirementsToRender) {
    const tbody = document.getElementById('requirementsTableBody');
    const table = document.getElementById('requirementsTable');
    const emptyState = document.getElementById('emptyState');

    if (requirementsToRender.length === 0) {
        table.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    table.style.display = 'table';
    emptyState.style.display = 'none';

    tbody.innerHTML = requirementsToRender.map(requirement => {
        const categoryName = requirement.categories?.name || 'N/A';
        const semesterName = requirement.semesterName || activeSemesterName || 'N/A';
        const deadline = requirement.deadline 
            ? new Date(requirement.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'No deadline';
        const createdDate = new Date(requirement.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const isMandatory = requirement.is_mandatory 
            ? '<span class="badge badge-danger">Required</span>' 
            : '<span class="badge badge-gray">Optional</span>';
        const statusBadge = requirement.status === 'active' 
            ? '<span class="badge badge-success">Active</span>' 
            : '<span class="badge badge-gray">Inactive</span>';

        return `
            <tr>
                <td>
                    <strong>${escapeHtml(requirement.name)}</strong>
                    ${requirement.description ? `<br><small style="color:#888;">${escapeHtml(requirement.description.substring(0, 60))}${requirement.description.length > 60 ? '...' : ''}</small>` : ''}
                </td>
                <td>${escapeHtml(categoryName)}</td>
                <td>${escapeHtml(semesterName)}</td>
                <td>${deadline}</td>
                <td>${isMandatory}</td>
                <td>${statusBadge}</td>
                <td>${createdDate}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon" onclick="editRequirement('${requirement.id}')" title="Edit">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn-icon btn-danger" onclick="confirmDeleteRequirement('${requirement.id}')" title="Delete">
                            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function initializeEventListeners() {
    const btnCreate = document.getElementById('btnCreateRequirement');
    if (btnCreate) {
        btnCreate.addEventListener('click', openCreateModal);
    }

    const form = document.getElementById('requirementForm');
    if (form) {
        form.addEventListener('submit', handleSaveRequirement);
    }

    const searchInput = document.getElementById('searchRequirements');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
    }

    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', applyFilters);
    }

    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', applyFilters);
    }

    const btnConfirmDelete = document.getElementById('btnConfirmDelete');
    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', handleDeleteRequirement);
    }
}

function openCreateModal() {
    currentEditId = null;
    document.getElementById('modalTitle').textContent = 'Create New Requirement';
    document.getElementById('requirementForm').reset();
    document.getElementById('requirementId').value = '';
    document.querySelector('input[name="requirementStatus"][value="active"]').checked = true;
    
    if (activeSemesterId) {
        document.getElementById('requirementSemester').value = activeSemesterId;
    }
    
    document.getElementById('requirementDepartment').value = userDepartmentName;
    
    document.getElementById('requirementModal').style.display = 'flex';
}

function closeRequirementModal() {
    document.getElementById('requirementModal').style.display = 'none';
    currentEditId = null;
}

async function editRequirement(id) {
    currentEditId = id;
    const requirement = requirements.find(r => r.id === id);
    
    if (!requirement) {
        showNotification('Requirement not found', 'error');
        return;
    }

    document.getElementById('modalTitle').textContent = 'Edit Requirement';
    document.getElementById('requirementId').value = requirement.id;
    document.getElementById('requirementTitle').value = requirement.name || '';
    document.getElementById('requirementDescription').value = requirement.description || '';
    document.getElementById('requirementCategory').value = requirement.category_id || '';
    document.getElementById('requirementDepartment').value = userDepartmentName;
    document.getElementById('requirementSemester').value = requirement.semester_id || '';
    
    // Format deadline for datetime-local input
    if (requirement.deadline) {
        const date = new Date(requirement.deadline);
        const formattedDate = date.toISOString().slice(0, 16);
        document.getElementById('requirementDeadline').value = formattedDate;
    }
    
    document.getElementById('requirementMandatory').checked = requirement.is_mandatory || false;
    
    // Set status radio
    document.querySelector(`input[name="requirementStatus"][value="${requirement.status}"]`).checked = true;
    
    document.getElementById('requirementModal').style.display = 'flex';
}

async function handleSaveRequirement(e) {
    e.preventDefault();

    const title = document.getElementById('requirementTitle').value.trim();
    const description = document.getElementById('requirementDescription').value.trim();
    const categoryId = document.getElementById('requirementCategory').value;
    const semester = document.getElementById('requirementSemester').value;
    const deadline = document.getElementById('requirementDeadline').value;
    const isMandatory = document.getElementById('requirementMandatory').checked;
    const status = document.querySelector('input[name="requirementStatus"]:checked').value;

    if (!title || !categoryId) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    // Get admin's department ID from session
    const userStr = sessionStorage.getItem('user');
    const user = JSON.parse(userStr);
    
    if (!user.departmentId) {
        showNotification('Error: Your account is not assigned to a department', 'error');
        return;
    }

    const requirementData = {
        name: title,  // Map 'title' to 'name' column
        description: description || null,
        category_id: categoryId,
        department_id: user.departmentId,  // Always use user's department
        semester_id: semester || null,
        deadline: deadline || null,
        is_mandatory: isMandatory,
        status
    };

    try {
        let result;
        if (currentEditId) {
            // Capture old value before update
            const oldRequirement = requirements.find(r => r.id === currentEditId);
            // Update existing requirement (don't change department_id)
            const { department_id, ...updateData } = requirementData;
            result = await supabaseClient
                .from('requirements')
                .update(updateData)
                .eq('id', currentEditId);

            if (result.error) throw result.error;

            // AUDIT: log requirement update
            await auditLog('UPDATE_REQUIREMENT', 'requirements', currentEditId, title,
                oldRequirement || null,
                updateData
            );
        } else {
            // Create new requirement
            requirementData.created_by = user.id;
            
            result = await supabaseClient
                .from('requirements')
                .insert([requirementData])
                .select();

            if (result.error) throw result.error;

            // AUDIT: log requirement creation
            const created = result.data?.[0];
            await auditLog('CREATE_REQUIREMENT', 'requirements', created?.id, title,
                null,
                created || requirementData
            );

            // NOTIFICATION: Notify all professors in the department about new requirement
            if (created?.id && requirementData.department_id) {
                const notifResult = await notifyNewRequirement(
                    requirementData.department_id,  // Department ID
                    created.id,                      // New requirement ID
                    title,                           // Requirement name
                    requirementData.deadline,        // Deadline
                    user.id                          // Admin who created it
                );
                if (notifResult.error) {
                    console.warn('Could not create new requirement notifications:', notifResult.error);
                } else {
                    console.log('✓ Professors notified of new requirement');
                }
            }
        }

        showNotification(
            currentEditId ? 'Requirement updated successfully' : 'Requirement created successfully',
            'success'
        );

        closeRequirementModal();
        await loadRequirements();

    } catch (error) {
        console.error('Error saving requirement:', error);
        showNotification('Error saving requirement: ' + error.message, 'error');
    }
}

function confirmDeleteRequirement(id) {
    currentDeleteId = id;
    const requirement = requirements.find(r => r.id === id);
    
    if (!requirement) return;

    document.getElementById('deleteMessage').textContent = 
        `Are you sure you want to delete "${requirement.name}"?`;
    
    const submissionCount = requirement.submission_count || 0;
    document.getElementById('submissionsWarning').textContent = 
        submissionCount > 0 
            ? `Warning: This requirement has ${submissionCount} submission(s). They will NOT be deleted.`
            : 'This action cannot be undone.';
    
    document.getElementById('deleteModal').style.display = 'flex';
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    currentDeleteId = null;
}

async function handleDeleteRequirement() {
    if (!currentDeleteId) return;

    try {
        const requirementToDelete = requirements.find(r => r.id === currentDeleteId);

        const { error } = await supabaseClient
            .from('requirements')
            .delete()
            .eq('id', currentDeleteId);

        if (error) throw error;

        // AUDIT: log requirement deletion
        await auditLog('DELETE_REQUIREMENT', 'requirements', currentDeleteId,
            requirementToDelete?.name || 'Unknown',
            requirementToDelete || null,
            null
        );

        showNotification('Requirement deleted successfully', 'success');
        closeDeleteModal();
        await loadRequirements();

    } catch (error) {
        console.error('Error deleting requirement:', error);
        showNotification('Error deleting requirement: ' + error.message, 'error');
    }
}

function handleSearch(e) {
    applyFilters();
}

function applyFilters() {
    const searchTerm = document.getElementById('searchRequirements').value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;

    let filtered = requirements;

    // Apply search
    if (searchTerm) {
        filtered = filtered.filter(req => 
            req.name.toLowerCase().includes(searchTerm) ||
            (req.description && req.description.toLowerCase().includes(searchTerm)) ||
            (req.semester && req.semester.toLowerCase().includes(searchTerm))
        );
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
        filtered = filtered.filter(req => req.category_id === categoryFilter);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
        filtered = filtered.filter(req => req.status === statusFilter);
    }

    renderRequirements(filtered);
}

function showEmptyState() {
    const table = document.getElementById('requirementsTable');
    const emptyState = document.getElementById('emptyState');
    table.style.display = 'none';
    emptyState.style.display = 'flex';
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text ? String(text).replace(/[&<>"']/g, m => map[m]) : '';
}

function showNotification(message, type = 'info') {
    if (type === 'error') {
        alert('Error: ' + message);
    } else {
        alert(message);
    }
}