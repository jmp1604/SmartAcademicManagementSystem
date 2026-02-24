document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            const q = this.value.toLowerCase();
            document.querySelectorAll('.searchable-row').forEach(function (row) {
                row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
        });
    }

    const roleFilter = document.querySelector('.role-filter');
    if (roleFilter) {
        roleFilter.addEventListener('change', function () {
            const role = this.value.toLowerCase();
            document.querySelectorAll('.searchable-row').forEach(function (row) {
                const rowRole = (row.dataset.role || '').toLowerCase();
                row.style.display = (!role || role === 'all roles' || rowRole === role) ? '' : 'none';
            });
        });
    }

    document.querySelectorAll('.btn-delete').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const row = this.closest('tr');
            if (confirm('Are you sure you want to delete this user?')) {
                row.style.transition = 'opacity .3s';
                row.style.opacity = '0';
                setTimeout(function () { row.remove(); }, 300);
            }
        });
    });

    const addUserBtn = document.querySelector('.btn-add-user');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', function () {
            alert('Add New User modal — connect to your backend form here.');
        });
    }

});
