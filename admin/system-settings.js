document.addEventListener('DOMContentLoaded', async () => {
    checkSupabaseConnection();
    await loadSystemSettings();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('saveAcademicSettings').addEventListener('click', saveAcademicSettings);
    document.getElementById('saveGradingSettings').addEventListener('click', saveGradingSettings);
    document.getElementById('saveFeatureSettings').addEventListener('click', saveFeatureSettings);

    const departmentSelect = document.getElementById('departmentSelect');
    if (departmentSelect) {
        departmentSelect.addEventListener('change', loadDepartmentDetails);
    }

    const departmentLogoFile = document.getElementById('departmentLogoFile');
    if (departmentLogoFile) {
        departmentLogoFile.addEventListener('change', previewDepartmentLogo);
    }

    const saveDepartmentLogo = document.getElementById('saveDepartmentLogo');
    if (saveDepartmentLogo) {
        saveDepartmentLogo.addEventListener('click', saveDepartmentLogoHandler);
    }

    const clearDepartmentLogoBtn = document.getElementById('clearDepartmentLogoBtn');
    if (clearDepartmentLogoBtn) {
        clearDepartmentLogoBtn.addEventListener('click', clearDepartmentSelection);
    }
}


async function loadSystemSettings() {
    try {
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            return;
        }

        const { data, error } = await supabaseClient
            .from('system_settings')
            .select('*')
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        if (data) populateSettings(data);

        // Load departments
        await loadDepartments();
    } catch (error) {
        console.error('Error loading system settings:', error);
    }
}

async function loadDepartments() {
    try {
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            return;
        }

        const { data: departments, error } = await supabaseClient
            .from('departments')
            .select('id, department_name, department_code, logo_url, is_active')
            .eq('is_active', true)
            .order('department_name', { ascending: true });

        if (error) throw error;

        const departmentSelect = document.getElementById('departmentSelect');
        if (departmentSelect && departments && departments.length > 0) {
            // Clear existing options except the first one
            while (departmentSelect.children.length > 1) {
                departmentSelect.removeChild(departmentSelect.lastChild);
            }

            departments.forEach(dept => {
                const option = document.createElement('option');
                option.value = dept.id;
                option.textContent = `${dept.department_name} (${dept.department_code})`;
                option.dataset.deptName = dept.department_name;
                option.dataset.deptCode = dept.department_code;
                option.dataset.logoUrl = dept.logo_url || '';
                departmentSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading departments:', error);
        showAlert('Error loading departments: ' + error.message, 'danger');
    }
}

function populateSettings(settings) {
    if (settings.academic_year) document.getElementById('academicYear').value = settings.academic_year;
    if (settings.current_semester) document.getElementById('currentSemester').value = settings.current_semester;
    if (settings.semester_start_date) document.getElementById('semesterStartDate').value = settings.semester_start_date;
    if (settings.semester_end_date) document.getElementById('semesterEndDate').value = settings.semester_end_date;
    if (settings.passing_grade) document.getElementById('passingGrade').value = settings.passing_grade;
    if (settings.grade_display_mode) document.getElementById('gradeMode').value = settings.grade_display_mode;

    if (settings.features) {
        const features = typeof settings.features === 'string'
            ? JSON.parse(settings.features)
            : settings.features;

        if (features.faculty_requirements !== undefined)
            document.getElementById('facultyRequirements').checked = features.faculty_requirements;
        if (features.time_monitoring !== undefined)
            document.getElementById('timeMonitoring').checked = features.time_monitoring;
        if (features.thesis_archiving !== undefined)
            document.getElementById('thesisArchiving').checked = features.thesis_archiving;
        if (features.student_violations !== undefined)
            document.getElementById('studentViolations').checked = features.student_violations;
    }
}

const COLLEGE_LOGO_BUCKET = 'dept-logos';

async function saveCollegeSettings() {
    try {
        const collegeLogoFile = document.getElementById('collegeLogoFile').files[0];
        let logoUrl = null;
        
        if (collegeLogoFile) {
            const MAX_SIZE = 2 * 1024 * 1024;
            const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];

            if (!ALLOWED.includes(collegeLogoFile.type)) {
                showAlert('Invalid file type. Please upload PNG, JPG, WEBP, or SVG.', 'warning');
                return;
      DEPARTMENT_LOGO_BUCKET = 'dept-logos';       console.error('Error saving academic settings:', error);
        showAlert('Error saving academic settings: ' + error.message, 'danger');
    }
}

async function saveGradingSettings() {
    try {
        const settingsData = {
            passing_grade: parseFloat(document.getElementById('passingGrade').value),
            grade_display_mode: document.getElementById('gradeMode').value,
            updated_at: new Date().toISOString()
        };
        await updateSystemSettings(settingsData);
        showAlert('Grading settings saved successfully', 'success');
    } catch (error) {
        console.error('Error saving grading settings:', error);
        showAlert('Error saving grading settings: ' + error.message, 'danger');
    }
}

async function saveFeatureSettings() {
    try {
        const features = {
            faculty_requirements: document.getElementById('facultyRequirements').checked,
            time_monitoring: document.getElementById('timeMonitoring').checked,
            thesis_archiving: document.getElementById('thesisArchiving').checked,
            student_violations: document.getElementById('studentViolations').checked
        };
        const settingsData = {
            features: JSON.stringify(features),
            updated_at: new Date().toISOString()
        };
        await updateSystemSettings(settingsData);
        showAlert('Feature settings saved successfully', 'success');
    } catch (error) {
        console.error('Error saving feature settings:', error);
        showAlert('Error saving feature settings: ' + error.message, 'danger');
    }
}

async function updateSystemSettings(settingsData) {
    if (!supabaseClient) throw new Error('Supabase client not initialized');

    const { data: existingSettings, error: checkError } = await supabaseClient
        .from('system_settings')
        .select('id')
        .single();

    if (existingSettings) {
        const { error } = await supabaseClient
            .from('system_settings')
            .update(settingsData)
            .eq('id', existingSettings.id);
        if (error) throw error;
    } else {
        const { error } = await supabaseClient
            .from('system_settings')
            .insert([{ ...settingsData, created_at: new Date().toISOString() }]);
        if (error) throw error;
    }
}

// Department Management Functions
function loadDepartmentDetails(event) {
    const selectedDeptId = event.target.value;
    const detailsContainer = document.getElementById('departmentDetailsContainer');
    
    if (!selectedDeptId) {
        detailsContainer.style.display = 'none';
        clearDepartmentSelection();
        return;
    }

    const selectedOption = event.target.options[event.target.selectedIndex];
    
    document.getElementById('deptName').value = selectedOption.dataset.deptName;
    document.getElementById('deptCode').value = selectedOption.dataset.deptCode;
    
    const logoUrl = selectedOption.dataset.logoUrl;
    const currentLogo = document.getElementById('currentDeptLogo');
    const noLogoText = document.getElementById('noLogoText');
    
    if (logoUrl && logoUrl !== '') {
        currentLogo.src = logoUrl;
        currentLogo.style.display = 'block';
        noLogoText.style.display = 'none';
    } else {
        currentLogo.style.display = 'none';
        noLogoText.style.display = 'block';
    }
    
    // Reset the file input
    document.getElementById('departmentLogoFile').value = '';
    document.getElementById('newLogoPreview').style.display = 'none';
    
    detailsContainer.style.display = 'block';
}

function previewDepartmentLogo(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const preview = document.getElementById('newLogoPreview');
    const img = document.getElementById('newDeptLogo');
    
    if (preview && img) {
        img.src = URL.createObjectURL(file);
        preview.style.display = 'block';
    }
}

function clearDepartmentSelection() {
    document.getElementById('departmentSelect').value = '';
    document.getElementById('departmentDetailsContainer').style.display = 'none';
    document.getElementById('departmentLogoFile').value = '';
    document.getElementById('newLogoPreview').style.display = 'none';
}

const DEPARTMENT_LOGO_BUCKET = 'dept-logos';

async function saveDepartmentLogoHandler() {
    try {
        const departmentSelect = document.getElementById('departmentSelect');
        const selectedDeptId = departmentSelect.value;
        
        if (!selectedDeptId) {
            showAlert('Please select a department first', 'warning');
            return;
        }

        const departmentLogoFile = document.getElementById('departmentLogoFile').files[0];
        
        if (!departmentLogoFile) {
            showAlert('Please select a logo file to upload', 'warning');
            return;
        }

        const MAX_SIZE = 2 * 1024 * 1024;
        const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];

        if (!ALLOWED.includes(departmentLogoFile.type)) {
            showAlert('Invalid file type. Please upload PNG, JPG, WEBP, or SVG.', 'warning');
            return;
        }
        if (departmentLogoFile.size > MAX_SIZE) {
            showAlert('File too large. Maximum allowed size is 2 MB.', 'warning');
            return;
        }

        const ext = departmentLogoFile.name.split('.').pop().toLowerCase();
        const filePath = `departments/${selectedDeptId}/logo.${ext}`;
        
        // Upload the file
        const { error: uploadError } = await supabaseClient
            .storage
            .from(DEPARTMENT_LOGO_BUCKET)
            .upload(filePath, departmentLogoFile, {
                cacheControl: '3600',
                upsert: true,
                contentType: departmentLogoFile.type
            });
        
        if (uploadError) throw uploadError;
        
        // Get the public URL
        const { data: urlData } = supabaseClient
            .storage
            .from(DEPARTMENT_LOGO_BUCKET)
            .getPublicUrl(filePath);
        
        const logoUrl = urlData.publicUrl;
        
        // Update the department record in the database
        const { error: updateError } = await supabaseClient
            .from('departments')
            .update({ 
                logo_url: logoUrl,
                updated_at: new Date().toISOString()
            })
            .eq('id', selectedDeptId);
        
        if (updateError) throw updateError;

        // Reload departments to update the dropdown
        await loadDepartments();
        
        // Show the updated logo
        const currentLogo = document.getElementById('currentDeptLogo');
        const noLogoText = document.getElementById('noLogoText');
        currentLogo.src = logoUrl;
        currentLogo.style.display = 'block';
        noLogoText.style.display = 'none';

        // Reset file input and preview
        document.getElementById('departmentLogoFile').value = '';
        document.getElementById('newLogoPreview').style.display = 'none';

        showAlert('Department logo uploaded successfully', 'success');
    } catch (error) {
        console.error('Error saving department logo:', error);
        showAlert('Error saving department logo: ' + error.message, 'danger');
    }
}

function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.setAttribute('role', 'alert');
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    const mainContent = document.querySelector('.main-content');
    mainContent.insertBefore(alertDiv, mainContent.firstChild);
    setTimeout(() => alertDiv.remove(), 5000);
}
