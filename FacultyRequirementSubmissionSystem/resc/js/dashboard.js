document.addEventListener('DOMContentLoaded', function () {
    loadDashboardData();
    
    if (typeof Chart !== 'undefined') {
        initDashboardCharts();
    }
});

async function loadDashboardData() {
    const user = getCurrentUser();
    
    if (!user) {
        console.error('No user session found');
        return;
    }
    if (isDean()) {
        loadDeanDashboard(user);
    } else if (isAdmin()) {
        loadAdminDashboard(user);
    } else {
        console.log('Faculty user detected');
    }
}

async function loadDeanDashboard(user) {
    try {
        const department = user.department || 'Computer Science';
        const pageHeader = document.querySelector('.page-header h1');
        if (pageHeader) {
            pageHeader.textContent = 'Dean Dashboard';
        }
        const pageDesc = document.querySelector('.page-header p');
        if (pageDesc) {
            pageDesc.textContent = `Overview of ${department} submissions and activities`;
        }
        const statLabels = document.querySelectorAll('.stat-label');
        if (statLabels[0]) statLabels[0].innerHTML = 'Total Faculty<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
        if (statLabels[2]) statLabels[2].innerHTML = 'Pending Review<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
        if (statLabels[3]) statLabels[3].innerHTML = 'Completion Rate<svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
        if (supabaseClient) {
            const { data: faculty, error } = await supabaseClient
                .from('professors')
                .select('*')
                .eq('department', department);

            if (!error && faculty) {
                document.getElementById('totalUsers').textContent = faculty.length;
                const activeFaculty = faculty.filter(f => f.status === 'active').length;
                document.getElementById('newUsersText').textContent = `${activeFaculty} active`;
            }
        }

        // TODO: Load submission stats for department
        // TODO: Load pending reviews for department
        // TODO: Load completion rate for department
        
    } catch (error) {
        console.error('Error loading dean dashboard:', error);
    }
}

async function loadAdminDashboard(user) {
    try {
        const pageHeader = document.querySelector('.page-header h1');
        if (pageHeader) {
            pageHeader.textContent = 'System Dashboard';
        }
        if (supabaseClient) {
            const { data: professors, error: profError } = await supabaseClient
                .from('professors')
                .select('*');

            const { data: admins, error: adminError } = await supabaseClient
                .from('admins')
                .select('*');

            if (!profError && professors && !adminError && admins) {
                const totalUsers = professors.length + admins.length;
                document.getElementById('totalUsers').textContent = totalUsers;
                
                const newUsers = professors.filter(p => {
                    const createdDate = new Date(p.created_at);
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    return createdDate > thirtyDaysAgo;
                }).length;
                
                document.getElementById('newUsersText').textContent = `${newUsers} new this month`;
            }
            const { data: departments, error: deptError } = await supabaseClient
                .from('professors')
                .select('department');

            if (!deptError && departments) {
                const uniqueDepartments = [...new Set(departments.map(d => d.department).filter(d => d))];
                document.getElementById('totalDepartments').textContent = uniqueDepartments.length;
                document.getElementById('departmentsText').textContent = 'Active departments';
            }
        }

        // TODO: Load system-wide submission stats
        // TODO: Load system uptime and other metrics
        
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
    }
}

function initDashboardCharts() {
    const trendCtx = document.getElementById('trendChart');
    if (trendCtx) {
        new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Submissions',
                        data: [],
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
                        data: [],
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
                labels: [],
                datasets: [{
                    label: 'Completion Rate (%)',
                    data: [],
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
