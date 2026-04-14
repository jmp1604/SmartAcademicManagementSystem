let fileQueue    = [];  
let fileIdCounter = 0;
let activeSemesterId = null;
let activeSemesterName = null;

async function loadActiveSemester() {
    try {
        const { data: sem, error } = await supabaseClient
            .from('semesters')
            .select('id, name')
            .eq('is_active', true)
            .limit(1)
            .single();
        
        if (error || !sem) {
            console.error('No active semester found');
            alert('No active semester set. Contact administrator.');
            return false;
        }
        activeSemesterId = sem.id;
        activeSemesterName = sem.name;
        
        // Display the semester in the page
        const semesterEl = document.getElementById('upload-current-semester');
        if (semesterEl) semesterEl.textContent = activeSemesterName;
        
        return true;
    } catch (e) {
        console.error('loadActiveSemester error:', e);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    if (!await loadActiveSemester()) return;
    await loadCategories();
    initUploadForm();
});

document.addEventListener('visibilitychange', async function () {
    if (!document.hidden) {
        await loadActiveSemester();
        await loadCategories();
    }
});

window.addEventListener('focus', async function () {
    await loadActiveSemester();
    await loadCategories();
});

async function loadCategories() {
    try {
        if (!supabaseClient) { console.error('Supabase not initialised'); return; }

        let departmentId = null;
        const userStr = sessionStorage.getItem('user');
        if (userStr) {
            try { departmentId = JSON.parse(userStr).departmentId; } catch (e) {}
        }

        let categoryIds = null;
        if (departmentId) {
            const { data: reqs, error: reqErr } = await supabaseClient
                .from('requirements')
                .select('category_id')
                .eq('department_id', departmentId)
                .eq('semester_id', activeSemesterId);

            if (reqErr || !reqs?.length) { showNoCategoriesMessage(); return; }

            categoryIds = [...new Set(reqs.map(r => r.category_id).filter(Boolean))];
            if (!categoryIds.length) { showNoCategoriesMessage(); return; }
        }

        let q = supabaseClient.from('categories').select('*');
        if (categoryIds) q = q.in('id', categoryIds);
        const { data: categories, error } = await q.order('name', { ascending: true });

        if (error || !categories?.length) { showNoCategoriesMessage(); return; }

        renderCategories(categories);
        updateUploadStatistics();
    } catch (err) {
        console.error('loadCategories error:', err);
        showNoCategoriesMessage();
    }
}

function renderCategories(categories) {
    const grid = document.getElementById('categoriesGridUpload');
    if (!grid) return;
    document.getElementById('noCategoriesMessage').style.display = 'none';

    grid.innerHTML = categories.map(cat => {
        let icon = cat.icon || '📁';
        if (icon.includes('fa-')) icon = `<i class="${icon}"></i>`;
        return `<div class="category-card"
                     data-category-id="${cat.id}"
                     data-category-name="${escapeHtml(cat.name)}">
                    <div class="category-icon">${icon}</div>
                    <div class="category-name">${escapeHtml(cat.name)}</div>
                    <div class="category-description">${escapeHtml(cat.description || '')}</div>
                </div>`;
    }).join('');

    grid.querySelectorAll('.category-card').forEach(card =>
        card.addEventListener('click', () => selectCategory(card))
    );
}

function showNoCategoriesMessage() {
    const grid = document.getElementById('categoriesGridUpload');
    if (grid) grid.innerHTML = '';
    const msg = document.getElementById('noCategoriesMessage');
    if (msg) msg.style.display = 'block';
}

function selectCategory(card) {
    document.querySelectorAll('.category-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    const id   = card.dataset.categoryId;
    const name = card.dataset.categoryName;

    document.getElementById('selected-category-id').value        = id;
    document.getElementById('selected-category-name').textContent = name;
    document.getElementById('file-category').value               = name;

    moveToStep(2);
}


function initUploadForm() {
    const dropzone  = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const addMore   = document.getElementById('btn-add-more');
    const backBtn   = document.getElementById('btn-back-step');
    const form      = document.getElementById('upload-form');

    if (!dropzone || !fileInput) return;
    browseBtn?.addEventListener('click', e => { e.preventDefault(); fileInput.click(); });
    addMore?.addEventListener('click',   e => { e.preventDefault(); fileInput.click(); });
    fileInput.addEventListener('change', function () {
        if (this.files.length) addFilesToQueue(Array.from(this.files));
        this.value = '';
    });

    dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files);
        if (files.length) addFilesToQueue(files);
    });
    backBtn?.addEventListener('click', e => { e.preventDefault(); moveToStep(1); });
    form?.addEventListener('submit', async e => { e.preventDefault(); await submitAll(); });
}


function addFilesToQueue(files) {
    const valid   = files.filter(f => validateFile(f, true));
    const skipped = files.length - valid.length;

    if (skipped) alert(`${skipped} file(s) skipped — invalid type or exceeds 25 MB.`);
    if (!valid.length) return;

    valid.forEach(f => fileQueue.push({ id: ++fileIdCounter, file: f, status: 'queued', errorMsg: '' }));
    renderQueue();
}

function removeFromQueue(id) {
    fileQueue = fileQueue.filter(i => i.id !== id);
    renderQueue();
}

function resetQueue() {
    fileQueue     = [];
    fileIdCounter = 0;
    renderQueue();
}

function renderQueue() {
    const wrap      = document.getElementById('file-queue-wrap');
    const queueEl   = document.getElementById('file-queue');
    const countEl   = document.getElementById('queue-count');
    const dropzone  = document.getElementById('dropzone');
    const summaryEl = document.getElementById('upload-summary');
    const submitLbl = document.getElementById('submit-btn-label');

    if (!wrap || !queueEl) return;

    if (!fileQueue.length) {
        wrap.style.display    = 'none';
        dropzone.style.display = '';
        if (summaryEl) summaryEl.style.display = 'none';
        if (submitLbl) submitLbl.textContent    = 'Submit File';
        return;
    }

    dropzone.style.display = 'none';
    wrap.style.display     = 'block';

    if (countEl) countEl.textContent = fileQueue.length;

    queueEl.innerHTML = fileQueue.map(item => renderQueueItem(item)).join('');

    queueEl.querySelectorAll('.qi-remove').forEach(btn =>
        btn.addEventListener('click', () => removeFromQueue(+btn.dataset.id))
    );

    const queuedCount = fileQueue.filter(i => i.status === 'queued').length;
    if (submitLbl) {
        submitLbl.textContent = queuedCount === 1
            ? 'Submit 1 File'
            : `Submit ${queuedCount} Files`;
    }
    const done  = fileQueue.filter(i => i.status === 'done').length;
    const error = fileQueue.filter(i => i.status === 'error').length;
    if (summaryEl && (done || error)) {
        summaryEl.style.display = 'flex';
        summaryEl.innerHTML = done
            ? `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
               <span>${done} file${done !== 1 ? 's' : ''} uploaded successfully${error ? ` · ${error} failed — you can retry below` : ''}.</span>`
            : `<svg class="err" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
               <span>${error} file${error !== 1 ? 's' : ''} failed to upload.</span>`;
        summaryEl.className = 'upload-summary ' + (done ? 'ok' : 'fail');
    } else if (summaryEl) {
        summaryEl.style.display = 'none';
    }
}

function renderQueueItem(item) {
    const ext = item.file.name.split('.').pop().toUpperCase();

    const statusConfig = {
        queued:    { cls: '',           badge: 'badge-queued',    icon: clockSvg(),   label: 'Queued'       },
        uploading: { cls: 'uploading',  badge: 'badge-uploading', icon: uploadSvg(),  label: 'Uploading…'   },
        done:      { cls: 'done',       badge: 'badge-done',      icon: checkSvg(),   label: 'Done'         },
        error:     { cls: 'error',      badge: 'badge-error',     icon: crossSvg(),   label: item.errorMsg || 'Failed' },
    };
    const s         = statusConfig[item.status] || statusConfig.queued;
    const canRemove = item.status === 'queued';

    return `
        <div class="qi ${s.cls}" id="qi-${item.id}">
            <div class="qi-icon">${fileIcon(ext)}</div>
            <div class="qi-info">
                <div class="qi-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</div>
                <div class="qi-meta">${formatBytes(item.file.size)} · ${ext}</div>
                <div class="qi-bar"><div class="qi-bar-fill"></div></div>
            </div>
            <span class="qi-badge ${s.badge}">${s.icon}${s.label}</span>
            ${canRemove
                ? `<button type="button" class="qi-remove" data-id="${item.id}" title="Remove">
                       <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                   </button>`
                : ''}
        </div>`;
}

function updateItemStatus(id, status, errorMsg = '') {
    const item = fileQueue.find(i => i.id === id);
    if (!item) return;
    item.status   = status;
    item.errorMsg = errorMsg;

    const el = document.getElementById(`qi-${id}`);
    if (!el) return;

    const statusConfig = {
        queued:    { cls: '',          badge: 'badge-queued',    icon: clockSvg(),   label: 'Queued'     },
        uploading: { cls: 'uploading', badge: 'badge-uploading', icon: uploadSvg(),  label: 'Uploading…' },
        done:      { cls: 'done',      badge: 'badge-done',      icon: checkSvg(),   label: 'Done'       },
        error:     { cls: 'error',     badge: 'badge-error',     icon: crossSvg(),   label: errorMsg || 'Failed' },
    };
    const s = statusConfig[status] || statusConfig.queued;

    el.className = `qi ${s.cls}`;

    const badge = el.querySelector('.qi-badge');
    if (badge) { badge.className = `qi-badge ${s.badge}`; badge.innerHTML = `${s.icon}${s.label}`; }

    const removeBtn = el.querySelector('.qi-remove');
    if (removeBtn && status !== 'queued') removeBtn.remove();
}

async function submitAll() {
    const queued = fileQueue.filter(i => i.status === 'queued');
    if (!queued.length) { alert('Please select at least one file to upload.'); return; }

    const categoryId  = document.getElementById('selected-category-id')?.value;
    const description = document.getElementById('file-description')?.value || '';

    if (!categoryId) { alert('Please select a category.'); return; }

    const sessionUser = getCurrentUser();
    if (!sessionUser?.id) { alert('Please log in to upload files.'); return; }

    const requirement = await fetchRequirement(categoryId, sessionUser.departmentId);
    if (!requirement) return;

    // Multiple submissions allowed - admin will review and approve/reject each one
    // Professors can freely submit as many times as needed per requirement

    /* lock UI */
    const submitBtn = document.getElementById('submit-btn');
    const addMore   = document.getElementById('btn-add-more');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Uploading…</span>';
    if (addMore) addMore.disabled = true;

    // Create a single new submission record
    const { data: submission, error: subErr } = await supabaseClient
        .from('submissions')
        .insert({
            professor_id:   sessionUser.id,
            requirement_id: requirement.id,
            semester_id:    activeSemesterId,
            status:         'pending',
            submitted_at:   new Date().toISOString(),
            remarks:        description,
        })
        .select()
        .single();

    if (subErr) {
        console.error('Submission insert error:', subErr);
        alert('Failed to create submission record. Please try again.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span id="submit-btn-label">Submit Files</span>`;
        if (addMore) addMore.disabled = false;
        return;
    }

    // AUDIT: log submission creation
    const submissionName = `Submission for ${requirement.id} - ${sessionUser.firstName || sessionUser.email}`;
    await auditLog('SUBMIT_FILE', 'submissions', submission.id, submissionName, null, {
        status: submission.status,
        professor_id: sessionUser.id,
        requirement_id: requirement.id,
        semester_id: activeSemesterId,
        submitted_at: submission.submitted_at
    });

    let successCount = 0, failCount = 0;

    for (const item of queued) {
        updateItemStatus(item.id, 'uploading');
        const ok = await uploadOneFile(item.file, sessionUser, submission.id, description);
        updateItemStatus(item.id, ok ? 'done' : 'error', ok ? '' : 'Upload failed');
        ok ? successCount++ : failCount++;
        renderQueue();
    }

    // NOTIFICATION: Notify admin of new submission
    if (successCount > 0 && submission?.id && sessionUser.departmentId) {
        try {
            console.log('Attempting to notify admin - Department ID:', sessionUser.departmentId);
            
            // Get the admin/department head for this department
            const { data: adminData, error: adminErr } = await supabaseClient
                .from('admins')
                .select('admin_id')
                .eq('department_id', sessionUser.departmentId)
                .limit(1)
                .single();

            console.log('Admin query result - Error:', adminErr, 'Data:', adminData);
            
            if (adminErr) {
                console.warn('Error querying admin for notification:', adminErr);
                // Try to find ANY admin for this department (fallback)
                const { data: fallbackAdmins, error: fallbackErr } = await supabaseClient
                    .from('admins')
                    .select('admin_id')
                    .eq('department_id', sessionUser.departmentId)
                    .limit(1);
                
                if (!fallbackErr && fallbackAdmins?.length > 0) {
                    const adminId = fallbackAdmins[0].admin_id;
                    console.log('Found admin via fallback query:', adminId);
                    
                    const notifResult = await notifyAdminNewSubmission(
                        adminId,                                 // Admin's ID
                        submission.id,                           // Submission ID
                        requirement?.id,                         // Requirement ID
                        sessionUser.departmentId,                // Department ID
                        `${sessionUser.firstName || ''} ${sessionUser.lastName || ''}`.trim() // Professor name
                    );
                    if (notifResult.error) {
                        console.warn('Could not create admin notification:', notifResult.error);
                    } else {
                        console.log('✓ Admin notified of new submission (via fallback)');
                    }
                }
            } else if (adminData?.admin_id) {
                console.log('Found admin:', adminData.admin_id);
                
                const notifResult = await notifyAdminNewSubmission(
                    adminData.admin_id,                      // Admin's ID
                    submission.id,                           // Submission ID
                    requirement?.id,                         // Requirement ID
                    sessionUser.departmentId,                // Department ID
                    `${sessionUser.firstName || ''} ${sessionUser.lastName || ''}`.trim() // Professor name
                );
                if (notifResult.error) {
                    console.warn('Could not create admin notification:', notifResult.error);
                } else {
                    console.log('✓ Admin notified of new submission');
                }
            } else {
                console.warn('No admin found for department:', sessionUser.departmentId);
            }
        } catch (notifErr) {
            console.error('Exception while notifying admin:', notifErr);
        }
    } else {
        console.log('Skipping admin notification - successCount:', successCount, 'submissionId:', submission?.id, 'departmentId:', sessionUser.departmentId);
    }

    submitBtn.disabled = false;
    if (addMore) addMore.disabled = false;

    const remainingQueued = fileQueue.filter(i => i.status === 'queued').length;
    submitBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span id="submit-btn-label">${remainingQueued === 1 ? 'Submit 1 File' : `Submit ${remainingQueued} Files`}</span>`;

    updateUploadStatistics();

    if (failCount === 0) {
        // Stay on same requirement for easy re-submission
        setTimeout(() => {
            document.getElementById('upload-form').reset();
            resetQueue();
            document.getElementById('file-description').value = '';
            // User can add more files or go back to categories
        }, 1800);
    }
}


async function fetchRequirement(categoryId, departmentId) {
    try {
        let q = supabaseClient
            .from('requirements')
            .select('id')
            .eq('category_id', categoryId)
            .eq('semester_id', activeSemesterId);

        if (departmentId) q = q.eq('department_id', departmentId);

        const { data, error } = await q.order('created_at', { ascending: false }).limit(1).single();

        if (error && error.code !== 'PGRST116') {
            console.error('fetchRequirement error:', error);
            alert('Error loading requirement. Please try again.');
            return null;
        }
        if (!data) { alert('No requirement found for this category. Please contact the administrator.'); return null; }
        return data;
    } catch (e) {
        console.error('fetchRequirement exception:', e);
        alert('An unexpected error occurred. Please try again.');
        return null;
    }
}

async function uploadOneFile(file, sessionUser, submissionId, description) {
    try {
        const sanitized = file.name.replace(/\s+/g, '_').replace(/[^\w._-]/g, '_');
        const filePath  = `${sessionUser.id}/${Date.now()}_${sanitized}`;

        const { error: uploadErr } = await supabaseClient.storage
            .from('faculty-submissions')
            .upload(filePath, file);

        if (uploadErr) { console.error('Storage upload error:', uploadErr); return false; }

        const { error: fileErr } = await supabaseClient
            .from('submission_files')
            .insert({
                submission_id: submissionId,
                file_name:     sanitized,
                file_url:      filePath,
                file_size:     file.size,
                file_type:     file.type,
            });

        if (fileErr) { console.error('submission_files insert error:', fileErr); return false; }

        return true;
    } catch (e) {
        console.error('uploadOneFile exception:', e);
        return false;
    }
}

function validateFile(file, silent = false) {
    const maxSize   = 25 * 1024 * 1024;
    const validExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
    const ext       = '.' + file.name.split('.').pop().toLowerCase();

    if (file.size > maxSize) {
        if (!silent) alert(`"${file.name}" exceeds the 25 MB limit.`);
        return false;
    }
    if (!validExts.includes(ext)) {
        if (!silent) alert(`"${file.name}" is not a supported file type.\nSupported: PDF, DOCX, XLSX, PPTX`);
        return false;
    }
    return true;
}


function moveToStep(n) {
    const step1 = document.getElementById('upload-step-1');
    const step2 = document.getElementById('upload-step-2');

    if (n === 1) {
        step1.classList.add('active');
        step2.classList.remove('active');
        resetQueue();
        document.getElementById('file-input').value = '';
        document.getElementById('upload-form').reset();
        document.getElementById('selected-category-id').value = '';
        document.getElementById('selected-category-name').textContent = '';
        document.getElementById('file-category').value = '';
        document.getElementById('file-description').value = '';
        document.querySelectorAll('.category-card').forEach(c => c.classList.remove('selected'));
        const dz = document.getElementById('dropzone');
        if (dz) {
            dz.style.display = '';
            dz.classList.remove('dragover');
        }
    } else {
        const catId = document.getElementById('selected-category-id')?.value;
        if (!catId) { alert('Please select a category first.'); return; }
        step1.classList.remove('active');
        step2.classList.add('active');
    }
}


async function updateUploadStatistics() {
    try {
        const sessionUser = getCurrentUser();
        if (!sessionUser?.id) return;

        // Filter by current semester to show only this semester's stats
        const { data: submissions, error } = await supabaseClient
            .from('submissions')
            .select('status')
            .eq('professor_id', sessionUser.id)
            .eq('semester_id', activeSemesterId);

        if (error) return;

        const total    = submissions?.length || 0;
        const approved = submissions?.filter(s => s.status === 'approved').length || 0;
        const pending  = submissions?.filter(s => s.status === 'pending').length  || 0;

        document.getElementById('upload-total').textContent    = total;
        document.getElementById('upload-approved').textContent = approved;
        document.getElementById('upload-pending').textContent  = pending;
    } catch (e) {
        console.error('updateUploadStatistics error:', e);
    }
}

function clockSvg()  { return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`; }
function uploadSvg() { return `<svg viewBox="0 0 24 24"><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`; }
function checkSvg()  { return `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`; }
function crossSvg()  { return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`; }

function fileIcon(ext) {
    const m = { PDF:'📄', DOC:'📝', DOCX:'📝', XLS:'📊', XLSX:'📊', PPT:'📑', PPTX:'📑' };
    return m[ext] || '📁';
}

function formatBytes(bytes) {
    if (!bytes)          return '0 B';
    if (bytes < 1024)    return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function escapeHtml(text) {
    const m = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' };
    return text ? String(text).replace(/[&<>"']/g, c => m[c]) : '';
}