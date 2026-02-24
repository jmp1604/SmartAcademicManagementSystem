document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            applyFileFilters();
        });
    }

    const deptFilter = document.querySelector('.dept-filter');
    if (deptFilter) {
        deptFilter.addEventListener('change', function () {
            applyFileFilters();
        });
    }

    const catFilter = document.querySelector('.cat-filter');
    if (catFilter) {
        catFilter.addEventListener('change', function () {
            applyFileFilters();
        });
    }

    const statusFilter = document.querySelector('.status-filter');
    if (statusFilter) {
        statusFilter.addEventListener('change', function () {
            applyFileFilters();
        });
    }

    function applyFileFilters() {
        const dept   = (document.querySelector('.dept-filter')?.value   || '').toLowerCase();
        const cat    = (document.querySelector('.cat-filter')?.value    || '').toLowerCase();
        const status = (document.querySelector('.status-filter')?.value || '').toLowerCase();
        const q      = (document.querySelector('.search-input')?.value  || '').toLowerCase();

        document.querySelectorAll('.searchable-row').forEach(function (row) {
            const matchDept   = !dept   || dept   === 'all depts'       || (row.dataset.dept   || '').toLowerCase() === dept;
            const matchCat    = !cat    || cat    === 'all categories'   || (row.dataset.cat    || '').toLowerCase() === cat;
            const matchStatus = !status || status === 'all status'       || (row.dataset.status || '').toLowerCase() === status;
            const matchQ      = !q      || row.textContent.toLowerCase().includes(q);
            row.style.display = (matchDept && matchCat && matchStatus && matchQ) ? '' : 'none';
        });
    }

    document.querySelectorAll('.btn-delete').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const row = this.closest('tr');
            if (confirm('Are you sure you want to delete this file?')) {
                row.style.transition = 'opacity .3s';
                row.style.opacity = '0';
                setTimeout(function () { row.remove(); }, 300);
            }
        });
    });

});
