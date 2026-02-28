document.addEventListener('DOMContentLoaded', function () {
    const filterYear     = document.getElementById('filter-year');
    const filterSemester = document.getElementById('filter-semester');
    const filterCategory = document.getElementById('filter-category');
    const filterStatus   = document.getElementById('filter-status');

    if (filterYear && filterSemester && filterCategory && filterStatus) {
        function applyReportFilters() {
            const year     = filterYear.value;
            const semester = filterSemester.value;
            const category = filterCategory.value;
            const status   = filterStatus.value.toLowerCase();

            const rows = document.querySelectorAll('#submissions-tbody tr');
            let total = 0, approved = 0, pending = 0, rejected = 0;

            rows.forEach(function (row) {
                const rowYear     = row.dataset.year || '';
                const rowSemester = row.dataset.semester || '';
                const rowCategory = row.dataset.category || '';
                const rowStatus   = row.dataset.status?.toLowerCase() || '';

                const matchYear     = !year     || year === 'All Years'        || rowYear === year;
                const matchSemester = !semester || semester === 'All Semesters' || rowSemester.includes(semester);
                const matchCategory = !category || category === 'All Categories' || rowCategory === category;
                const matchStatus   = !status   || status === 'all status'     || rowStatus === status;

                if (matchYear && matchSemester && matchCategory && matchStatus) {
                    row.style.display = '';
                    total++;
                    if (rowStatus === 'approved') approved++;
                    if (rowStatus === 'pending')  pending++;
                    if (rowStatus === 'rejected') rejected++;
                } else {
                    row.style.display = 'none';
                }
            });

            document.getElementById('stat-total').textContent    = total;
            document.getElementById('stat-approved').textContent = approved;
            document.getElementById('stat-pending').textContent  = pending;
            document.getElementById('stat-rejected').textContent = rejected;
        }

        filterYear.addEventListener('change',     applyReportFilters);
        filterSemester.addEventListener('change', applyReportFilters);
        filterCategory.addEventListener('change', applyReportFilters);
        filterStatus.addEventListener('change',   applyReportFilters);
    }
    if (typeof Chart !== 'undefined') {
        initReportCharts();
    }
});

function initReportCharts() {
    const donutCtx = document.getElementById('statusDonut');
    if (donutCtx) {
        new Chart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: ['Approved', 'Pending', 'Rejected'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: ['#1a6b36', '#ea580c', '#dc2626'],
                    borderWidth: 0,
                    hoverOffset: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            font: { family: "'Source Sans 3', sans-serif", size: 12 },
                            color: '#6b7f6e',
                            padding: 16,
                        }
                    }
                }
            }
        });
    }

    const barCtx = document.getElementById('monthBar');
    if (barCtx) {
        new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
                datasets: [{
                    label: 'Files Uploaded',
                    data: [0, 0, 0, 0, 0, 0, 0],
                    backgroundColor: '#145a2e',
                    borderRadius: 5,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: "'Source Sans 3', sans-serif", size: 11 }, color: '#6b7f6e' }
                    },
                    y: {
                        grid: { color: '#e2ebe4', drawBorder: false },
                        ticks: { font: { family: "'Source Sans 3', sans-serif", size: 11 }, color: '#6b7f6e', stepSize: 1 },
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

function generateReport(type) {
    const labels = {
        summary:  'Submission Summary Report',
        timeline: 'Timeline Report',
        category: 'Category Breakdown Report',
        semester: 'Semester Report',
    };
    alert('Generating ' + labels[type] + '…\n\nConnect this button to your backend export endpoint (PDF/Excel).');
}
