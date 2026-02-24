// Dashboard-specific functionality
// 
// Supabase Usage Examples:
// -----------------------
// Query data: const { data, error } = await supabaseClient.from('table_name').select('*');
// Insert data: await supabaseClient.from('table_name').insert({ column: 'value' });
// Update data: await supabaseClient.from('table_name').update({ column: 'new_value' }).eq('id', 1);
// Delete data: await supabaseClient.from('table_name').delete().eq('id', 1);
// 
// The supabaseClient is globally available after config.js loads
//

document.addEventListener('DOMContentLoaded', function () {
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
