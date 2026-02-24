// Login functionality
document.addEventListener('DOMContentLoaded', function() {
    const form = document.querySelector('form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const submitBtn = document.querySelector('.btn-signin');

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        
        if (!username || !password) {
            alert('Please enter both email and password');
            return;
        }

        // Disable submit button during login
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';

        try {
            await loginUser(username, password);
        } catch (error) {
            console.error('Login error:', error);
            alert('Login failed: ' + (error.message || 'Unknown error occurred'));
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
        }
    });
});

async function loginUser(email, password) {
    // Check if Supabase is configured
    if (!supabaseClient) {
        throw new Error('Database connection not available. Please check configuration.');
    }

    let userData = null;
    let tableName = '';
    let userRole = '';

    // First, check admins table
    const { data: adminData, error: adminError } = await supabaseClient
        .from('admins')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();

    if (adminError && adminError.code !== 'PGRST116') { // PGRST116 is "not found" error
        throw adminError;
    }

    if (adminData) {
        userData = adminData;
        tableName = 'admins';
        userRole = 'admin';
    } else {
        // If not found in admins, check professors table
        const { data: profData, error: profError } = await supabaseClient
            .from('professors')
            .select('*')
            .eq('email', email)
            .eq('password', password)
            .single();

        if (profError && profError.code !== 'PGRST116') {
            throw profError;
        }

        if (profData) {
            userData = profData;
            tableName = 'professors';
            userRole = profData.role || 'faculty'; // Use role from database (dean or faculty)
        }
    }

    // Validate login
    if (!userData) {
        throw new Error('Invalid email or password');
    }

    // Check account status
    if (userData.status !== 'active') {
        throw new Error('Your account is not active. Please contact the administrator.');
    }

    // Store user session
    sessionStorage.setItem('user', JSON.stringify({
        id: userData.professor_id || userData.admin_id,
        employeeId: userData.employee_id,
        firstName: userData.first_name,
        middleName: userData.middle_name,
        lastName: userData.last_name,
        email: userData.email,
        role: userRole,
        userType: tableName === 'admins' ? 'admin' : 'professor',
        department: userData.department || null,
        loginTime: new Date().toISOString()
    }));

    // Redirect to portal for all users to choose their system
    window.location.href = '../portal/portal.html';
}

function togglePassword() {
    const pwd = document.getElementById('password');
    const icon = document.getElementById('toggle-icon');
    if (pwd.type === 'password') {
        pwd.type = 'text';
        icon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`;
    } else {
        pwd.type = 'password';
        icon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
    }
}
