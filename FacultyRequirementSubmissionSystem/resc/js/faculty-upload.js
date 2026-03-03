
let selectedRequirementId = null;
let selectedRequirementData = null;

document.addEventListener('DOMContentLoaded', async function () {
    const step1          = document.getElementById('upload-step-1');
    const step2          = document.getElementById('upload-step-2');
    const selectedCatEl  = document.getElementById('selected-category-name');
    const btnBackStep    = document.getElementById('btn-back-step');
    await loadRequirements();

    function attachCategoryListeners() {
        const categoryCards = document.querySelectorAll('.category-card');
        if (categoryCards.length) {
            categoryCards.forEach(function (card) {
                card.addEventListener('click', function () {
                    categoryCards.forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    const reqName = card.dataset.cat;
                    selectedRequirementId = card.dataset.catId;
                    selectedRequirementData = {
                        id: card.dataset.catId,
                        name: reqName,
                        category: card.dataset.category
                    };
                    if (selectedCatEl) selectedCatEl.textContent = reqName;
                    if (step1) step1.classList.remove('active');
                    if (step2) step2.classList.add('active');
                    const catSelect = document.getElementById('file-category');
                    if (catSelect) catSelect.value = reqName;
                });
            });
        }
    }

    if (btnBackStep) {
        btnBackStep.addEventListener('click', function () {
            if (step2) step2.classList.remove('active');
            if (step1) step1.classList.add('active');
            const categoryCards = document.querySelectorAll('.category-card');
            categoryCards.forEach(c => c.classList.remove('selected'));
        });
    }
    const dropzone   = document.getElementById('dropzone');
    const fileInput  = document.getElementById('file-input');
    const browseBtn  = document.getElementById('browse-btn');
    const preview    = document.getElementById('file-preview');
    const prevName   = document.getElementById('preview-name');
    const prevSize   = document.getElementById('preview-size');
    const removeBtn  = document.getElementById('remove-file');

    if (dropzone && fileInput) {
        browseBtn?.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', function (e) {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', function () {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', function (e) {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) showFilePreview(file);
        });

        fileInput.addEventListener('change', function () {
            const file = fileInput.files[0];
            if (file) showFilePreview(file);
        });

        removeBtn?.addEventListener('click', function (e) {
            e.stopPropagation();
            fileInput.value = '';
            if (preview) preview.classList.remove('show');
        });
    }

const uploadForm = document.getElementById('upload-form');
    if (uploadForm) {
        uploadForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const fileInput2 = document.getElementById('file-input');
            const fileDesc   = document.getElementById('file-description');

            if (!fileInput2?.files.length) {
                alert('Please select a file to upload');
                return;
            }

            if (!selectedRequirementId) {
                alert('Please select a requirement first');
                return;
            }

            await handleFileUpload(fileInput2.files[0], fileDesc.value);
        });
    }
});

async function loadRequirements() {
    try {
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            showNoCategoriesMessage();
            return;
        }

        // Load requirements with their category information
        const { data, error } = await supabaseClient
            .from('requirements')
            .select(`
                *,
                categories:category_id(
                    name,
                    icon
                )
            `)
            .eq('status', 'active')
            .order('title', { ascending: true });

        if (error) throw error;

        const categoriesGrid = document.getElementById('categoriesGridUpload');
        const noCategoriesMessage = document.getElementById('noCategoriesMessage');

        if (!data || data.length === 0) {
            categoriesGrid.innerHTML = '';
            noCategoriesMessage.style.display = 'block';
            return;
        }

        const colors = ['#fef3c7', '#dbeafe', '#fce7f3', '#e0e7ff', '#d1fae5', '#ffedd5'];

        categoriesGrid.innerHTML = data.map((requirement, index) => {
            const bgColor = colors[index % colors.length];
            const categoryName = requirement.categories?.name || 'General';
            let iconHtml = '📁';
            if (requirement.categories?.icon) {
                if (requirement.categories.icon.includes('fa-')) {
                    iconHtml = `<i class="${requirement.categories.icon}"></i>`;
                } else {
                    iconHtml = requirement.categories.icon;
                }
            }
            
            // Format deadline
            const deadline = requirement.deadline ? new Date(requirement.deadline).toLocaleDateString() : 'No deadline';
            const isMandatory = requirement.is_mandatory ? '<span style="color:#dc2626;font-weight:600;">*Required</span>' : '';
            
            return `
                <div class="category-card" data-cat="${escapeHtml(requirement.name)}" data-cat-id="${requirement.id}" data-category="${escapeHtml(categoryName)}">
                    <div class="cat-icon" style="background:${bgColor};">${iconHtml}</div>
                    <div class="cat-name">${escapeHtml(requirement.name)} ${isMandatory}</div>
                    <div class="cat-desc">${escapeHtml(requirement.description || 'No description')}<br><small style="color:#666;">📅 ${deadline} | 📂 ${escapeHtml(categoryName)}</small></div>
                </div>
            `;
        }).join('');
        attachCategoryListeners();

    } catch (error) {
        console.error('Error loading requirements:', error);
        showNoCategoriesMessage();
    }
}

function attachCategoryListeners() {
    const step1 = document.getElementById('upload-step-1');
    const step2 = document.getElementById('upload-step-2');
    const selectedCatEl = document.getElementById('selected-category-name');
    
    const categoryCards = document.querySelectorAll('.category-card');
    if (categoryCards.length) {
        categoryCards.forEach(function (card) {
            card.addEventListener('click', function () {
                categoryCards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                const reqName = card.dataset.cat;
                selectedRequirementId = card.dataset.catId;
                selectedRequirementData = {
                    id: card.dataset.catId,
                    name: reqName,
                    category: card.dataset.category
                };
                if (selectedCatEl) selectedCatEl.textContent = reqName;
                if (step1) step1.classList.remove('active');
                if (step2) step2.classList.add('active');
                const catSelect = document.getElementById('file-category');
                if (catSelect) catSelect.value = reqName;
            });
        });
    }
}

function showNoCategoriesMessage() {
    const categoriesGrid = document.getElementById('categoriesGridUpload');
    const noCategoriesMessage = document.getElementById('noCategoriesMessage');
    categoriesGrid.innerHTML = '';
    noCategoriesMessage.style.display = 'block';
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text ? text.replace(/[&<>"']/g, m => map[m]) : '';
}

function showFilePreview(file) {
    const preview  = document.getElementById('file-preview');
    const prevName = document.getElementById('preview-name');
    const prevSize = document.getElementById('preview-size');
    
    if (!preview || !prevName || !prevSize) return;
    prevName.textContent = file.name;
    prevSize.textContent = formatBytes(file.size);
    preview.classList.add('show');
}

function formatBytes(bytes) {
    if (bytes < 1024)       return bytes + ' B';
    if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

async function handleFileUpload(file, description) {
    const step2 = document.getElementById('upload-step-2');
    if (!step2) return;

    // Show uploading state
    step2.innerHTML = `
        <div class="panel-body" style="text-align:center; padding:3rem 2rem;">
            <div style="width:64px;height:64px;border-radius:50%;background:#dbeafe;display:flex;align-items:center;justify-content:center;margin:0 auto 1.2rem;animation:spin 1s linear infinite;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1e40af" stroke-width="2.5"><circle cx="12" cy="12" r="10" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>
            </div>
            <h3 style="font-family:'Merriweather',serif;color:#1e40af;margin-bottom:.5rem;font-size:1.1rem;">Uploading...</h3>
            <p style="color:#6b7280;font-size:.875rem;">Please wait while your file is being uploaded.</p>
        </div>
    `;

    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) throw new Error('User not authenticated');
        const timestamp = Date.now();
        const fileExt = file.name.split('.').pop();
        const fileName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const filePath = `submissions/${user.id}/${fileName}`;
        
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('faculty-submissions')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) throw uploadError;
        const { data: urlData } = supabaseClient.storage
            .from('faculty-submissions')
            .getPublicUrl(filePath);
        const { data: submissionData, error: submissionError } = await supabaseClient
            .from('submissions')
            .insert({
                professor_id: user.id,
                requirement_id: selectedRequirementId,
                status: 'pending',
                remarks: description || null
            })
            .select()
            .single();

        if (submissionError) throw submissionError;
        const { data: fileData, error: fileError } = await supabaseClient
            .from('submission_files')
            .insert({
                submission_id: submissionData.id,
                file_name: file.name,
                file_url: urlData.publicUrl,
                file_size: file.size,
                file_type: file.type || `application/${fileExt}`
            })
            .select()
            .single();

        if (fileError) throw fileError;

        showUploadSuccess();

    } catch (error) {
        console.error('Upload error:', error);
        showUploadError(error.message);
    }
}

function showUploadSuccess() {
    const step2 = document.getElementById('upload-step-2');
    if (!step2) return;
    step2.innerHTML = `
        <div class="panel-header">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            File Uploaded Successfully
        </div>
        <div class="panel-body" style="text-align:center; padding:3rem 2rem;">
            <div style="width:64px;height:64px;border-radius:50%;background:#d1fae5;display:flex;align-items:center;justify-content:center;margin:0 auto 1.2rem;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#065f46" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 style="font-family:'Merriweather',serif;color:#145a2e;margin-bottom:.5rem;font-size:1.1rem;">Upload Submitted!</h3>
            <p style="color:#6b7f6e;font-size:.875rem;margin-bottom:1.75rem;">Your file has been submitted and is pending admin review.</p>
            <div style="display:flex;gap:.85rem;justify-content:center;">
                <a href="faculty-upload.html" style="padding:.6rem 1.4rem;background:#1a6b36;color:#fff;border-radius:.6rem;font-weight:700;font-size:.875rem;text-decoration:none;box-shadow:0 3px 12px rgba(20,90,46,.3);">Upload Another</a>
                <a href="faculty-myfiles.html" style="padding:.6rem 1.4rem;border:1.5px solid #d4ddd6;color:#1a2e1c;border-radius:.6rem;font-weight:600;font-size:.875rem;text-decoration:none;">View My Files</a>
            </div>
        </div>`;
}

function showUploadError(message) {
    const step2 = document.getElementById('upload-step-2');
    if (!step2) return;
    step2.innerHTML = `
        <div class="panel-body" style="text-align:center; padding:3rem 2rem;">
            <div style="width:64px;height:64px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;margin:0 auto 1.2rem;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
            <h3 style="font-family:'Merriweather',serif;color:#dc2626;margin-bottom:.5rem;font-size:1.1rem;">Upload Failed</h3>
            <p style="color:#6b7280;font-size:.875rem;margin-bottom:1.75rem;">${escapeHtml(message)}</p>
            <button onclick="location.reload()" style="padding:.6rem 1.4rem;background:#dc2626;color:#fff;border:none;border-radius:.6rem;font-weight:700;font-size:.875rem;cursor:pointer;">Try Again</button>
        </div>
    `;
}
