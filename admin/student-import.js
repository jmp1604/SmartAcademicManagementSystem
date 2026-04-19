let parsedRows = [];
let selectedDepartmentId = null;
let selectedDepartmentName = '';


document.addEventListener('DOMContentLoaded', async () => {
    checkSupabaseConnection();
    await loadDepartments();
    setupEventListeners();
});

async function loadDepartments() {
    try {
        if (!supabaseClient) return;

        const { data: departments, error } = await supabaseClient
            .from('departments')
            .select('id, department_name, department_code')
            .eq('is_active', true)
            .order('department_name', { ascending: true });

        if (error) throw error;

        const select = document.getElementById('departmentSelect');
        select.innerHTML = '<option value="">Select a department...</option>';

        (departments || []).forEach(dept => {
            const opt = document.createElement('option');
            opt.value = dept.id;
            opt.textContent = `${dept.department_name} (${dept.department_code})`;
            opt.dataset.name = dept.department_name;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Error loading departments:', err);
    }
}


function setupEventListeners() {
    const dropZone    = document.getElementById('fileDropZone');
    const fileInput   = document.getElementById('fileInput');
    const removeBtn   = document.getElementById('fileRemoveBtn');
    const parseBtn    = document.getElementById('parseFileBtn');
    const backUpload  = document.getElementById('backToUploadBtn');
    const proceedBtn  = document.getElementById('proceedImportBtn');
    const anotherBtn  = document.getElementById('importAnotherBtn');
    const deptSelect  = document.getElementById('departmentSelect');
    const downloadBtn = document.getElementById('downloadTemplateBtn');

    // Generate template on demand so download still works even without a static file.
    downloadBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        downloadStudentTemplate();
    });

    // Department select
    deptSelect.addEventListener('change', () => {
        const opt = deptSelect.options[deptSelect.selectedIndex];
        selectedDepartmentId   = deptSelect.value || null;
        selectedDepartmentName = opt?.dataset?.name || '';
        checkReadyToParse();
    });

    // Drop zone click — open file picker
    dropZone.addEventListener('click', (e) => {
        if (e.target.closest('.file-remove')) return;
        fileInput.click();
    });

    // Drag & drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelected(file);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) handleFileSelected(fileInput.files[0]);
    });

    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearFileSelection();
    });

    parseBtn.addEventListener('click', parseFile);
    backUpload.addEventListener('click', goBackToUpload);
    proceedBtn.addEventListener('click', startImport);
    anotherBtn?.addEventListener('click', resetAll);
}


let selectedFile = null;

function handleFileSelected(file) {
    const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'application/csv'
    ];
    const allowedExts = ['.xlsx', '.xls', '.csv'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

    if (!allowedExts.includes(ext)) {
        showImportAlert('Invalid file type. Please upload .xlsx, .xls, or .csv files only.', 'danger');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showImportAlert('File too large. Maximum allowed size is 10MB.', 'danger');
        return;
    }

    selectedFile = file;
    document.getElementById('fileSelectedName').textContent = file.name;
    document.getElementById('fileSelected').style.display = 'flex';
    document.getElementById('fileDropZone').querySelector('.drop-icon').style.display = 'none';
    document.getElementById('fileDropZone').querySelector('.drop-text').style.display = 'none';
    document.getElementById('fileDropZone').querySelector('.drop-hint').style.display = 'none';

    checkReadyToParse();
}

function clearFileSelection() {
    selectedFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('fileSelected').style.display = 'none';
    document.getElementById('fileDropZone').querySelector('.drop-icon').style.display = '';
    document.getElementById('fileDropZone').querySelector('.drop-text').style.display = '';
    document.getElementById('fileDropZone').querySelector('.drop-hint').style.display = '';
    checkReadyToParse();
}

function checkReadyToParse() {
    const parseBtn = document.getElementById('parseFileBtn');
    parseBtn.disabled = !(selectedFile && selectedDepartmentId);
}


async function parseFile() {
    if (!selectedFile) return;

    const ext = selectedFile.name.slice(selectedFile.name.lastIndexOf('.')).toLowerCase();

    try {
        let rows = [];

        if (ext === '.csv') {
            const text = await selectedFile.text();
            rows = parseCSV(text);
        } else {
            const buffer = await selectedFile.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array' });
            const sheetName = wb.SheetNames[0];
            const ws = wb.Sheets[sheetName];
            const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

            if (raw.length < 2) {
                showImportAlert('The file appears to be empty or has no data rows.', 'warning');
                return;
            }
            rows = raw.slice(1).map(r => ({
                studentId:   String(r[0] || '').trim(),
                firstName:   String(r[1] || '').trim(),
                middleName:  String(r[2] || '').trim(),
                lastName:    String(r[3] || '').trim(),
                course:      String(r[4] || '').trim(),
                yearLevel:   String(r[5] || '').trim(),
                section:     String(r[6] || '').trim(),
                email:       String(r[7] || '').trim(),
            }));
        }

        rows = rows.filter(r => r.studentId || r.firstName || r.lastName);

        if (rows.length === 0) {
            showImportAlert('No data rows found. Make sure you have data below the header row.', 'warning');
            return;
        }

        // Validate rows
        parsedRows = rows.map((r, i) => validateRow(r, i));

        renderPreview();
        showStep('preview');

    } catch (err) {
        console.error('Parse error:', err);
        showImportAlert('Failed to parse file: ' + err.message, 'danger');
    }
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    return lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
        return {
            studentId:  cols[0] || '',
            firstName:  cols[1] || '',
            middleName: cols[2] || '',
            lastName:   cols[3] || '',
            course:     cols[4] || '',
            yearLevel:  cols[5] || '',
            section:    cols[6] || '',
            email:      cols[7] || '',
        };
    });
}


function validateRow(row, index) {
    const errors   = [];
    const warnings = [];

    if (!row.studentId) {
        errors.push('Student ID is required');
    } else if (!/^\d{7}$/.test(row.studentId.replace(/-/g, ''))) {
        errors.push('Student ID should be a 7-digit number');
    }

    if (!row.firstName)  errors.push('First Name is required');
    if (!row.lastName)   errors.push('Last Name is required');

    if (row.yearLevel && (isNaN(row.yearLevel) || +row.yearLevel < 1 || +row.yearLevel > 5)) {
        errors.push('Year Level must be between 1 and 5');
    }

    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
        warnings.push('Email format looks invalid');
    }

    let email = row.email;
    if (!email && row.firstName && row.lastName) {
        email = `${row.lastName.toLowerCase()}_${row.firstName.toLowerCase()}@plpasig.edu.ph`;
        warnings.push('Email auto-generated');
    }

    const status = errors.length > 0 ? 'error'
                 : warnings.length > 0 ? 'warning'
                 : 'ok';

    return { ...row, email, errors, warnings, status, rowIndex: index + 2 };
}

function renderPreview() {
    const tbody = document.getElementById('previewTableBody');
    const valid    = parsedRows.filter(r => r.status !== 'error').length;
    const warnings = parsedRows.filter(r => r.status === 'warning').length;
    const errors   = parsedRows.filter(r => r.status === 'error').length;

    document.getElementById('validCount').textContent   = valid;
    document.getElementById('warningCount').textContent = warnings;
    document.getElementById('errorCount').textContent   = errors;
    document.getElementById('totalCount').textContent   = parsedRows.length;
    const proceedBtn = document.getElementById('proceedImportBtn');
    if (errors > 0) {
        proceedBtn.disabled = true;
        proceedBtn.title = 'Fix all errors before proceeding';
    } else {
        proceedBtn.disabled = false;
        proceedBtn.title = '';
    }

    tbody.innerHTML = parsedRows.map((row, i) => {
        const rowClass = row.status === 'error' ? 'row-error'
                       : row.status === 'warning' ? 'row-warning' : '';

        const statusBadge = row.status === 'ok'
            ? `<span class="row-status status-ok"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Ready</span>`
            : row.status === 'warning'
            ? `<span class="row-status status-warning" title="${row.warnings.join('; ')}">
                <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Warning
               </span>`
            : `<span class="row-status status-error" title="${row.errors.join('; ')}">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                Error
               </span>`;

        const errorNote = row.errors.length > 0
            ? `<div class="error-tooltip">${row.errors.join(', ')}</div>` : '';
        const warnNote  = row.warnings.length > 0
            ? `<div style="font-size:0.75rem;color:#92400e;margin-top:0.15rem;">${row.warnings.join(', ')}</div>` : '';

        const cell = (val) => val
            ? `<td>${escapeHtml(val)}</td>`
            : `<td class="cell-empty">—</td>`;

        return `
            <tr class="${rowClass}">
                <td style="color:var(--text-muted);font-size:0.8rem;">${row.rowIndex}</td>
                <td><strong>${escapeHtml(row.studentId)}</strong>${errorNote}</td>
                ${cell(row.firstName)}
                ${cell(row.middleName)}
                ${cell(row.lastName)}
                ${cell(row.course)}
                ${cell(row.yearLevel)}
                ${cell(row.section)}
                <td style="font-size:0.82rem;">${escapeHtml(row.email)}${warnNote}</td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join('');
}


async function startImport() {
    const validRows = parsedRows.filter(r => r.status !== 'error');

    if (validRows.length === 0) {
        showImportAlert('No valid rows to import.', 'warning');
        return;
    }

    showStep('import');
    const log   = document.getElementById('importLog');
    const fill  = document.getElementById('progressBarFill');
    const text  = document.getElementById('progressText');
    const pct   = document.getElementById('progressPct');
    log.innerHTML = '';

    let success = 0;
    let failed  = 0;
    const total = validRows.length;

    addLog(log, 'info', `Starting import of ${total} student(s) into ${selectedDepartmentName}...`);
    const studentIds = validRows.map(r => r.studentId);
    const { data: existing } = await supabaseClient
        .from('students')
        .select('id_number')
        .in('id_number', studentIds);
    const existingIds = new Set((existing || []).map(e => e.id_number));

    for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];

        const isUpdate = existingIds.has(row.studentId);

        try {
            const studentData = {
                student_id:   crypto.randomUUID(),  
                id_number:    row.studentId,
                first_name:   row.firstName,
                middle_name:  row.middleName || null,
                last_name:    row.lastName,
                email:        row.email,
                course:       row.course || null,
                year_level:   row.yearLevel ? parseInt(row.yearLevel) : null,
                section:      row.section || null,
                department_id: selectedDepartmentId,
                password:     row.studentId,  
                status:       'active',
                updated_at:   new Date().toISOString(),
            };

            let error;

            if (isUpdate) {
                const res = await supabaseClient
                    .from('students')
                    .update(studentData)
                    .eq('id_number', row.studentId);
                error = res.error;
            } else {
                // Insert new record
                studentData.created_at = new Date().toISOString();
                const res = await supabaseClient
                    .from('students')
                    .insert(studentData);
                error = res.error;
            }

            if (error) throw error;

            success++;
            const label = isUpdate ? 'Updated' : 'Imported';
            addLog(log, 'ok', `[Row ${row.rowIndex}] ${label}: ${row.firstName} ${row.lastName} (${row.studentId})`);

        } catch (err) {
            failed++;
            addLog(log, 'error', `[Row ${row.rowIndex}] Failed: ${row.firstName} ${row.lastName} — ${err.message}`);
        }
        const progress = Math.round(((i + 1) / total) * 100);
        fill.style.width = progress + '%';
        text.textContent = `${i + 1} of ${total} students processed`;
        pct.textContent  = progress + '%';
        await sleep(60);
    }

    addLog(log, 'info', '─────────────────────────────────');
    addLog(log, success > 0 ? 'ok' : 'error',
        `Import complete. ${success} succeeded, ${failed} failed.`);

    document.getElementById('importFooter').style.display = 'flex';
}


function showStep(step) {
    document.getElementById('stepUpload').style.display  = step === 'upload'  ? '' : 'none';
    document.getElementById('stepPreview').style.display = step === 'preview' ? '' : 'none';
    document.getElementById('stepImport').style.display  = step === 'import'  ? '' : 'none';
}

function goBackToUpload() {
    parsedRows = [];
    showStep('upload');
}

function resetAll() {
    parsedRows = [];
    clearFileSelection();
    document.getElementById('departmentSelect').value = '';
    selectedDepartmentId = null;
    selectedDepartmentName = '';
    document.getElementById('importLog').innerHTML = '';
    document.getElementById('progressBarFill').style.width = '0%';
    document.getElementById('importFooter').style.display = 'none';
    showStep('upload');
    checkReadyToParse();
}

function addLog(container, type, message) {
    const icons = {
        ok:      '✓',
        error:   '✗',
        warning: '⚠',
        info:    '›',
    };
    const line = document.createElement('div');
    line.className = `log-line log-${type}`;
    line.innerHTML = `
        <span class="log-icon">${icons[type] || '›'}</span>
        <span class="log-text">${escapeHtml(message)}</span>
    `;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function showImportAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.setAttribute('role', 'alert');
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    const main = document.querySelector('.main-content');
    main.insertBefore(alertDiv, main.firstChild);
    setTimeout(() => alertDiv.remove(), 6000);
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function downloadStudentTemplate() {
    const headers = [
        'Student ID',
        'First Name',
        'Middle Name',
        'Last Name',
        'Course',
        'Year Level',
        'Section',
        'Email'
    ];

    const sampleRow = [
        '2300221',
        'Juan',
        'Santos',
        'Dela Cruz',
        'Computer Science',
        '3',
        'CS3A',
        'delacruz_juan@plpasig.edu.ph'
    ];

    if (window.XLSX) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
        XLSX.utils.book_append_sheet(wb, ws, 'Students');
        XLSX.writeFile(wb, 'student-import-template.xlsx');
        return;
    }

    // Fallback if SheetJS fails to load.
    const csv = [headers, sampleRow]
        .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student-import-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}