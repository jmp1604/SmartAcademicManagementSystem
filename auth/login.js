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
            alert('Please enter both email/ID and password');
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

async function loginUser(username, password) {
    if (!supabaseClient) {
        throw new Error('Database connection not available. Please check configuration.');
    }

    let userData = null;
    let tableName = '';
    let userRole = '';
    const isStudentId = /^\d{2}-?\d{5}$|^\d{7}$/.test(username.replace(/\s/g, ''));
    const isEmployeeId = /^[A-Za-z0-9]{3,10}$/.test(username.replace(/\s/g, '')) && !/^\d+$/.test(username.replace(/\s/g, ''));

    let adminQuery = supabaseClient
        .from('admins')
        .select('*')
        .eq('password', password);

    if (isEmployeeId) {
        adminQuery = adminQuery.eq('employee_id', username);
    } else {
        adminQuery = adminQuery.eq('email', username);
    }

    const { data: adminData, error: adminError } = await adminQuery.single();

    if (adminError && adminError.code !== 'PGRST116') { 
        throw adminError;
    }

    if (adminData) {
        userData = adminData;
        tableName = 'admins';
        userRole = adminData.admin_level || 'admin';
    } else {
        let profQuery = supabaseClient
            .from('professors')
            .select('*')
            .eq('password', password);

        if (isEmployeeId) {
            profQuery = profQuery.eq('employee_id', username);
        } else {
            profQuery = profQuery.eq('email', username);
        }

        const { data: profData, error: profError } = await profQuery.single();

        if (profError && profError.code !== 'PGRST116') {
            throw profError;
        }

        if (profData) {
            userData = profData;
            tableName = 'professors';
            userRole = profData.role || 'faculty'; 
        } else {
            let studentQuery = supabaseClient
                .from('students')
                .select('*')
                .eq('password', password);

            if (isStudentId) {
                const normalizedId = username.replace(/\D/g, '');
                studentQuery = studentQuery.eq('id_number', normalizedId);
            } else {
                studentQuery = studentQuery.eq('email', username);
            }

            const { data: studentData, error: studentError } = await studentQuery.single();

            if (studentError && studentError.code !== 'PGRST116') {
                throw studentError;
            }

            if (studentData) {
                userData = studentData;
                tableName = 'students';
                userRole = 'student';
            }
        }
    }

    if (!userData) {
        throw new Error('Invalid credentials. Please check your email, ID, and password.');
    }

    if (userData.status !== 'active') {
        throw new Error('Your account is not active. Please contact the administrator.');
    }

    if (tableName !== 'students') {
        const { error: authSignInError } = await supabaseClient.auth.signInWithPassword({
            email: userData.email,
            password: password
        });

        if (authSignInError) {
            console.warn('Supabase Auth sign-in failed, attempting sign-up:', authSignInError.message);
            const { error: signUpError } = await supabaseClient.auth.signUp({
                email: userData.email,
                password: password
            });
            if (signUpError) {
                console.warn('Supabase Auth sign-up also failed:', signUpError.message);
            } else {
                await supabaseClient.auth.signInWithPassword({ email: userData.email, password });
            }
        }
    }

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
        id: userData.student_id || userData.professor_id || userData.admin_id,
        studentId: userData.id_number || null,
        employeeId: userData.employee_id || null,
        firstName: userData.first_name,
        middleName: userData.middle_name || null,
        lastName: userData.last_name,
        email: userData.email,
        course: userData.course || null,
        year_level: userData.year_level || null,
        section: userData.section || null,
        role: userRole,
        userType: tableName === 'admins' ? 'admin' : (tableName === 'professors' ? 'professor' : 'student'),
        adminLevel: tableName === 'admins' ? (userData.admin_level || 'admin') : null, 
        departmentId: userData.department_id || null,
        department: departmentInfo ? departmentInfo.department_name : (userData.department || null),
        departmentCode: departmentInfo ? departmentInfo.department_code : null,
        departmentLogo: departmentInfo ? departmentInfo.logo_url : null,
        loginTime: new Date().toISOString()
    }));

    console.log('Login successful - User data saved to session:');
    console.log('- userType:', tableName === 'admins' ? 'admin' : (tableName === 'professors' ? 'professor' : 'student'));
    console.log('- role:', userRole);
    console.log('- email:', userData.email);
    console.log('- studentId:', userData.id_number || 'N/A');
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