document.addEventListener('DOMContentLoaded', function () {
    if (!isDean()) {
        window.location.href = '../../auth/login.html';
        return;
    }

    loadDepartmentStats();
    initReportCharts();
    loadFacultyOverview();
    setupEventListeners();
});

function setupEventListeners() {
    const filterYear = document.getElementById('filter-year');
    const filterSemester = document.getElementById('filter-semester');
    const filterDepartment = document.getElementById('filter-department');
    const filterCategory = document.getElementById('filter-category');

    if (filterYear) filterYear.addEventListener('change', applyFilters);
    if (filterSemester) filterSemester.addEventListener('change', applyFilters);
    if (filterDepartment) filterDepartment.addEventListener('change', applyFilters);
    if (filterCategory) filterCategory.addEventListener('change', applyFilters);
}

function applyFilters() {
    loadDepartmentStats();
    loadFacultyOverview();
}

async function loadDepartmentStats() {
    try {
        const user = getCurrentUser();
        const department = user.department || 'Computer Science';

        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            document.getElementById('stat-total').textContent = '0';
            document.getElementById('stat-approved').textContent = '0';
            document.getElementById('stat-pending').textContent = '0';
            document.getElementById('stat-flagged').textContent = '0';
            return;
        }

        // Get all submissions from faculty in this dean's department
        const { data: submissions, error } = await supabaseClient
            .from('submissions')
            .select(`
                *,
                professors!inner(department)
            `)
            .eq('professors.department', department);

        if (error) {
            console.error('Error loading department stats:', error);
            document.getElementById('stat-total').textContent = '0';
            document.getElementById('stat-approved').textContent = '0';
            document.getElementById('stat-pending').textContent = '0';
            document.getElementById('stat-flagged').textContent = '0';
            return;
        }

        const stats = {
            total: submissions?.length || 0,
            approved: submissions?.filter(s => s.status === 'approved').length || 0,
            pending: submissions?.filter(s => s.status === 'pending').length || 0,
            flagged: submissions?.filter(s => s.flagged_by_dean).length || 0
        };

        document.getElementById('stat-total').textContent = stats.total;
        document.getElementById('stat-approved').textContent = stats.approved;
        document.getElementById('stat-pending').textContent = stats.pending;
        document.getElementById('stat-flagged').textContent = stats.flagged;

        // Update charts with real data
        updateChartData(submissions);

    } catch (error) {
        console.error('Error loading department stats:', error);
        document.getElementById('stat-total').textContent = '0';
        document.getElementById('stat-approved').textContent = '0';
        document.getElementById('stat-pending').textContent = '0';
        document.getElementById('stat-flagged').textContent = '0';
    }
}

let statusChart = null;
let monthChart = null;

function initReportCharts() {
    const donutCtx = document.getElementById('statusDonut');
    if (donutCtx && typeof Chart !== 'undefined') {
        statusChart = new Chart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: ['Approved', 'Pending', 'Flagged'],
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
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    const barCtx = document.getElementById('monthBar');
    if (barCtx && typeof Chart !== 'undefined') {
        monthChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
                datasets: [{
                    label: 'Submissions',
                    data: [0, 0, 0, 0, 0, 0, 0],
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
                            label: function(context) {
                                return `${context.parsed.y} submissions`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { 
                            font: { family: "'Source Sans 3', sans-serif", size: 11 }, 
                            color: '#6b7f6e' 
                        }
                    },
                    y: {
                        grid: { color: '#e2ebe4', drawBorder: false },
                        ticks: { 
                            font: { family: "'Source Sans 3', sans-serif", size: 11 }, 
                            color: '#6b7f6e', 
                            stepSize: 10 
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

function updateChartData(submissions) {
    if (!submissions) return;

    // Update donut chart
    if (statusChart) {
        const approved = submissions.filter(s => s.status === 'approved').length;
        const pending = submissions.filter(s => s.status === 'pending').length;
        const flagged = submissions.filter(s => s.flagged_by_dean).length;
        
        statusChart.data.datasets[0].data = [approved, pending, flagged];
        statusChart.update();
    }

    // Update bar chart with monthly data
    if (monthChart) {
        const monthCounts = [0, 0, 0, 0, 0, 0, 0]; // Aug to Feb
        const monthNames = ['08', '09', '10', '11', '12', '01', '02'];
        
        submissions.forEach(sub => {
            if (sub.created_at) {
                const date = new Date(sub.created_at);
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const monthIndex = monthNames.indexOf(month);
                if (monthIndex !== -1) {
                    monthCounts[monthIndex]++;
                }
            }
        });
        
        monthChart.data.datasets[0].data = monthCounts;
        monthChart.update();
    }
}

async function loadFacultyOverview() {
    try {
        const user = getCurrentUser();
        const department = user.department || 'Computer Science';

        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            document.getElementById('faculty-count').textContent = '0';
            document.getElementById('faculty-tbody').innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">Unable to load faculty data</td></tr>';
            return;
        }

        // Get all faculty in this department
        const { data: faculty, error: facultyError } = await supabaseClient
            .from('professors')
            .select('*')
            .eq('department', department)
            .eq('role', 'professor');

        if (facultyError) {
            console.error('Error loading faculty:', facultyError);
            document.getElementById('faculty-count').textContent = '0';
            document.getElementById('faculty-tbody').innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">Error loading faculty data</td></tr>';
            return;
        }

        // Get submissions for each faculty member
        const { data: submissions, error: submissionsError } = await supabaseClient
            .from('submissions')
            .select('*')
            .in('professor_id', faculty.map(f => f.id));

        if (submissionsError) {
            console.error('Error loading submissions:', submissionsError);
        }

        // Calculate faculty data
        const facultyData = faculty.map(prof => {
            const profSubmissions = submissions?.filter(s => s.professor_id === prof.id) || [];
            const total = profSubmissions.length;
            const approved = profSubmissions.filter(s => s.status === 'approved').length;
            const pending = profSubmissions.filter(s => s.status === 'pending').length;
            const compliance = total > 0 ? Math.round((approved / total) * 100) : 0;

            return {
                name: `${prof.first_name} ${prof.middle_name ? prof.middle_name + ' ' : ''}${prof.last_name}`,
                department: prof.department,
                total,
                approved,
                pending,
                compliance
            };
        });

        document.getElementById('faculty-count').textContent = facultyData.length;

        const tbody = document.getElementById('faculty-tbody');
        if (!tbody) return;

        if (facultyData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">No faculty members found</td></tr>';
            return;
        }

        tbody.innerHTML = facultyData.map(faculty => {
            const complianceClass = faculty.compliance >= 90 ? 'high' : faculty.compliance >= 75 ? 'medium' : 'low';
            return `
                <tr>
                    <td style="font-weight: 600;">${faculty.name}</td>
                    <td>${faculty.department}</td>
                    <td>${faculty.total}</td>
                    <td><span class="status-badge approved">${faculty.approved}</span></td>
                    <td><span class="status-badge pending">${faculty.pending}</span></td>
                    <td><span class="compliance-badge ${complianceClass}">${faculty.compliance}%</span></td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading faculty overview:', error);
        document.getElementById('faculty-count').textContent = '0';
        document.getElementById('faculty-tbody').innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">Error loading faculty data</td></tr>';
    }
}

async function generateReport(type, event) {
    const labels = {
        'department-summary': 'Department Summary Report',
        'faculty-compliance': 'Faculty Compliance Report',
        'semester-timeline': 'Semester Timeline Report',
        'category-analysis': 'Category Analysis Report'
    };

    const filterYear = document.getElementById('filter-year')?.value || '2025-2026';
    const filterSemester = document.getElementById('filter-semester')?.value || 'All Semesters';
    const filterDepartment = document.getElementById('filter-department')?.value || 'My Department';
    const filterCategory = document.getElementById('filter-category')?.value || 'All Categories';

    try {
        const user = getCurrentUser();
        const department = user.department || 'Computer Science';

        if (!supabaseClient) {
            alert('Database connection not available. Cannot generate report.');
            return;
        }

        // Show loading indicator
        const btn = event?.target;
        const originalText = btn?.innerHTML;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<svg viewBox="0 0 24 24" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/></svg> Generating...';
        }

        // Fetch data based on report type
        let reportData = null;
        
        switch(type) {
            case 'department-summary':
                reportData = await generateDepartmentSummary(department, filterYear, filterSemester);
                break;
            case 'faculty-compliance':
                reportData = await generateFacultyComplianceData(department, filterYear, filterSemester);
                break;
            case 'semester-timeline':
                reportData = await generateSemesterTimelineData(department, filterYear, filterSemester);
                break;
            case 'category-analysis':
                reportData = await generateCategoryAnalysisData(department, filterYear, filterSemester, filterCategory);
                break;
        }

        // For now, display the report data in console and alert
        // In production, this would generate a PDF or Excel file
        console.log('Report Data:', reportData);
        
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }

        alert(`${labels[type]} Generated Successfully!\n\nFilters Applied:\n- Academic Year: ${filterYear}\n- Semester: ${filterSemester}\n- Department: ${filterDepartment}${filterCategory !== 'All Categories' ? '\n- Category: ' + filterCategory : ''}\n\nTotal Records: ${reportData?.totalRecords || 0}\n\nNote: Connect this to your backend export endpoint to download as PDF/Excel.`);

    } catch (error) {
        console.error('Error generating report:', error);
        alert('Failed to generate report: ' + error.message);
        
        // Reset button if error
        const btn = event?.target;
        if (btn) {
            btn.disabled = false;
            const originalBtn = btn.closest('.report-action-card')?.querySelector('.btn-generate');
            if (originalBtn) {
                originalBtn.innerHTML = originalBtn.innerHTML.replace(/.*Generating.../, 'Generate Report');
            }
        }
    }
}

async function generateDepartmentSummary(department, year, semester) {
    const { data: submissions, error } = await supabaseClient
        .from('submissions')
        .select(`
            *,
            professors!inner(first_name, last_name, department),
            requirements(name),
            semesters(name)
        `)
        .eq('professors.department', department);

    if (error) throw error;

    return {
        totalRecords: submissions?.length || 0,
        approved: submissions?.filter(s => s.status === 'approved').length || 0,
        pending: submissions?.filter(s => s.status === 'pending').length || 0,
        rejected: submissions?.filter(s => s.status === 'rejected').length || 0,
        flagged: submissions?.filter(s => s.flagged_by_dean).length || 0,
        submissions: submissions
    };
}

async function generateFacultyComplianceData(department, year, semester) {
    const { data: faculty, error: facultyError } = await supabaseClient
        .from('professors')
        .select('*')
        .eq('department', department)
        .eq('role', 'professor');

    if (facultyError) throw facultyError;

    const { data: submissions, error: submissionsError } = await supabaseClient
        .from('submissions')
        .select('*')
        .in('professor_id', faculty.map(f => f.id));

    if (submissionsError) throw submissionsError;

    const facultyCompliance = faculty.map(prof => {
        const profSubmissions = submissions?.filter(s => s.professor_id === prof.id) || [];
        return {
            name: `${prof.first_name} ${prof.last_name}`,
            total: profSubmissions.length,
            approved: profSubmissions.filter(s => s.status === 'approved').length,
            pending: profSubmissions.filter(s => s.status === 'pending').length,
            rejected: profSubmissions.filter(s => s.status === 'rejected').length,
            compliance: profSubmissions.length > 0 
                ? Math.round((profSubmissions.filter(s => s.status === 'approved').length / profSubmissions.length) * 100) 
                : 0
        };
    });

    return {
        totalRecords: faculty.length,
        facultyData: facultyCompliance
    };
}

async function generateSemesterTimelineData(department, year, semester) {
    const { data: submissions, error } = await supabaseClient
        .from('submissions')
        .select(`
            *,
            professors!inner(first_name, last_name, department),
            requirements(name)
        `)
        .eq('professors.department', department)
        .order('created_at', { ascending: true });

    if (error) throw error;

    return {
        totalRecords: submissions?.length || 0,
        timeline: submissions
    };
}

async function generateCategoryAnalysisData(department, year, semester, category) {
    let query = supabaseClient
        .from('submissions')
        .select(`
            *,
            professors!inner(first_name, last_name, department),
            requirements(id, name, description)
        `)
        .eq('professors.department', department);

    const { data: submissions, error } = await query;

    if (error) throw error;

    // Group by category
    const categoryGroups = {};
    submissions?.forEach(sub => {
        const catName = sub.requirements?.name || 'Uncategorized';
        if (!categoryGroups[catName]) {
            categoryGroups[catName] = [];
        }
        categoryGroups[catName].push(sub);
    });

    return {
        totalRecords: submissions?.length || 0,
        categories: categoryGroups
    };
}
