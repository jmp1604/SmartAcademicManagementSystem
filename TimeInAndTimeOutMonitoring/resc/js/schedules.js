/* ============================================================
   resc/js/schedules.js
   Replaces PHP queries with Supabase JS client for Schedules
============================================================ */

let allSchedules = [];
let META = { total: 0, active: 0, inactive: 0, date: '' };

document.addEventListener('DOMContentLoaded', async () => {
    if (!supabaseClient) {
        console.error('Supabase client not initialized.');
        return;
    }
    
    META.date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    document.getElementById('rmGenDate').textContent = `Generated ${META.date}`;

    // Set default School Year in modal form
    const yr = new Date().getFullYear();
    document.getElementById('schoolYear').value = `${yr}-${yr+1}`;

    await loadDropdowns();
    await loadSchedulesData();
    initFilters();
    initConflictChecker();
});

// ────────────────────────────────────────────
// 1. DATA LOADING (Dropdowns & Main Table)
// ────────────────────────────────────────────
async function loadDropdowns() {
    try {
        // Fetch active professors
        const { data: profs } = await supabaseClient
            .from('professors').select('professor_id, employee_id, first_name, last_name').eq('status', 'active').order('last_name');
        
        // Fetch active subjects
        const { data: subjects } = await supabaseClient
            .from('subjects').select('subject_id, subject_code, subject_name').order('subject_code');
        
        // Fetch active/reserved labs
        const { data: labs } = await supabaseClient
            .from('laboratory_rooms').select('lab_id, lab_code, lab_name').in('status', ['available', 'reserved']).order('lab_code');

        // Fetch course, year, and section from students table and format as "BSIT-3A"
        const { data: studentsData } = await supabaseClient
            .from('students').select('course, year_level, section');
            
        const uniqueSections = [...new Set(studentsData.map(s => {
            const course = s.course ? s.course.trim() : '';
            const year   = s.year_level ? s.year_level.toString().trim() : '';
            const sec    = s.section ? s.section.trim() : '';
            
            if (!course && !year && !sec) return null;
            
            let combined = '';
            if (course) combined += course;
            if (course && (year || sec)) combined += '-';
            combined += `${year}${sec}`;
            
            return combined;
        }).filter(Boolean))].sort();

        // Populate Form Dropdowns
        populateSelect('professorId', profs, p => p.professor_id, p => `${p.first_name} ${p.last_name} (${p.employee_id})`);
        populateSelect('subjectId', subjects, s => s.subject_id, s => `${s.subject_code} - ${s.subject_name}`);
        populateSelect('labId', labs, l => l.lab_id, l => `${l.lab_code} - ${l.lab_name}`);
        
        const secSelect = document.getElementById('section');
        secSelect.innerHTML = '<option value="" disabled selected>-- Select Section --</option>' + 
            uniqueSections.map(sec => `<option value="${sec}">${sec}</option>`).join('');

        // Populate Filter Dropdown for Labs
        const labFilter = document.getElementById('labFilter');
        labFilter.innerHTML = '<option value="all">All Laboratories</option>' + 
            labs.map(l => `<option value="${l.lab_code}">${l.lab_code} - ${l.lab_name}</option>`).join('');

    } catch (error) {
        console.error("Error loading dropdowns:", error);
    }
}

function populateSelect(id, data, valFn, textFn) {
    const select = document.getElementById(id);
    const options = data ? data.map(item => `<option value="${valFn(item)}">${escapeHtml(textFn(item))}</option>`).join('') : '';
    select.innerHTML = `<option value="" disabled selected>-- Select Option --</option>${options}`;
}

async function loadSchedulesData() {
    try {
        const { data, error } = await supabaseClient
            .from('lab_schedules')
            .select(`
                *,
                professors ( professor_id, first_name, last_name, employee_id ),
                subjects ( subject_id, subject_code, subject_name ),
                laboratory_rooms ( lab_id, lab_code, lab_name ),
                schedule_enrollments ( 
                    enrollment_id, 
                    status,
                    students ( student_id, course, year_level, section )
                ),
                lab_sessions ( session_id, status )
            `)
            .order('day_of_week')
            .order('start_time');

        if (error) throw error;

        META.total = data.length;
        META.active = 0;
        allSchedules = data.map(s => {
            if (s.status === 'active') META.active++;
            
            // Calculate enrolled students and determine the representative section
            let enrolledStudentsList = [];
            if (s.schedule_enrollments) {
                 enrolledStudentsList = s.schedule_enrollments
                    .filter(e => e.status === 'enrolled' && e.students)
                    .map(e => e.students);
            }
            
            const enrolled_count = enrolledStudentsList.length;
            
            // Determine the "Students" column format (e.g., BSIT-3A) based on the first enrolled student.
            // If you want to show a summary of multiple sections if they are mixed, you would handle that here.
            // For now, we will use the section stored in the lab_schedules table, assuming it matches the format you want.
            // If the schedule table's 'section' field is just "A", but you want "BSIT-3A", you must fetch it from the enrolled students.
            
            let displaySection = s.section; // Fallback to schedule's section
            if (enrolledStudentsList.length > 0) {
                 // Attempt to build the string from the first enrolled student's data
                 const firstStudent = enrolledStudentsList[0];
                 const course = firstStudent.course ? firstStudent.course.trim() : '';
                 const year   = firstStudent.year_level ? firstStudent.year_level.toString().trim() : '';
                 const sec    = firstStudent.section ? firstStudent.section.trim() : '';
                 
                 let combined = '';
                 if (course) combined += course;
                 if (course && (year || sec)) combined += '-';
                 combined += `${year}${sec}`;
                 
                 if (combined) {
                     displaySection = combined;
                 }
            }


            const sessionsDone = s.lab_sessions ? s.lab_sessions.filter(ls => ls.status === 'completed').length : 0;

            return {
                ...s,
                profFullName: s.professors ? `${s.professors.first_name} ${s.professors.last_name}` : 'Unknown',
                enrolled_count: enrolled_count,
                sessions_done: sessionsDone,
                display_section: displaySection // Use this for the "Students" column
            };
        });

        META.inactive = META.total - META.active;

        document.getElementById('statTotal').textContent = META.total;
        document.getElementById('statActive').textContent = META.active;
        document.getElementById('statInactive').textContent = META.inactive;

        renderTable(allSchedules);

    } catch (error) {
        console.error('Error loading schedules:', error);
        document.getElementById('schedulesBody').innerHTML = `<tr><td colspan="11" style="text-align:center;color:red;">Error loading data.</td></tr>`;
    }
}

// Format time to 12-Hour AM/PM
function formatTimeStr(timeString) {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h.toString().padStart(2, '0')}:${minutes} ${ampm}`;
}

function renderTable(data) {
    const tbody = document.getElementById('schedulesBody');
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text-muted);">No schedules found.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(s => `
        <tr data-day="${s.day_of_week}" data-status="${s.status}" data-lab="${s.laboratory_rooms?.lab_code || ''}">
            <td><strong>#${s.schedule_id.split('-')[0]}</strong></td> <td>
                <div class="professor-chip">
                    <span>${escapeHtml(s.profFullName)}</span>
                    <small>${s.professors?.employee_id || ''}</small>
                </div>
            </td>
            <td><strong>${s.subjects?.subject_code || ''}</strong><br><span style="font-size:11px;color:var(--text-muted)">${escapeHtml(s.subjects?.subject_name || '')}</span></td>
            <td>${escapeHtml(s.display_section)}</td> <td><span class="day-badge">${s.day_of_week}</span></td>
            <td style="white-space:nowrap;font-size:12px;color:var(--text-dark)">
                <i class="fa-solid fa-clock" style="color:var(--text-muted);font-size:11px"></i> ${formatTimeStr(s.start_time)}<br>
                ${formatTimeStr(s.end_time)}
            </td>
            <td>
                <div class="lab-chip">
                    <span>${s.laboratory_rooms?.lab_code || ''}</span>
                    <small>${escapeHtml(s.laboratory_rooms?.lab_name || '')}</small>
                </div>
            </td>
            <td>${s.semester}<br><span style="font-size:11.5px;color:var(--text-muted)">${s.school_year}</span></td>
            <td><span class="status-badge ${s.status}">${s.status}</span></td>
            <td>
                <strong style="color:var(--text-dark)">${s.enrolled_count}</strong><br>
                <span style="font-size:11px;color:var(--text-muted)">students</span>
            </td>
            <td>
                <div class="table-actions">
                    <button class="action-btn view" title="View Enrollments" onclick="viewEnrollments('${s.schedule_id}')"><i class="fa-solid fa-users"></i> Students</button>
                    <button class="action-btn edit" title="Edit Schedule" onclick='editSchedule(${JSON.stringify(s).replace(/'/g, "&#39;")})'><i class="fa-solid fa-edit"></i> Edit</button>
                    <button class="action-btn delete" title="Delete Schedule" onclick="deleteSchedule('${s.schedule_id}', '${s.subjects?.subject_code} - ${s.section}')"><i class="fa-solid fa-trash"></i> Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ────────────────────────────────────────────
// 2. FILTERS
// ────────────────────────────────────────────
function initFilters() {
    const search = document.getElementById('searchInput');
    const day = document.getElementById('dayFilter');
    const status = document.getElementById('statusFilter');
    const lab = document.getElementById('labFilter');

    function apply() {
        const q = search.value.toLowerCase().trim();
        const d = day.value, st = status.value, l = lab.value;
        
        const filtered = allSchedules.filter(s => {
            const searchStr = `${s.profFullName} ${s.subjects?.subject_code} ${s.subjects?.subject_name} ${s.display_section} ${s.laboratory_rooms?.lab_code}`.toLowerCase();
            const matchQ = !q || searchStr.includes(q);
            const matchD = d === 'all' || s.day_of_week === d;
            const matchSt = st === 'all' || s.status === st;
            const matchL = l === 'all' || s.laboratory_rooms?.lab_code === l;
            return matchQ && matchD && matchSt && matchL;
        });
        renderTable(filtered);
    }

    search.addEventListener('input', apply);
    [day, status, lab].forEach(el => el.addEventListener('change', apply));

    document.getElementById('clearFilters').addEventListener('click', () => {
        search.value = ''; day.value = 'all'; status.value = 'all'; lab.value = 'all';
        renderTable(allSchedules);
    });
}

// ────────────────────────────────────────────
// 3. ADD/EDIT & CONFLICT CHECKING
// ────────────────────────────────────────────
document.getElementById('addScheduleBtn').addEventListener('click', () => {
    document.getElementById('scheduleForm').reset();
    document.getElementById('scheduleId').value = '';
    document.getElementById('schedModalTitleText').textContent = 'Add Schedule';
    document.getElementById('submitBtnText').textContent = 'Save Schedule';
    document.getElementById('conflictWarning').style.display = 'none';
    openSchedModal('scheduleModal');
});

function editSchedule(s) {
    document.getElementById('scheduleId').value = s.schedule_id;
    document.getElementById('professorId').value = s.professor_id;
    document.getElementById('subjectId').value = s.subject_id;
    document.getElementById('section').value = s.display_section; // Use the formatted string for the form
    document.getElementById('labId').value = s.lab_id;
    document.getElementById('dayOfWeek').value = s.day_of_week;
    document.getElementById('startTime').value = s.start_time;
    document.getElementById('endTime').value = s.end_time;
    document.getElementById('semester').value = s.semester;
    document.getElementById('schoolYear').value = s.school_year;
    document.getElementById('schedStatus').value = s.status;
    
    document.getElementById('schedModalTitleText').textContent = 'Edit Schedule';
    document.getElementById('submitBtnText').textContent = 'Update Schedule';
    document.getElementById('conflictWarning').style.display = 'none';
    openSchedModal('scheduleModal');
}

// Conflict Checker (Real-Time JS Logic)
function initConflictChecker() {
    ['professorId', 'labId', 'dayOfWeek', 'startTime', 'endTime'].forEach(id => {
        document.getElementById(id).addEventListener('change', checkConflict);
    });
}

function checkConflict() {
    const profId = document.getElementById('professorId').value;
    const labId = document.getElementById('labId').value;
    const day = document.getElementById('dayOfWeek').value;
    const start = document.getElementById('startTime').value;
    const end = document.getElementById('endTime').value;
    const schedId = document.getElementById('scheduleId').value;

    if (!profId || !labId || !day || !start || !end) return;

    // Filter local active schedules for overlap
    const conflicts = allSchedules.filter(s => {
        if (s.status !== 'active') return false;
        if (schedId && s.schedule_id === schedId) return false; // Ignore self when editing
        if (s.day_of_week !== day) return false;
        
        // Time overlap logic (A starts before B ends AND A ends after B starts)
        const overlapsTime = start < s.end_time && end > s.start_time;
        
        // Conflict if times overlap AND (it's the same lab OR same professor)
        return overlapsTime && (s.lab_id === labId || s.professor_id === profId);
    });

    const warnDiv = document.getElementById('conflictWarning');
    const submitBtn = document.getElementById('submitBtn');

    if (conflicts.length > 0) {
        let html = `<h4><i class="fa-solid fa-exclamation-triangle"></i> Schedule Conflict!</h4>`;
        conflicts.forEach(c => {
            html += `<div class="conflict-item">
                <strong>${c.subjects?.subject_code} - ${c.display_section}</strong><br>
                Professor: ${c.profFullName}<br>
                Lab: ${c.laboratory_rooms?.lab_code}<br>
                Time: ${formatTimeStr(c.start_time)} - ${formatTimeStr(c.end_time)}
            </div>`;
        });
        html += `<p style="margin-top:10px;font-weight:700">Please adjust time, professor, or laboratory.</p>`;
        warnDiv.innerHTML = html;
        warnDiv.style.display = 'block';
        submitBtn.disabled = true;
    } else {
        warnDiv.style.display = 'none';
        submitBtn.disabled = false;
    }
}

// Form Submission
document.getElementById('scheduleForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const st = document.getElementById('startTime').value;
    const et = document.getElementById('endTime').value;
    if (et <= st) {
        alert('End time must be after start time.');
        return;
    }

    const btn = document.getElementById('submitBtn');
    const ogText = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    const id = document.getElementById('scheduleId').value;
    const formData = new FormData(this);
    const payload = Object.fromEntries(formData.entries());
    delete payload.schedule_id; // Let DB handle/keep ID
    
    // Save the selected format (e.g. BSIT-3A) into the section column
    payload.section = formData.get('section');

    try {
        let savedScheduleId = id;
        
        if (id) {
            const { error } = await supabaseClient.from('lab_schedules').update(payload).eq('schedule_id', id);
            if (error) throw error;
        } else {
            const { data, error } = await supabaseClient.from('lab_schedules').insert([payload]).select();
            if (error) throw error;
            savedScheduleId = data[0].schedule_id;
        }
        
        // ── AUTO-ENROLL STUDENTS MATCHING THE SECTION ──
        await autoEnrollStudents(savedScheduleId, payload.section);

        showToast("Schedule saved and students enrolled!");
        closeSchedModal('scheduleModal');
        await loadSchedulesData();
    } catch (err) {
        alert("Error saving: " + err.message);
    } finally {
        btn.disabled = false; btn.innerHTML = ogText;
    }
});

// ── AUTO-ENROLL LOGIC ──
async function autoEnrollStudents(scheduleId, sectionString) {
     try {
         // Parse the selected section string (e.g., "BSIT-3A")
         let targetCourse = '';
         let targetYear = null;
         let targetSection = '';

         if (sectionString.includes('-')) {
             const parts = sectionString.split('-');
             targetCourse = parts[0];
             // Expecting formats like "3A", "1B"
             if (parts[1] && parts[1].length > 0) {
                  targetYear = parseInt(parts[1][0]);
                  targetSection = parts[1].substring(1);
             }
         }

         // Fetch matching students
         let query = supabaseClient.from('students').select('student_id').eq('status', 'active');
         
         if (targetCourse) query = query.eq('course', targetCourse);
         if (targetYear) query = query.eq('year_level', targetYear);
         if (targetSection) query = query.eq('section', targetSection);

         const { data: matchedStudents, error: fetchErr } = await query;
         if (fetchErr) throw fetchErr;

         if (matchedStudents && matchedStudents.length > 0) {
              // Prepare bulk insert payload
              const enrollments = matchedStudents.map(student => ({
                  schedule_id: scheduleId,
                  student_id: student.student_id,
                  status: 'enrolled'
              }));

              // Delete existing enrollments for this schedule first to avoid duplicates
              await supabaseClient.from('schedule_enrollments').delete().eq('schedule_id', scheduleId);
              
              // Insert new enrollments
              const { error: enrollErr } = await supabaseClient.from('schedule_enrollments').insert(enrollments);
              if (enrollErr) throw enrollErr;
         }
     } catch (err) {
         console.error("Auto-enrollment failed:", err);
         throw err;
     }
}


async function deleteSchedule(id, info) {
    if (!confirm(`Delete schedule for: ${info}?\n\nWarning: Associated sessions and enrollments may be deleted.`)) return;
    try {
        const { error } = await supabaseClient.from('lab_schedules').delete().eq('schedule_id', id);
        if (error) throw error;
        showToast("Schedule removed.");
        await loadSchedulesData();
    } catch(err) {
        alert("Error deleting: " + err.message);
    }
}

// ────────────────────────────────────────────
// 4. VIEW ENROLLMENTS
// ────────────────────────────────────────────
async function viewEnrollments(scheduleId) {
    const s = allSchedules.find(x => x.schedule_id === scheduleId);
    document.getElementById('enrollScheduleInfo').textContent = `${s.subjects.subject_code} | Sec: ${s.display_section} | ${s.day_of_week} ${formatTimeStr(s.start_time)} | Lab: ${s.laboratory_rooms.lab_code}`;
    
    document.getElementById('enrollmentsList').innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;
    openSchedModal('enrollmentsModal');

    try {
        const { data, error } = await supabaseClient
            .from('schedule_enrollments')
            .select(`
                status, created_at,
                students ( student_id, id_number, first_name, last_name, course, year_level, section, facial_dataset_path )
            `)
            .eq('schedule_id', scheduleId)
            .eq('status', 'enrolled');

        if (error) throw error;

        // We filter out any null student records in case of foreign key mismatches
        const validEnrollments = data.filter(e => e.students);

        document.getElementById('enrollCount').textContent = validEnrollments.length;
        const faceReg = validEnrollments.filter(e => e.students.facial_dataset_path).length;
        document.getElementById('faceRegCount').textContent = faceReg;
        document.getElementById('pendingCount').textContent = validEnrollments.length - faceReg;

        const tbody = document.getElementById('enrollmentsList');
        if (validEnrollments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">No students enrolled.</td></tr>';
            return;
        }

        // Sort by last name locally
        validEnrollments.sort((a,b) => a.students.last_name.localeCompare(b.students.last_name));

        tbody.innerHTML = validEnrollments.map(e => {
            const st = e.students;
            const hasFace = !!st.facial_dataset_path;
            const faceHtml = hasFace 
                ? '<span style="color:var(--green-dark);font-weight:700"><i class="fa-solid fa-check-circle"></i> Registered</span>'
                : '<span style="color:#d97706;font-weight:700"><i class="fa-solid fa-exclamation-circle"></i> Pending</span>';
            const date = e.created_at ? new Date(e.created_at).toLocaleDateString() : '-';

            return `<tr>
                <td><strong>${escapeHtml(st.id_number)}</strong></td>
                <td><strong>${escapeHtml(st.first_name)} ${escapeHtml(st.last_name)}</strong></td>
                <td>${escapeHtml(st.course || '-')}</td>
                <td>${st.year_level || ''}${st.section || ''}</td>
                <td>${faceHtml}</td>
                <td>${date}</td>
            </tr>`;
        }).join('');

    } catch (err) {
        document.getElementById('enrollmentsList').innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--red)">Error loading enrollments.</td></tr>`;
    }
}

// ────────────────────────────────────────────
// 5. UTILS & MODALS
// ────────────────────────────────────────────
function openSchedModal(id) { document.getElementById(id).classList.add('active'); }
function closeSchedModal(id) { document.getElementById(id).classList.remove('active'); }

function openReportModal() {
    document.getElementById('rmTotalChip').textContent = META.total;
    document.getElementById('rmActiveChip').textContent = META.active;
    document.getElementById('rmInactiveChip').textContent = META.inactive;

    const tbody = document.getElementById('rmTableBody');
    tbody.innerHTML = allSchedules.map((r, i) => `
        <tr>
            <td style="color:var(--text-muted);font-size:11px">${i+1}</td>
            <td style="font-weight:800;color:var(--green-dark);font-size:12px">#${r.schedule_id.split('-')[0]}</td>
            <td><strong>${escapeHtml(r.profFullName)}</strong><br><small style="color:var(--text-muted)">${r.professors?.employee_id || ''}</small></td>
            <td style="font-weight:800;color:var(--green-dark)">${r.subjects?.subject_code || ''}</td>
            <td style="font-size:12px;color:var(--text-body)">${escapeHtml(r.subjects?.subject_name || '')}</td>
            <td style="font-weight:700">${escapeHtml(r.display_section)}</td>
            <td><span class="day-badge">${r.day_of_week}</span></td>
            <td style="white-space:nowrap;font-size:12px">${formatTimeStr(r.start_time)} – ${formatTimeStr(r.end_time)}</td>
            <td style="font-size:12px">${r.laboratory_rooms?.lab_code || ''}<br><span style="color:var(--text-muted);font-size:10.5px">${escapeHtml(r.laboratory_rooms?.lab_name || '')}</span></td>
            <td style="font-size:12px">${r.semester}</td>
            <td style="font-size:12px">${r.school_year}</td>
            <td><span class="rm-badge ${r.status}">${r.status}</span></td>
            <td style="text-align:center"><strong>${r.enrolled_count}</strong></td>
            <td style="text-align:center"><strong>${r.sessions_done}</strong></td>
        </tr>
    `).join('');
    
    document.getElementById('rmOverlay').classList.add('on');
}
function closeReportModal() { document.getElementById('rmOverlay').classList.remove('on'); }

function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    t.classList.add('on');
    setTimeout(() => t.classList.remove('on'), 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ────────────────────────────────────────────
// 6. REPORTS (CSV / Print / PDF - Structure remains identical)
// ────────────────────────────────────────────
function exportCSV() {
    const cols = ['#','Schedule ID','Professor','Employee ID','Subject Code','Subject Name','Section','Day','Start Time','End Time','Laboratory','Lab Name','Semester','School Year','Status','Enrolled','Sessions Done'];
    const lines = [
        cols.join(','),
        ...allSchedules.map((r,i) => [
            i+1, r.schedule_id, `"${r.profFullName}"`, r.professors?.employee_id, r.subjects?.subject_code, `"${r.subjects?.subject_name}"`, r.display_section, r.day_of_week, `"${formatTimeStr(r.start_time)}"`, `"${formatTimeStr(r.end_time)}"`, r.laboratory_rooms?.lab_code, `"${r.laboratory_rooms?.lab_name}"`, r.semester, r.school_year, r.status, r.enrolled_count, r.sessions_done
        ].join(','))
    ];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], {type:'text/csv'}));
    a.download = `Schedules_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

function printReport() { alert("Print functionality triggered (use jsPDF window write from original logic)"); }
function downloadPDF() { alert("PDF download triggered (use jsPDF from original logic)"); }