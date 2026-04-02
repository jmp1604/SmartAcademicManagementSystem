/* ============================================================
   resc/js/enrollment.js
   Replaces PHP queries with Supabase JS client for Enrollments
============================================================ */

let allStudents = [];
let reportRows = [];
let META = { total: 0, enrolled: 0, enrollments: 0, notEnrolled: 0, date: '' };

document.addEventListener('DOMContentLoaded', async () => {
    if (!supabaseClient) {
        console.error('Supabase client not initialized.');
        return;
    }
    
    META.date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    document.getElementById('rmGenDate').textContent = `Generated ${META.date}`;

    await loadStudentsData();
    initFilters();
});

// ────────────────────────────────────────────
// 1. DATA LOADING 
// ────────────────────────────────────────────
async function loadStudentsData() {
    try {
        // 1. Fetch active students
        const { data: students, error: studentErr } = await supabaseClient
            .from('students')
            .select('*')
            .eq('status', 'active')
            .order('last_name', { ascending: true });

        if (studentErr) throw studentErr;

        // 2. Fetch active enrollments with nested schedule and subject info
        // Supabase automatically joins based on Foreign Keys
        const { data: enrollments, error: enrollErr } = await supabaseClient
            .from('schedule_enrollments')
            .select(`
                student_id, enrollment_id,
                lab_schedules (
                    schedule_id, section, day_of_week, start_time, end_time, semester, school_year,
                    subjects ( subject_code, subject_name ),
                    professors ( first_name, last_name ),
                    laboratory_rooms ( lab_code, lab_name )
                )
            `)
            .eq('status', 'enrolled');

        if (enrollErr) throw enrollErr;

        // Group enrollments by student_id to avoid N+1 queries later
        const enrollmentsByStudent = {};
        let totalEnrollmentCount = 0;
        const uniqueSubjects = new Set(); 

        enrollments.forEach(e => {
            totalEnrollmentCount++;
            if (!enrollmentsByStudent[e.student_id]) enrollmentsByStudent[e.student_id] = [];
            enrollmentsByStudent[e.student_id].push(e);

            if (e.lab_schedules && e.lab_schedules.subjects) {
                const sub = e.lab_schedules.subjects;
                uniqueSubjects.add(JSON.stringify({ code: sub.subject_code, name: sub.subject_name }));
            }
        });

        // Populate Dropdowns
        populateFilterDropdowns(uniqueSubjects, students);

        // Map data to students
        META.total = students.length;
        META.enrolled = 0;
        META.enrollments = totalEnrollmentCount;
        
        allStudents = students.map(student => {
            const studentEnrollments = enrollmentsByStudent[student.student_id] || [];
            if (studentEnrollments.length > 0) META.enrolled++;

            // Extract unique subject codes for badges and filtering
            const subjectCodes = [...new Set(studentEnrollments.map(e => e.lab_schedules?.subjects?.subject_code).filter(Boolean))];

            return {
                ...student,
                fullName: `${student.first_name} ${student.middle_name ? student.middle_name + ' ' : ''}${student.last_name}`,
                enrollmentCount: studentEnrollments.length,
                subjectCodes: subjectCodes,
                enrollmentData: studentEnrollments, // Storing this so we don't need to fetch on click!
                hasFace: !!student.facial_dataset_path
            };
        });

        META.notEnrolled = META.total - META.enrolled;

        // Update UI Stats
        document.getElementById('statTotal').textContent = META.total;
        document.getElementById('statEnrolled').textContent = META.enrolled;
        document.getElementById('statEnrollments').textContent = META.enrollments;

        // Prep Report Data
        reportRows = allStudents.map(s => ({
            id_number: s.id_number,
            first_name: s.first_name,
            last_name: s.last_name,
            middle_name: s.middle_name || '—',
            course: s.course || '—',
            year_level: s.year_level || '—',
            section: s.section || '—',
            email: s.email || '—',
            face_status: s.hasFace ? 'Registered' : 'Not Registered',
            enrollment_count: s.enrollmentCount,
            subjects: s.subjectCodes.join(', ')
        }));

        renderTable(allStudents);

    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('studentsTableBody').innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--red);">Error loading data.</td></tr>`;
    }
}

function populateFilterDropdowns(uniqueSubjects, students) {
    // Subjects
    const subjSelect = document.getElementById('subjectFilter');
    const parsedSubjects = Array.from(uniqueSubjects).map(s => JSON.parse(s)).sort((a,b) => a.code.localeCompare(b.code));
    subjSelect.innerHTML = '<option value="">All Subjects</option>' + 
        parsedSubjects.map(s => `<option value="${s.code}">${s.code} — ${s.name}</option>`).join('');

    // Sections (From Students table)
    const secSelect = document.getElementById('sectionFilter');
    const sections = [...new Set(students.map(s => s.section).filter(Boolean))].sort();
    secSelect.innerHTML = '<option value="">All Sections</option>' + 
        sections.map(s => `<option value="${s}">${s}</option>`).join('');
}

function renderTable(data) {
    const tbody = document.getElementById('studentsTableBody');
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">No students found matching filters.</td></tr>`;
        return;
    }

    let html = '';
    data.forEach(s => {
        let yearSection = '-';
        if (s.year_level && s.section) yearSection = s.year_level + s.section;
        else if (s.year_level) yearSection = s.year_level + 'yr';
        else if (s.section) yearSection = s.section;

        const enrollmentStatus = s.enrollmentCount > 0 ? 'enrolled' : 'not-enrolled';
        const faceIcon = s.hasFace 
            ? '<i class="fa-solid fa-check-circle face-status-icon registered" title="Face registered"></i>' 
            : '<i class="fa-solid fa-exclamation-circle face-status-icon pending" title="Not registered"></i>';

        const pills = s.subjectCodes.length > 0 
            ? `<div class="subject-pills" id="pills-${s.student_id}" style="display:none">
                 ${s.subjectCodes.map(code => `<span class="subject-pill">${code}</span>`).join('')}
               </div>` 
            : '';

        html += `
            <tr class="student-row" 
                data-student-id="${s.student_id}" 
                data-section="${s.section || ''}" 
                data-enrollment="${enrollmentStatus}" 
                data-subjects="${s.subjectCodes.join(',')}"
                onclick="toggleEnrollmentDetails(this)">
                
                <td><i class="fa-solid fa-chevron-right expand-icon"></i></td>
                <td><strong>${escapeHtml(s.id_number)}</strong></td>
                <td>
                    <strong>${escapeHtml(s.fullName)}</strong>
                    ${pills}
                </td>
                <td>${escapeHtml(s.course || '-')}</td>
                <td><span class="section-badge">${escapeHtml(yearSection)}</span></td>
                <td>${escapeHtml(s.email || '-')}</td>
                <td>${faceIcon}</td>
                <td>
                    <span class="enrollment-count-badge ${s.enrollmentCount === 0 ? 'zero' : ''}">
                        <i class="fa-solid fa-book"></i>
                        ${s.enrollmentCount} subject${s.enrollmentCount !== 1 ? 's' : ''}
                    </span>
                </td>
            </tr>
            <tr class="enrollment-details" id="details-${s.student_id}">
                <td colspan="8">
                    <div class="enrollment-content">
                        <div class="enrollment-grid" id="grid-${s.student_id}"></div>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// ────────────────────────────────────────────
// 2. FILTERS
// ────────────────────────────────────────────
function initFilters() {
    const search = document.getElementById('searchInput');
    const section = document.getElementById('sectionFilter');
    const subject = document.getElementById('subjectFilter');
    const enrollment = document.getElementById('enrollmentFilter');

    function apply() {
        const query = search.value.toLowerCase().trim();
        const sec = section.value;
        const sub = subject.value;
        const enr = enrollment.value;

        // Toggle visibility of subject pills if a specific subject is filtered
        document.querySelectorAll('.subject-pills').forEach(pills => {
            pills.style.display = sub ? 'flex' : 'none';
        });

        document.querySelectorAll('.student-row').forEach(row => {
            const studentSubjects = row.dataset.subjects.split(',');
            
            const visible = 
                (!query || row.textContent.toLowerCase().includes(query)) &&
                (!sec || row.dataset.section === sec) &&
                (!enr || row.dataset.enrollment === enr) &&
                (!sub || studentSubjects.includes(sub));

            row.style.display = visible ? '' : 'none';
            
            // Hide expanded details if parent row is hidden
            const detailsRow = row.nextElementSibling;
            if (detailsRow && detailsRow.classList.contains('enrollment-details')) {
                if (!visible) {
                    detailsRow.style.display = 'none';
                    detailsRow.classList.remove('active');
                    row.classList.remove('expanded');
                } else {
                    detailsRow.style.display = '';
                }
            }
        });
    }

    search.addEventListener('input', apply);
    [section, subject, enrollment].forEach(el => el.addEventListener('change', apply));

    document.getElementById('clearFilters').addEventListener('click', () => {
        search.value = ''; section.value = ''; subject.value = ''; enrollment.value = '';
        apply();
    });
}

// ────────────────────────────────────────────
// 3. EXPAND ROW (Render from pre-fetched data)
// ────────────────────────────────────────────
window.toggleEnrollmentDetails = function(row) {
    const studentId = row.dataset.studentId;
    const detailsRow = document.getElementById('details-' + studentId);
    const grid = document.getElementById('grid-' + studentId);

    // Collapse if already open
    if (row.classList.contains('expanded')) {
        row.classList.remove('expanded');
        detailsRow.classList.remove('active');
        return;
    }

    // Collapse all others
    document.querySelectorAll('.student-row').forEach(r => r.classList.remove('expanded'));
    document.querySelectorAll('.enrollment-details').forEach(d => d.classList.remove('active'));

    // Open clicked row
    row.classList.add('expanded');
    detailsRow.classList.add('active');

    // Render data
    if (!grid.dataset.rendered) {
        const student = allStudents.find(s => s.student_id === studentId);
        
        if (!student.enrollmentData || student.enrollmentData.length === 0) {
            grid.innerHTML = '<p class="no-enrollments"><i class="fa-solid fa-inbox"></i> This student is not enrolled in any active schedules.</p>';
        } else {
            // Map the Supabase nested structure for the HTML template
            const formattedEnrollments = student.enrollmentData.map(e => ({
                subject_code: e.lab_schedules?.subjects?.subject_code,
                subject_name: e.lab_schedules?.subjects?.subject_name,
                section: e.lab_schedules?.section,
                professor_name: `${e.lab_schedules?.professors?.first_name} ${e.lab_schedules?.professors?.last_name}`,
                day_of_week: e.lab_schedules?.day_of_week,
                start_time: e.lab_schedules?.start_time,
                end_time: e.lab_schedules?.end_time,
                lab_code: e.lab_schedules?.laboratory_rooms?.lab_code,
                lab_name: e.lab_schedules?.laboratory_rooms?.lab_name,
                semester: e.lab_schedules?.semester,
                school_year: e.lab_schedules?.school_year
            }));
            
            displayEnrollments(grid, formattedEnrollments);
        }
        grid.dataset.rendered = 'true';
    }
};

function displayEnrollments(grid, enrollments) {
    grid.innerHTML = enrollments.map(e => `
        <div class="subject-card">
            <div class="subject-header">${escapeHtml(e.subject_code)}</div>
            <div class="subject-detail"><i class="fa-solid fa-book"></i>${escapeHtml(e.subject_name)}</div>
            <div class="subject-detail"><i class="fa-solid fa-users"></i>Section: ${escapeHtml(e.section)}</div>
            <div class="subject-detail"><i class="fa-solid fa-chalkboard-teacher"></i>${escapeHtml(e.professor_name)}</div>
            <div class="subject-detail"><i class="fa-solid fa-calendar"></i>
                <span class="day-badge">${e.day_of_week}</span>
                ${formatTime12Hour(e.start_time)} - ${formatTime12Hour(e.end_time)}
            </div>
            <div class="subject-detail"><i class="fa-solid fa-door-open"></i>${escapeHtml(e.lab_code)} - ${escapeHtml(e.lab_name)}</div>
            <div class="subject-detail"><i class="fa-solid fa-graduation-cap"></i>${e.semester} ${e.school_year}</div>
        </div>
    `).join('');
}

function formatTime12Hour(timeString) {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${minutes} ${ampm}`;
}

// ────────────────────────────────────────────
// 4. UTILS & MODALS
// ────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

window.openReportModal = function() {
    document.getElementById('rmTotalChip').textContent = META.total;
    document.getElementById('rmEnrolledChip').textContent = META.enrolled;
    document.getElementById('rmEnrollmentsChip').textContent = META.enrollments;
    document.getElementById('rmNotEnrolledChip').textContent = META.notEnrolled;

    const tbody = document.getElementById('rmTableBody');
    tbody.innerHTML = reportRows.map((r, i) => `
        <tr>
            <td style="color:var(--text-muted);font-size:12px">${i+1}</td>
            <td><strong style="color:var(--green-dark);font-size:13px">${escapeHtml(r.id_number)}</strong></td>
            <td style="font-weight:700">${escapeHtml(r.last_name)}</td>
            <td>${escapeHtml(r.first_name)}</td>
            <td style="color:var(--text-muted)">${escapeHtml(r.middle_name)}</td>
            <td style="font-size:12px">${escapeHtml(r.course)}</td>
            <td style="text-align:center">${escapeHtml(r.year_level)}</td>
            <td style="text-align:center"><span style="background:var(--surface);color:var(--green-dark);padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid var(--border);">${escapeHtml(r.section)}</span></td>
            <td style="font-size:11.5px">${escapeHtml(r.email)}</td>
            <td><span class="rm-badge ${r.face_status==='Registered'?'registered':'not-registered'}">${r.face_status}</span></td>
            <td style="text-align:center"><strong>${r.enrollment_count}</strong></td>
            <td style="font-size:11.5px;color:var(--green-dark);font-weight:700;max-width:180px;word-break:break-word">${escapeHtml(r.subjects || '—')}</td>
        </tr>
    `).join('');
    
    document.getElementById('rmOverlay').classList.add('on');
}
window.closeReportModal = function() { document.getElementById('rmOverlay').classList.remove('on'); }

// ────────────────────────────────────────────
// 5. EXPORT / REPORTS
// ────────────────────────────────────────────
window.exportCSV = function() {
    const cols = ['#','Student ID','Last Name','First Name','Middle Name','Course','Year','Section','Email','Face Status','Enrolled Subjects','Subject Codes'];
    const lines = [
        cols.join(','),
        ...reportRows.map((r,i) => [
            i+1, r.id_number, `"${r.last_name}"`, `"${r.first_name}"`, `"${r.middle_name||''}"`,
            r.course, r.year_level, r.section, `"${r.email}"`, r.face_status, r.enrollment_count,
            `"${(r.subjects||'').replace(/"/g,'""')}"`
        ].join(','))
    ];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], {type:'text/csv'}));
    a.download = `Enrollment_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

window.printReport = function() { alert("Print functionality triggered (use jsPDF from original logic)"); }
window.downloadPDF = function() { alert("PDF download triggered (use jsPDF from original logic)"); }