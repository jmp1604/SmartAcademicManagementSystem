document.addEventListener('DOMContentLoaded', async () => {
    checkSupabaseConnection();
    await loadSystemSettings();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('saveCollegeSettings').addEventListener('click', saveCollegeSettings);
    document.getElementById('saveAcademicSettings').addEventListener('click', saveAcademicSettings);
    document.getElementById('saveGradingSettings').addEventListener('click', saveGradingSettings);
    document.getElementById('saveFeatureSettings').addEventListener('click', saveFeatureSettings);
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

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        if (data) {
            populateSettings(data);
        }
    } catch (error) {
        console.error('Error loading system settings:', error);
    }
}

function populateSettings(settings) {
    // College Settings
    if (settings.college_name) {
        document.getElementById('collegeName').value = settings.college_name;
    }
    if (settings.college_code) {
        document.getElementById('collegeCode').value = settings.college_code;
    }
    if (settings.contact_email) {
        document.getElementById('collegeEmail').value = settings.contact_email;
    }
    if (settings.address) {
        document.getElementById('collegeAddress').value = settings.address;
    }
    if (settings.logo_url) {
        document.getElementById('collegeLogo').value = settings.logo_url;
    }

    // Academic Settings
    if (settings.academic_year) {
        document.getElementById('academicYear').value = settings.academic_year;
    }
    if (settings.current_semester) {
        document.getElementById('currentSemester').value = settings.current_semester;
    }
    if (settings.semester_start_date) {
        document.getElementById('semesterStartDate').value = settings.semester_start_date;
    }
    if (settings.semester_end_date) {
        document.getElementById('semesterEndDate').value = settings.semester_end_date;
    }

    // Grading Settings
    if (settings.passing_grade) {
        document.getElementById('passingGrade').value = settings.passing_grade;
    }
    if (settings.grade_display_mode) {
        document.getElementById('gradeMode').value = settings.grade_display_mode;
    }

    // System Features
    if (settings.features) {
        const features = typeof settings.features === 'string' 
            ? JSON.parse(settings.features) 
            : settings.features;
        
        if (features.faculty_requirements !== undefined) {
            document.getElementById('facultyRequirements').checked = features.faculty_requirements;
        }
        if (features.time_monitoring !== undefined) {
            document.getElementById('timeMonitoring').checked = features.time_monitoring;
        }
        if (features.thesis_archiving !== undefined) {
            document.getElementById('thesisArchiving').checked = features.thesis_archiving;
        }
        if (features.student_violations !== undefined) {
            document.getElementById('studentViolations').checked = features.student_violations;
        }
    }
}

async function saveCollegeSettings() {
    try {
        const settingsData = {
            college_name: document.getElementById('collegeName').value,
            college_code: document.getElementById('collegeCode').value,
            contact_email: document.getElementById('collegeEmail').value,
            address: document.getElementById('collegeAddress').value,
            logo_url: document.getElementById('collegeLogo').value,
            updated_at: new Date().toISOString()
        };

        await updateSystemSettings(settingsData);
        showAlert('College settings saved successfully', 'success');
    } catch (error) {
        console.error('Error saving college settings:', error);
        showAlert('Error saving college settings: ' + error.message, 'danger');
    }
}

async function saveAcademicSettings() {
    try {
        const settingsData = {
            academic_year: document.getElementById('academicYear').value,
            current_semester: document.getElementById('currentSemester').value,
            semester_start_date: document.getElementById('semesterStartDate').value,
            semester_end_date: document.getElementById('semesterEndDate').value,
            updated_at: new Date().toISOString()
        };

        await updateSystemSettings(settingsData);
        showAlert('Academic settings saved successfully', 'success');
    } catch (error) {
        console.error('Error saving academic settings:', error);
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
    if (!supabaseClient) {
        throw new Error('Supabase client not initialized');
    }

    // First, check if settings exist
    const { data: existingSettings, error: checkError } = await supabaseClient
        .from('system_settings')
        .select('id')
        .single();

    if (existingSettings) {
        // Update existing settings
        const { error } = await supabaseClient
            .from('system_settings')
            .update(settingsData)
            .eq('id', existingSettings.id);

        if (error) throw error;
    } else {
        // Insert new settings
        const settingsToInsert = {
            ...settingsData,
            created_at: new Date().toISOString()
        };

        const { error } = await supabaseClient
            .from('system_settings')
            .insert([settingsToInsert]);

        if (error) throw error;
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
    
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}
