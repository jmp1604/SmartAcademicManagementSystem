document.addEventListener('DOMContentLoaded', async function () {
    await loadCategories();
    initializeUploadForm();
});


async function loadCategories() {
    try {
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            return;
        }

        const { data: categories, error } = await supabaseClient
            .from('categories')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            console.error('Error loading categories:', error);
            showNoCategoriesMessage();
            return;
        }

        if (!categories || categories.length === 0) {
            showNoCategoriesMessage();
            return;
        }

        renderCategories(categories);
        updateUploadStatistics();
    } catch (error) {
        console.error('Error in loadCategories:', error);
        showNoCategoriesMessage();
    }
}

function renderCategories(categories) {
    const grid = document.getElementById('categoriesGridUpload');
    if (!grid) return;

    const noMessage = document.getElementById('noCategoriesMessage');
    if (noMessage) noMessage.style.display = 'none';

    grid.innerHTML = categories.map(category => {
        let icon = category.icon || '📁';
        if (icon.includes('fa-')) {
            icon = `<i class="${icon}"></i>`;
        }
        
        return `
            <div class="category-card" data-category-id="${category.id}" data-category-name="${escapeHtml(category.name)}">
                <div class="category-icon">${icon}</div>
                <div class="category-name">${escapeHtml(category.name)}</div>
                <div class="category-description">${escapeHtml(category.description || '')}</div>
            </div>
        `;
    }).join('');
    document.querySelectorAll('.category-card').forEach(card => {
        card.addEventListener('click', function() {
            selectCategory(this);
        });
    });
}

function showNoCategoriesMessage() {
    const grid = document.getElementById('categoriesGridUpload');
    const noMessage = document.getElementById('noCategoriesMessage');
    
    if (grid) grid.innerHTML = '';
    if (noMessage) noMessage.style.display = 'block';
}

function selectCategory(categoryCard) {
    document.querySelectorAll('.category-card').forEach(card => {
        card.classList.remove('selected');
    });
    categoryCard.classList.add('selected');
    
    const categoryId = categoryCard.dataset.categoryId;
    const categoryName = categoryCard.dataset.categoryName;
    document.getElementById('selected-category-id').value = categoryId;
    document.getElementById('selected-category-name').textContent = categoryName;
    document.getElementById('file-category').value = categoryName;
    moveToStep(2);
}

function initializeUploadForm() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const removeFileBtn = document.getElementById('remove-file');
    const uploadForm = document.getElementById('upload-form');
    const backBtn = document.getElementById('btn-back-step');

    if (!dropzone || !fileInput) return;
    browseBtn?.addEventListener('click', function(e) {
        e.preventDefault();
        fileInput.click();
    });
    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            handleFileSelect(this.files[0]);
        }
    });
    dropzone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', function() {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    removeFileBtn?.addEventListener('click', function(e) {
        e.preventDefault();
        resetFileInput();
    });

    backBtn?.addEventListener('click', function(e) {
        e.preventDefault();
        moveToStep(1);
    });

    uploadForm?.addEventListener('submit', async function(e) {
        e.preventDefault();
        await submitUpload();
    });
}

function handleFileSelect(file) {
    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
        alert('File size exceeds 25 MB limit. Please choose a smaller file.');
        return;
    }
    const validTypes = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    if (!validTypes.includes(fileExt)) {
        alert('Invalid file type. Supported types: PDF, DOCX, XLSX, PPTX');
        return;
    }
    document.getElementById('upload-form').dataset.selectedFile = file.name;
    const filePreview = document.getElementById('file-preview');
    const previewName = document.getElementById('preview-name');
    const previewSize = document.getElementById('preview-size');

    previewName.textContent = file.name;
    previewSize.textContent = formatBytes(file.size);
    
    filePreview.style.display = 'flex';
    document.getElementById('dropzone').style.display = 'none';

    window.selectedUploadFile = file;
}

function resetFileInput() {
    document.getElementById('file-input').value = '';
    document.getElementById('file-preview').style.display = 'none';
    document.getElementById('dropzone').style.display = 'flex';
    window.selectedUploadFile = null;
}

function moveToStep(stepNumber) {
    const step1 = document.getElementById('upload-step-1');
    const step2 = document.getElementById('upload-step-2');

    if (stepNumber === 1) {
        step1.classList.add('active');
        step2.classList.remove('active');
        resetFileInput();
    } else if (stepNumber === 2) {
        const categoryId = document.getElementById('selected-category-id')?.value;
        if (!categoryId) {
            alert('Please select a category first');
            return;
        }
        step1.classList.remove('active');
        step2.classList.add('active');
    }
}

async function submitUpload() {
    try {
        const categoryId = document.getElementById('selected-category-id')?.value;
        const file = window.selectedUploadFile;
        const description = document.getElementById('file-description')?.value || '';

        if (!categoryId) {
            alert('Please select a category');
            return;
        }

        if (!file) {
            alert('Please select a file to upload');
            return;
        }

        // Get the logged-in user from sessionStorage (contains correct professor_id)
        const sessionUser = getCurrentUser();
        if (!sessionUser || !sessionUser.id) {
            console.error('User not authenticated in session');
            alert('Please log in to upload files');
            return;
        }

        console.log('[UPLOAD DEBUG] Current professor_id from session:', sessionUser.id);
        console.log('[UPLOAD DEBUG] User name:', sessionUser.firstName, sessionUser.lastName);

        const { data: requirement, error: reqError } = await supabaseClient
            .from('requirements')
            .select('id')
            .eq('category_id', categoryId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (reqError && reqError.code !== 'PGRST116') {
            console.error('Error fetching requirement:', reqError);
            alert('Error loading requirement. Please try again.');
            return;
        }

        if (!requirement) {
            alert('No requirement found for this category. Please contact administrator.');
            return;
        }

        const submitBtn = document.querySelector('#upload-form button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Uploading...</span>';

        // Sanitize filename: replace spaces and special characters with underscores
        const sanitizedFileName = file.name.replace(/\s+/g, '_').replace(/[^\w._-]/g, '_');
        const timestamp = Date.now();
        const filePath = `${sessionUser.id}/${timestamp}_${sanitizedFileName}`;
        
        console.log('[UPLOAD] Starting file upload...');
        console.log('[UPLOAD] File path:', filePath);
        console.log('[UPLOAD] Original file name:', file.name);
        console.log('[UPLOAD] Sanitized file name:', sanitizedFileName);
        console.log('[UPLOAD] File size:', file.size);
        console.log('[UPLOAD] File type:', file.type);
        
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('faculty-submissions')
            .upload(filePath, file);

        console.log('[UPLOAD] Upload response:', { uploadData, uploadError });

        if (uploadError) {
            console.error('[UPLOAD ERROR]', uploadError);
            alert('Failed to upload file. Error: ' + (uploadError?.message || 'Unknown error'));
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            return;
        }
        
        console.log('[UPLOAD] File uploaded successfully to:', filePath);

        // FIX: changed 'notes' to 'remarks' to match the submissions table schema
        const { data: submission, error: submissionError } = await supabaseClient
            .from('submissions')
            .insert({
                professor_id: sessionUser.id,
                requirement_id: requirement.id,
                status: 'pending',
                submitted_at: new Date().toISOString(),
                remarks: description
            })
            .select()
            .single();

        console.log('[UPLOAD DEBUG] Submission created with professor_id:', sessionUser.id);
        console.log('[UPLOAD DEBUG] Full submission:', submission);

        if (submissionError) {
            console.error('Submission error:', submissionError);
            alert('Failed to create submission. Please try again.');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            return;
        }

        const { error: fileRecordError } = await supabaseClient
            .from('submission_files')
            .insert({
                submission_id: submission.id,
                file_name: sanitizedFileName,
                file_url: filePath,
                file_size: file.size,
                file_type: file.type
            });

        if (fileRecordError) {
            console.error('File record error:', fileRecordError);
            alert('File uploaded but failed to create record. Please contact support.');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            return;
        }

        alert('File uploaded successfully! Your submission is now pending review.');
        
        document.getElementById('upload-form').reset();
        resetFileInput();
        moveToStep(1);
        updateUploadStatistics();

        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;

    } catch (error) {
        console.error('Error submitting upload:', error);
        alert('An error occurred while uploading. Please try again.');
        
        const submitBtn = document.querySelector('#upload-form button[type="submit"]');
        submitBtn.disabled = false;
    }
}

async function updateUploadStatistics() {
    try {
        const sessionUser = getCurrentUser();
        if (!sessionUser || !sessionUser.id) return;

        const { data: submissions, error } = await supabaseClient
            .from('submissions')
            .select('status')
            .eq('professor_id', sessionUser.id);

        if (error) {
            console.error('Error loading user submissions:', error);
            return;
        }

        const total = submissions?.length || 0;
        const approved = submissions?.filter(s => s.status === 'approved').length || 0;
        const pending = submissions?.filter(s => s.status === 'pending').length || 0;

        document.getElementById('upload-total').textContent = total;
        document.getElementById('upload-approved').textContent = approved;
        document.getElementById('upload-pending').textContent = pending;

    } catch (error) {
        console.error('Error updating statistics:', error);
    }
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text ? String(text).replace(/[&<>"']/g, m => map[m]) : '';
}