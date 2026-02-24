// Multi-step form variables
let currentStep = 1;
const totalSteps = 2;

// DOM Elements
const form = document.getElementById('registrationForm');
const backBtn = document.getElementById('backBtn');
const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');
const submitBtn = document.getElementById('submitBtn');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setupPasswordToggles();
    setupFormNavigation();
    setupFormValidation();
});

// Password Toggle Functionality
function setupPasswordToggles() {
    const toggleButtons = document.querySelectorAll('.toggle-password');
    
    toggleButtons.forEach(toggle => {
        toggle.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const passwordField = document.getElementById(targetId);
            
            if (passwordField.type === 'password') {
                passwordField.type = 'text';
                this.innerHTML = `
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                `;
            } else {
                passwordField.type = 'password';
                this.innerHTML = `
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                `;
            }
        });
    });
}

// Form Navigation Setup
function setupFormNavigation() {
    backBtn.addEventListener('click', function() {
        window.location.href = 'login.html';
    });

    nextBtn.addEventListener('click', function() {
        if (validateStep(currentStep)) {
            goToStep(currentStep + 1);
        }
    });

    prevBtn.addEventListener('click', function() {
        goToStep(currentStep - 1);
    });

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (validateStep(currentStep)) {
            submitRegistration();
        }
    });
}

// Navigate to specific step
function goToStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > totalSteps) return;

    // Hide current step
    document.querySelector(`.form-step[data-step="${currentStep}"]`).classList.remove('active');
    document.querySelector(`.step[data-step="${currentStep}"]`).classList.remove('active');

    // Update current step
    currentStep = stepNumber;

    // Show new step
    document.querySelector(`.form-step[data-step="${currentStep}"]`).classList.add('active');
    document.querySelector(`.step[data-step="${currentStep}"]`).classList.add('active');

    // Update navigation buttons
    updateNavigationButtons();
}

// Update navigation button visibility
function updateNavigationButtons() {
    if (currentStep === 1) {
        backBtn.style.display = 'flex';
        nextBtn.style.display = 'flex';
        prevBtn.style.display = 'none';
        submitBtn.style.display = 'none';
    } else if (currentStep === totalSteps) {
        backBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        prevBtn.style.display = 'flex';
        submitBtn.style.display = 'flex';
    }
}

function validateStep(step) {
    const currentStepElement = document.querySelector(`.form-step[data-step="${step}"]`);
    const inputs = currentStepElement.querySelectorAll('input[required], select[required]');
    let isValid = true;

    inputs.forEach(input => {
        if (!validateField(input)) {
            isValid = false;
        }
    });

    if (step === 2) {
        const password = document.getElementById('password');
        const confirmPassword = document.getElementById('confirmPassword');
        
        if (password.value !== confirmPassword.value) {
            showError(confirmPassword, 'Passwords do not match');
            isValid = false;
        }

        // Email validation
        const email = document.getElementById('email');
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email.value)) {
            showError(email, 'Please enter a valid email address');
            isValid = false;
        }
    }

    return isValid;
}

function validateField(field) {
    const value = field.value.trim();
    clearError(field);

    if (field.hasAttribute('required') && !value) {
        showError(field, 'This field is required');
        return false;
    }

    if (field.type === 'email') {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(value)) {
            showError(field, 'Please enter a valid email address');
            return false;
        }
    }

    if (field.hasAttribute('minlength')) {
        const minLength = parseInt(field.getAttribute('minlength'));
        if (value.length < minLength) {
            showError(field, `Must be at least ${minLength} characters`);
            return false;
        }
    }

    field.classList.remove('is-invalid');
    field.classList.add('is-valid');
    return true;
}

function showError(field, message) {
    field.classList.add('is-invalid');
    field.classList.remove('is-valid');
    
    const existingError = field.parentElement.querySelector('.invalid-feedback');
    if (existingError) {
        existingError.remove();
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'invalid-feedback';
    errorDiv.textContent = message;
    
    if (field.parentElement.classList.contains('input-wrapper')) {
        field.parentElement.parentElement.appendChild(errorDiv);
    } else {
        field.parentElement.appendChild(errorDiv);
    }
}

function clearError(field) {
    field.classList.remove('is-invalid', 'is-valid');
    const errorDiv = field.parentElement.querySelector('.invalid-feedback') || 
                    field.parentElement.parentElement.querySelector('.invalid-feedback');
    if (errorDiv) {
        errorDiv.remove();
    }
}

function setupFormValidation() {
    const inputs = form.querySelectorAll('input, select');
    
    inputs.forEach(input => {
        input.addEventListener('blur', function() {
            if (this.value.trim()) {
                validateField(this);
            }
        });

        input.addEventListener('input', function() {
            if (this.classList.contains('is-invalid')) {
                clearError(this);
            }
        });
    });

    const confirmPassword = document.getElementById('confirmPassword');
    confirmPassword.addEventListener('input', function() {
        const password = document.getElementById('password');
        if (this.value && password.value !== this.value) {
            showError(this, 'Passwords do not match');
        } else if (this.value && password.value === this.value) {
            clearError(this);
            this.classList.add('is-valid');
        }
    });
}

function submitRegistration() {
    const formData = {
        employee_id: document.getElementById('employeeId').value.trim(),
        first_name: document.getElementById('firstName').value.trim(),
        middle_name: document.getElementById('middleName').value.trim(),
        last_name: document.getElementById('lastName').value.trim(),
        department: document.getElementById('department').value,
        role: document.getElementById('role').value,
        user_type: document.getElementById('userType').value,
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value,
        status: 'pending', 
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    let registrations = JSON.parse(localStorage.getItem('pendingRegistrations') || '[]');
    registrations.push(formData);
    localStorage.setItem('pendingRegistrations', JSON.stringify(registrations));
    alert('Registration successful! Your account is pending admin approval. You will be notified once your account is activated.');
    setTimeout(() => {
        window.location.href = 'login.html';
    }, 1000);
}
