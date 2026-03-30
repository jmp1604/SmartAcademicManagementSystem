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
    if (!supabaseClient) {
        throw new Error('Database connection not available. Please check configuration.');
    }

    let userData = null;
    let tableName = '';
    let userRole = '';

    const { data: adminData, error: adminError } = await supabaseClient
        .from('admins')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();

    if (adminError && adminError.code !== 'PGRST116') { 
        throw adminError;
    }

    if (adminData) {
        userData = adminData;
        tableName = 'admins';
        userRole = adminData.admin_level || 'admin';
    } else {
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
            userRole = profData.role || 'faculty'; 
        }
    }

    if (!userData) {
        throw new Error('Invalid email or password');
    }

    if (userData.status !== 'active') {
        throw new Error('Your account is not active. Please contact the administrator.');
    }

    const { error: authSignInError } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (authSignInError) {
        console.warn('Supabase Auth sign-in failed, attempting sign-up:', authSignInError.message);
        const { error: signUpError } = await supabaseClient.auth.signUp({
            email: email,
            password: password
        });
        if (signUpError) {
            console.warn('Supabase Auth sign-up also failed:', signUpError.message);
        } else {
            await supabaseClient.auth.signInWithPassword({ email, password });
        }
    }

    // Fetch department info for professors and department-assigned admins
    let departmentInfo = null;
    if (userData.department_id) {
        try {
            const { data: deptData } = await supabaseClient
                .from('departments')
                .select('id, department_name, department_code, logo_url')
                .eq('id', userData.department_id)
                .single();
            
            if (deptData) {
                departmentInfo = deptData;
            }
        } catch (error) {
            console.error('Error fetching department info:', error);
        }
    }

    sessionStorage.setItem('user', JSON.stringify({
        id: userData.professor_id || userData.admin_id,
        employeeId: userData.employee_id,
        firstName: userData.first_name,
        middleName: userData.middle_name,
        lastName: userData.last_name,
        email: userData.email,
        role: userRole,
        userType: tableName === 'admins' ? 'admin' : 'professor',
        adminLevel: tableName === 'admins' ? (userData.admin_level || 'admin') : null, 
        departmentId: userData.department_id || null,
        department: departmentInfo ? departmentInfo.department_name : (userData.department || null),
        departmentCode: departmentInfo ? departmentInfo.department_code : null,
        departmentLogo: departmentInfo ? departmentInfo.logo_url : null,
        loginTime: new Date().toISOString()
    }));

    console.log('Login successful - User data saved to session:');
    console.log('- userType:', tableName === 'admins' ? 'admin' : 'professor');
    console.log('- role:', userRole);
    console.log('- email:', userData.email);
    console.log('- department:', departmentInfo ? departmentInfo.department_name : 'N/A');

    if (tableName === 'admins' && userData.admin_level === 'super_admin') {
        window.location.href = '../admin/usermanagement.html';
    } else {
        window.location.href = '../portal/portal.html';
    }
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