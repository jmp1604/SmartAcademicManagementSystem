// admin-subjects.js
let allSubjects = [];
let subjectModal = null;
let deleteConfirmModal = null;
let subjectToDelete = null; // Stores ID temporarily

document.addEventListener('DOMContentLoaded', async () => {
    try {
        if (typeof checkSupabaseConnection === 'function') {
            checkSupabaseConnection();
        }

        // Init Bootstrap Modals
        const smEl = document.getElementById('subjectModal');
        const dmEl = document.getElementById('deleteConfirmModal');
        if (smEl) subjectModal = new bootstrap.Modal(smEl);
        if (dmEl) deleteConfirmModal = new bootstrap.Modal(dmEl);

        setupEventListeners();
        await loadSubjects();

    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

function setupEventListeners() {
    // Buttons
    document.getElementById('btnOpenAddModal')?.addEventListener('click', openAddModal);
    document.getElementById('saveSubjectBtn')?.addEventListener('click', saveSubject);
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', executeDelete);

    // Filters
    document.querySelector('.search-input')?.addEventListener('input', applyFilters);
    document.getElementById('semesterFilter')?.addEventListener('change', applyFilters);
}
// ────────────────────────────────────────────
// DATA LOADING
// ────────────────────────────────────────────
async function loadSubjects() {
    const tbody = document.getElementById('subjectsTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="spinner-border text-success" role="status"></div></td></tr>';

    try {
        // 1. Fetch Semesters
        const { data: semesters, error: semErr } = await supabaseClient
            .from('semesters').select('id, name').eq('is_active', true).order('start_date', { ascending: false });
        if (semErr) throw semErr;

        populateSemesterDropdowns(semesters || []);

        // 2. Fetch Subjects (with joined semester names)
        const { data: subjects, error: subErr } = await supabaseClient
            .from('subjects').select('*, semesters(id, name)').order('subject_code', { ascending: true });
        if (subErr) throw subErr;

        allSubjects = subjects || [];

        // Update Stats
        document.getElementById('statTotal').textContent = allSubjects.length;
        document.getElementById('statUnits').textContent = allSubjects.reduce((sum, s) => sum + (parseFloat(s.units) || 0), 0);

        displaySubjects(allSubjects);

    } catch (err) {
        console.error('Error loading data:', err);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Failed to load data: ${err.message}</td></tr>`;
    }
}

function populateSemesterDropdowns(semesters) {
    const formSelect = document.getElementById('semesterId');
    const filterSelect = document.getElementById('semesterFilter');
    
    const optionsHtml = semesters.map(sem => `<option value="${sem.id}">${escapeHtml(sem.name)}</option>`).join('');
    
    if (formSelect) formSelect.innerHTML = '<option value="" disabled selected>-- Select Semester --</option>' + optionsHtml;
    if (filterSelect) filterSelect.innerHTML = '<option value="all">All Semesters</option>' + optionsHtml;
}
// ────────────────────────────────────────────
// RENDER & FILTER
// ────────────────────────────────────────────
function displaySubjects(rows) {
    const tbody = document.getElementById('subjectsTableBody');
    
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No subjects found.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(s => `
        <tr>
            <td class="fw-bold">${escapeHtml(s.subject_code)}</td>
            <td>
                <div>${escapeHtml(s.subject_name)}</div>
                ${s.description ? `<small class="text-muted">${escapeHtml(s.description.substring(0, 45))}...</small>` : ''}
            </td>
            <td><span class="badge bg-light text-dark border">${s.semesters ? escapeHtml(s.semesters.name) : 'Unassigned'}</span></td>
            <td><span class="badge bg-secondary">${s.units}</span></td>
            <td>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-outline-secondary" onclick="editSubject('${s.subject_id}')" title="Edit">
                        <i class="fa-solid fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="promptDelete('${s.subject_id}', '${escapeHtml(s.subject_code)}')" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function applyFilters() {
    const q = document.querySelector('.search-input').value.toLowerCase();
    const sem = document.getElementById('semesterFilter').value;

    const filtered = allSubjects.filter(s => {
        const textMatch = s.subject_code.toLowerCase().includes(q) || s.subject_name.toLowerCase().includes(q);
        const semMatch = sem === 'all' || s.semester_id === sem;
        return textMatch && semMatch;
    });

    displaySubjects(filtered);
}

// ────────────────────────────────────────────
// ADD / EDIT / DELETE ACTIONS
// ────────────────────────────────────────────
function openAddModal() {
    document.getElementById('subjectForm').reset();
    document.getElementById('subjectId').value = '';
    document.getElementById('modalTitle').textContent = 'Add New Subject';
    subjectModal.show();
}

function editSubject(id) {
    const s = allSubjects.find(x => x.subject_id === id);
    if (!s) return;

    document.getElementById('subjectId').value = s.subject_id;
    document.getElementById('subjectCode').value = s.subject_code;
    document.getElementById('subjectName').value = s.subject_name;
    document.getElementById('semesterId').value = s.semester_id || '';
    document.getElementById('units').value = s.units || '';
    document.getElementById('description').value = s.description || '';

    document.getElementById('modalTitle').textContent = 'Edit Subject';
    subjectModal.show();
}

async function saveSubject() {
    const subjectId = document.getElementById('subjectId').value.trim();
    const subjectCode = document.getElementById('subjectCode').value.trim().toUpperCase();
    const subjectName = document.getElementById('subjectName').value.trim();
    const semesterId = document.getElementById('semesterId').value;
    const units = document.getElementById('units').value;
    const desc = document.getElementById('description').value.trim();
    const isEdit = subjectId !== '';

    if (!subjectCode || !subjectName || !semesterId || !units) {
        return showAlert('Please fill in all required fields.', 'warning');
    }

    const btn = document.getElementById('saveSubjectBtn');
    const origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
    btn.disabled = true;

    try {
        // Duplicate check
        let dupQuery = supabaseClient.from('subjects').select('subject_id').or(`subject_code.eq.${subjectCode},subject_name.ilike.${subjectName}`);
        if (isEdit) dupQuery = dupQuery.neq('subject_id', subjectId);
        
        const { data: dups } = await dupQuery;
        if (dups && dups.length > 0) {
            throw new Error('A subject with this code or name already exists.');
        }

        const payload = {
            subject_code: subjectCode,
            subject_name: subjectName,
            semester_id: semesterId,
            units: parseFloat(units),
            description: desc || null,
            updated_at: new Date().toISOString()
        };

        let err;
        if (isEdit) {
            const { error } = await supabaseClient.from('subjects').update(payload).eq('subject_id', subjectId);
            err = error;
        } else {
            const { error } = await supabaseClient.from('subjects').insert(payload);
            err = error;
        }

        if (err) throw err;

        showAlert(isEdit ? 'Subject updated successfully!' : 'Subject added successfully!', 'success');
        subjectModal.hide();
        await loadSubjects();

    } catch (error) {
        console.error(error);
        showAlert(error.message || 'Error saving subject.', 'danger');
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
    }
}

function promptDelete(id, code) {
    subjectToDelete = id;
    document.getElementById('deleteSubjectCode').textContent = code;
    deleteConfirmModal.show();
}

async function executeDelete() {
    if (!subjectToDelete) return;

    const btn = document.getElementById('confirmDeleteBtn');
    const origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Deleting...';
    btn.disabled = true;

    try {
        // Check for active schedules linking to this subject
        const { data: linked } = await supabaseClient.from('lab_schedules').select('schedule_id').eq('subject_id', subjectToDelete).eq('status', 'active').limit(1);
        if (linked && linked.length > 0) {
            throw new Error('Cannot delete subject because it has active schedules.');
        }

        const { error } = await supabaseClient.from('subjects').delete().eq('subject_id', subjectToDelete);
        if (error) throw error;

        showAlert('Subject deleted successfully.', 'success');
        deleteConfirmModal.hide();
        await loadSubjects();

    } catch (error) {
        showAlert(error.message, 'danger');
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
        subjectToDelete = null;
    }
}

// ────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show mb-4 shadow-sm anim anim-2`;
    alertDiv.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    
    const pageHeader = document.querySelector('.page-header');
    pageHeader.parentNode.insertBefore(alertDiv, pageHeader.nextSibling);
    
    setTimeout(() => {
        if(alertDiv) alertDiv.remove();
    }, 5000);
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}