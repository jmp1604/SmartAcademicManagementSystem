let categories = [];
let currentEditId = null;
let currentDeleteId = null;

document.addEventListener('DOMContentLoaded', async () => {
    const userStr = sessionStorage.getItem('user');
    if (!userStr) {
        console.log('No user session found, redirecting to login');
        window.location.href = '../../auth/login.html';
        return;
    }
    try {
        const user = JSON.parse(userStr);
        if (user.userType !== 'admin') {
            console.log('Access denied: User is not an admin');
            alert('Access denied. Admin privileges required.');
            window.location.href = '../../portal/portal.html';
            return;
        }
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
        if (item.href && item.href.includes('admin-category-management.html')) {
            item.classList.add('active');
        }
    });

    await loadCategories();
    initializeEventListeners();
    initializeIconPicker();
});

async function loadCategories() {
    try {
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            showEmptyState();
            return;
        }

        const { data, error } = await supabaseClient
            .from('categories')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        categories = data || [];
        updateStats();
        renderCategories(categories);

    } catch (error) {
        console.error('Error loading categories:', error);
        showNotification('Error loading categories', 'error');
        showEmptyState();
    }
}

function updateStats() {
    const total = categories.length;
    const active = categories.filter(c => c.status === 'active').length;
    const inactive = total - active;
    let totalFilesCount = 0;
    categories.forEach(cat => {
        totalFilesCount += cat.file_count || 0;
    });
    document.getElementById('totalCategories').textContent = total;
    document.getElementById('activeCategories').textContent = active;
    document.getElementById('inactiveCategories').textContent = inactive;
    document.getElementById('totalFiles').textContent = totalFilesCount;
}

function renderCategories(categoriesToRender) {
    const grid = document.getElementById('categoriesGrid');
    const emptyState = document.getElementById('emptyState');

    if (categoriesToRender.length === 0) {
        grid.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    grid.innerHTML = categoriesToRender.map(category => {
        const fileCount = category.file_count || 0;
        const createdDate = new Date(category.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
        });
        const colors = ['#fef3c7', '#dbeafe', '#fce7f3', '#e0e7ff', '#d1fae5', '#fef2f2'];
        const colorIndex = categories.indexOf(category) % colors.length;
        const bgColor = colors[colorIndex] || colors[0];

        return `
            <div class="category-card">
                <div class="category-header">
                    <div class="category-icon" style="background: ${bgColor};">
                        <i class="${category.icon || 'fas fa-folder'}"></i>
                    </div>
                    <div class="category-info">
                        <div class="category-name">${escapeHtml(category.name)}</div>
                        <div class="category-description">${escapeHtml(category.description || 'No description')}</div>
                    </div>
                </div>
                <div class="category-meta">
                    <div class="meta-item">
                        <span class="meta-label">Status</span>
                        <span class="status-badge ${category.status}">${category.status}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Files</span>
                        <span class="meta-value">📎 ${fileCount}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Created</span>
                        <span class="meta-value">${createdDate}</span>
                    </div>
                </div>
                <div class="category-actions">
                    <button class="btn-edit" onclick="editCategory('${category.id}')">
                        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Edit
                    </button>
                    <button class="btn-deactivate" onclick="toggleCategoryStatus('${category.id}')">
                        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        ${category.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button class="btn-delete" onclick="confirmDeleteCategory('${category.id}')">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function showEmptyState() {
    document.getElementById('categoriesGrid').innerHTML = '';
    document.getElementById('emptyState').style.display = 'block';
}

function initializeEventListeners() {
    document.getElementById('btnCreateCategory').addEventListener('click', () => {
        openCategoryModal();
    });
    document.getElementById('categoryForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveCategory();
    });
    document.getElementById('searchCategories').addEventListener('input', (e) => {
        filterCategories();
    });
    document.getElementById('statusFilter').addEventListener('change', (e) => {
        filterCategories();
    });
}

function filterCategories() {
    const searchTerm = document.getElementById('searchCategories').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    let filtered = categories;

    if (searchTerm) {
        filtered = filtered.filter(cat => 
            cat.name.toLowerCase().includes(searchTerm) ||
            (cat.description && cat.description.toLowerCase().includes(searchTerm))
        );
    }

    if (statusFilter !== 'all') {
        filtered = filtered.filter(cat => cat.status === statusFilter);
    }

    renderCategories(filtered);
}

function openCategoryModal(categoryId = null) {
    currentEditId = categoryId;
    const modal = document.getElementById('categoryModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('categoryForm');

    form.reset();

    if (categoryId) {
        const category = categories.find(c => c.id === categoryId);
        if (category) {
            modalTitle.textContent = 'Edit Category';
            document.getElementById('categoryId').value = category.id;
            document.getElementById('categoryName').value = category.name;
            document.getElementById('categoryDescription').value = category.description || '';
            document.getElementById('categoryIcon').value = category.icon || 'fas fa-folder';
            document.getElementById('selectedIconPreview').className = category.icon || 'fas fa-folder';
            document.querySelector(`input[name="categoryStatus"][value="${category.status}"]`).checked = true;
        }
    } else {
        modalTitle.textContent = 'Create New Category';
        document.getElementById('categoryId').value = '';
        document.getElementById('categoryIcon').value = 'fas fa-folder';
        document.getElementById('selectedIconPreview').className = 'fas fa-folder';
    }
    modal.style.display = 'flex';
    setTimeout(() => {
        const modalOverlay = document.getElementById('categoryModal');
        const modalDialog = modalOverlay.querySelector('.modal-dialog');
        
        modalOverlay.onclick = (e) => {
            if (e.target === modalOverlay) {
                closeCategoryModal();
            }
        };
        if (modalDialog) {
            modalDialog.onclick = (e) => {
                e.stopPropagation();
            };
        }
        const firstInput = document.getElementById('categoryName');
        if (firstInput) {
            firstInput.focus();
        }
    }, 100);
}

function closeCategoryModal() {
    document.getElementById('categoryModal').style.display = 'none';
    currentEditId = null;
}

async function saveCategory() {
    try {
        if (!supabaseClient) {
            showNotification('Database connection error', 'error');
            return;
        }

        const categoryId = document.getElementById('categoryId').value;
        const name = document.getElementById('categoryName').value.trim();
        const description = document.getElementById('categoryDescription').value.trim();
        const icon = document.getElementById('categoryIcon').value.trim();
        const status = document.querySelector('input[name="categoryStatus"]:checked').value;

        if (!name) {
            showNotification('Category name is required', 'error');
            return;
        }

        const categoryData = {
            name,
            description,
            icon: icon || 'fas fa-folder',
            status
        };

        if (categoryId) {
            const { error } = await supabaseClient
                .from('categories')
                .update({
                    ...categoryData,
                    updated_at: new Date().toISOString()
                })
                .eq('id', categoryId);

            if (error) throw error;
            showNotification('Category updated successfully', 'success');
        } else {
            const userStr = sessionStorage.getItem('user');
            if (!userStr) {
                throw new Error('User not authenticated');
            }
            
            const currentUser = JSON.parse(userStr);
            console.log('Current user ID:', currentUser.id);
            
            const insertData = {
                name: categoryData.name,
                description: categoryData.description,
                icon: categoryData.icon,
                status: categoryData.status,
                created_by: currentUser.id
            };
            
            console.log('Inserting category data:', insertData);
            
            const { data, error } = await supabaseClient
                .from('categories')
                .insert([insertData])
                .select();

            if (error) {
                console.error('Supabase error details:', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code
                });
                throw error;
            }
            showNotification('Category created successfully', 'success');
        }

        closeCategoryModal();
        await loadCategories();

    } catch (error) {
        console.error('Error saving category:', error);
        showNotification('Error saving category: ' + error.message, 'error');
    }
}

function editCategory(categoryId) {
    openCategoryModal(categoryId);
}

async function toggleCategoryStatus(categoryId) {
    try {
        if (!supabaseClient) {
            showNotification('Database connection error', 'error');
            return;
        }

        const category = categories.find(c => c.id === categoryId);
        if (!category) return;

        const newStatus = category.status === 'active' ? 'inactive' : 'active';

        const { error } = await supabaseClient
            .from('categories')
            .update({ 
                status: newStatus,
                updated_at: new Date().toISOString()
            })
            .eq('id', categoryId);

        if (error) throw error;

        showNotification(`Category ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`, 'success');
        await loadCategories();

    } catch (error) {
        console.error('Error toggling category status:', error);
        showNotification('Error updating category status', 'error');
    }
}

async function confirmDeleteCategory(categoryId) {
    currentDeleteId = categoryId;
    const category = categories.find(c => c.id === categoryId);
    
    if (!category) return;

    const fileCount = category.file_count || 0;
    
    document.getElementById('deleteMessage').textContent = 
        `Are you sure you want to delete "${category.name}"? This action cannot be undone.`;
    
    document.getElementById('filesWarning').textContent = 
        fileCount > 0 
            ? `Warning: ${fileCount} file(s) are associated with this category and will need to be reassigned.`
            : 'No files are currently associated with this category.';

    document.getElementById('deleteModal').style.display = 'flex';

    const confirmBtn = document.getElementById('btnConfirmDelete');
    confirmBtn.onclick = deleteCategory;
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    currentDeleteId = null;
}

async function deleteCategory() {
    try {
        if (!supabaseClient || !currentDeleteId) {
            showNotification('Database connection error', 'error');
            return;
        }

        const { error } = await supabaseClient
            .from('categories')
            .delete()
            .eq('id', currentDeleteId);

        if (error) throw error;

        showNotification('Category deleted successfully', 'success');
        closeDeleteModal();
        await loadCategories();

    } catch (error) {
        console.error('Error deleting category:', error);
        showNotification('Error deleting category: ' + error.message, 'error');
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 90px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        z-index: 9999;
        animation: slideIn 0.3s ease;
        font-weight: 600;
        font-size: 0.9rem;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text ? text.replace(/[&<>"']/g, m => map[m]) : '';
}

const iconList = [
    'fa-folder', 'fa-folder-open', 'fa-file', 'fa-file-alt', 'fa-file-pdf', 
    'fa-file-word', 'fa-file-excel', 'fa-file-powerpoint', 'fa-file-image',
    'fa-book', 'fa-book-open', 'fa-bookmark', 'fa-graduation-cap', 'fa-user-graduate',
    'fa-chalkboard-teacher', 'fa-school', 'fa-university', 'fa-pencil-alt', 'fa-pen',
    'fa-edit', 'fa-clipboard', 'fa-clipboard-list', 'fa-clipboard-check', 'fa-tasks',
    'fa-list', 'fa-list-alt', 'fa-list-ul', 'fa-check', 'fa-check-circle',
    'fa-check-square', 'fa-calendar', 'fa-calendar-alt', 'fa-calendar-check', 'fa-clock',
    'fa-bell', 'fa-envelope', 'fa-inbox', 'fa-archive', 'fa-box',
    'fa-chart-bar', 'fa-chart-line', 'fa-chart-pie', 'fa-analytics', 'fa-database',
    'fa-cog', 'fa-cogs', 'fa-wrench', 'fa-tools', 'fa-star',
    'fa-heart', 'fa-flag', 'fa-tag', 'fa-tags', 'fa-trophy',
    'fa-award', 'fa-medal', 'fa-certificate', 'fa-lightbulb', 'fa-rocket'
];

function initializeIconPicker() {
    const iconPickerDisplay = document.getElementById('iconPickerDisplay');
    const iconPickerPanel = document.getElementById('iconPickerPanel');
    const iconGrid = document.getElementById('iconGrid');
    const iconSearch = document.getElementById('iconSearch');

    if (!iconPickerDisplay || !iconPickerPanel || !iconGrid) {
        console.error('Icon picker elements not found');
        return;
    }

    iconGrid.innerHTML = iconList.map(iconClass => `
        <div class="icon-picker-item" onclick="selectIcon('fas ${iconClass}')">
            <i class="fas ${iconClass}"></i>
        </div>
    `).join('');

    iconPickerDisplay.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = iconPickerPanel.style.display === 'block';
        iconPickerPanel.style.display = isVisible ? 'none' : 'block';
    });

    if (iconSearch) {
        iconSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredIcons = iconList.filter(icon => icon.includes(searchTerm));
            iconGrid.innerHTML = filteredIcons.map(iconClass => `
                <div class="icon-picker-item" onclick="selectIcon('fas ${iconClass}')">
                    <i class="fas ${iconClass}"></i>
                </div>
            `).join('');
        });
    }

    document.addEventListener('click', (e) => {
        if (!iconPickerDisplay.contains(e.target) && !iconPickerPanel.contains(e.target)) {
            iconPickerPanel.style.display = 'none';
        }
    });
}

function selectIcon(iconClass) {
    const iconInput = document.getElementById('categoryIcon');
    const iconPreview = document.getElementById('selectedIconPreview');
    const iconPickerPanel = document.getElementById('iconPickerPanel');

    if (iconInput) iconInput.value = iconClass;
    if (iconPreview) {
        iconPreview.className = iconClass;
    }
    if (iconPickerPanel) iconPickerPanel.style.display = 'none';
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(100px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    @keyframes slideOut {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100px);
        }
    }
`;
document.head.appendChild(style);