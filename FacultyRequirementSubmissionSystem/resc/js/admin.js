document.addEventListener('DOMContentLoaded', function () {

    const currentPage = window.location.pathname.split('/').pop();
    document.querySelectorAll('.nav-item').forEach(function (el) {
        if (el.getAttribute('href') === currentPage) {
            el.classList.add('active');
        }
    });

    const logoutBtn = document.querySelector('.btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function (e) {
            e.preventDefault();
            if (confirm('Are you sure you want to log out?')) {
                window.location.href = 'login.html';
            }
        });
    }

    const helpBtn = document.querySelector('.help-btn');
    if (helpBtn) {
        helpBtn.addEventListener('click', function () {
            alert('For assistance, please contact the CCS System Administrator.');
        });
    }

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
            if (confirm('Are you sure you want to delete this record?')) {
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

    if (typeof Chart !== 'undefined') {
        initDashboardCharts();
    }

});

function initDashboardCharts() {
    const trendCtx = document.getElementById('trendChart');
    if (trendCtx) {
        new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [
                    {
                        label: 'Submissions',
                        data: [120, 155, 168, 220, 275, 320],
                        borderColor: '#145a2e',
                        backgroundColor: 'rgba(20,90,46,0.08)',
                        borderWidth: 2.5,
                        pointBackgroundColor: '#145a2e',
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        tension: 0.3,
                        fill: true,
                    },
                    {
                        label: 'Active Users',
                        data: [45, 47, 50, 51, 52, 55],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.06)',
                        borderWidth: 2,
                        pointBackgroundColor: '#3b82f6',
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        tension: 0.3,
                        fill: true,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            pointStyleWidth: 10,
                            font: { family: "'Source Sans 3', sans-serif", size: 12 },
                            color: '#6b7f6e'
                        }
                    },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: {
                        grid: { color: '#e2ebe4', drawBorder: false },
                        ticks: { font: { family: "'Source Sans 3', sans-serif", size: 11 }, color: '#6b7f6e' }
                    },
                    y: {
                        grid: { color: '#e2ebe4', drawBorder: false },
                        ticks: { font: { family: "'Source Sans 3', sans-serif", size: 11 }, color: '#6b7f6e' },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    const deptCtx = document.getElementById('deptChart');
    if (deptCtx) {
        new Chart(deptCtx, {
            type: 'bar',
            data: {
                labels: ['Computer Science', 'Information Technology', 'Information Systems', 'Accounting Technology'],
                datasets: [{
                    label: 'Completion Rate (%)',
                    data: [92, 78, 85, 95],
                    backgroundColor: '#145a2e',
                    borderRadius: 5,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) { return ctx.raw + '%'; }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { family: "'Source Sans 3', sans-serif", size: 10 },
                            color: '#6b7f6e',
                            maxRotation: 30
                        }
                    },
                    y: {
                        grid: { color: '#e2ebe4', drawBorder: false },
                        ticks: { font: { family: "'Source Sans 3', sans-serif", size: 11 }, color: '#6b7f6e' },
                        min: 0, max: 100
                    }
                }
            }
        });
    }
}