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

async function writeLoginAudit(userObj, tableName) {
    console.log('[AuditLog] writeLoginAudit called | tableName:', tableName, '| id:', userObj.id);

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        console.error('[AuditLog] supabaseClient not available — skipping audit');
        return;
    }

    const userName = tableName === 'admins' 
        ? (userObj.lastName || '').trim()
        : `${userObj.firstName || ''} ${userObj.lastName || ''}`.trim();

    let entry = {
        action:        'LOGIN',
        target_table:  tableName,
        target_id:     userObj.id           || null,
        target_name:   userName             || null,
        old_value:     null,
        new_value:     null,
        department_id: userObj.departmentId || null,
    };

    if (tableName === 'admins') {
        entry.admin_id = userObj.id || null;
    } else if (tableName === 'professors') {
        entry.professor_id = userObj.id || null;
    }

    console.log('[AuditLog] Inserting entry:', entry);

    try {
        const { data, error } = await supabaseClient
            .from('requirement_submission_audit_logs')
            .insert([entry])
            .select();

        if (error) {
            console.error('[AuditLog] ✗ Insert failed:', {
                message: error.message,
                code:    error.code,
                details: error.details,
                hint:    error.hint,
            });
        } else {
            console.log('[AuditLog] ✓ LOGIN audit logged successfully for', tableName, ':', data);
        }
    } catch (err) {
        console.error('[AuditLog] ✗ Unexpected error during insert:', err);
    }
}

async function ensureSupabaseAuthSession(email, password) {
    const { error: signInError } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (!signInError) {
        console.log('[Auth] ✓ Supabase Auth session established for:', email);
        return true;
    }

    console.warn('[Auth] Sign-in failed, attempting sign-up:', signInError.message);
    const { error: signUpError } = await supabaseClient.auth.signUp({ email, password });

    if (signUpError) {
        console.warn('[Auth] Sign-up also failed:', signUpError.message);
        return false;
    }

    const { error: retryError } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (retryError) {
        console.warn('[Auth] Sign-in after sign-up failed:', retryError.message);
        return false;
    }

    console.log('[Auth] ✓ Supabase Auth session created and established for:', email);
    return true;
}

async function loginUser(username, password) {
    console.log('[loginUser] FUNCTION CALLED - username:', username);

    if (!supabaseClient) {
        throw new Error('Database connection not available. Please check configuration.');
    }

    let userData  = null;
    let tableName = '';
    let userRole  = '';

    const isStudentId  = /^\d{2}-?\d{5}$|^\d{7}$/.test(username.replace(/\s/g, ''));
    const isEmployeeId = /^[A-Za-z0-9]{3,10}$/.test(username.replace(/\s/g, ''))
                    && !/^\d+$/.test(username.replace(/\s/g, ''));

    // ── Check admins ──────────────────────────────────────────────────────────
    let adminQuery = supabaseClient
        .from('admins')
        .select('*')
        .eq('password', password);

    adminQuery = isEmployeeId
        ? adminQuery.eq('employee_id', username)
        : adminQuery.eq('email', username);

    const { data: adminData, error: adminError } = await adminQuery.single();
    if (adminError && adminError.code !== 'PGRST116') throw adminError;

    if (adminData) {
        userData  = adminData;
        tableName = 'admins';
        userRole  = adminData.admin_level || 'admin';
    }

    // ── Check professors ──────────────────────────────────────────────────────
    if (!userData) {
        let profQuery = supabaseClient
            .from('professors')
            .select('*')
            .eq('password', password);

        profQuery = isEmployeeId
            ? profQuery.eq('employee_id', username)
            : profQuery.eq('email', username);

        const { data: profData, error: profError } = await profQuery.single();
        if (profError && profError.code !== 'PGRST116') throw profError;

        if (profData) {
            console.log('[loginUser] ✓ Professor found!');
            userData  = profData;
            tableName = 'professors';
            userRole  = profData.role || 'faculty';
        }
    }

    // ── Check students ────────────────────────────────────────────────────────
    if (!userData) {
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
        if (studentError && studentError.code !== 'PGRST116') throw studentError;

        if (studentData) {
            userData  = studentData;
            tableName = 'students';
            userRole  = 'student';
        }
    }

    if (!userData) {
        throw new Error('Invalid credentials. Please check your email, ID, and password.');
    }
    if (userData.status !== 'active') {
        throw new Error('Your account is not active. Please contact the administrator.');
    }

    if (tableName === 'admins' || tableName === 'professors') {
        await ensureSupabaseAuthSession(userData.email, password);
    }

    let departmentInfo = null;
    if (userData.department_id) {
        try {
            const { data: deptData } = await supabaseClient
                .from('departments')
                .select('id, department_name, department_code, logo_url')
                .eq('id', userData.department_id)
                .single();
            if (deptData) departmentInfo = deptData;
        } catch (err) {
            console.error('[loginUser] Error fetching department info:', err);
        }
    }

    const userObj = {
        id:             userData.student_id || userData.professor_id || userData.admin_id,
        studentId:      userData.id_number    || null,
        employeeId:     userData.employee_id  || null,
        firstName:      tableName === 'admins' ? null : userData.first_name,
        middleName:     userData.middle_name  || null,
        lastName:       tableName === 'admins' ? userData.admin_name : userData.last_name,
        email:          userData.email,
        course:         userData.course       || null,
        year_level:     userData.year_level   || null,
        section:        userData.section      || null,
        role:           userRole,
        userType:       tableName === 'admins'     ? 'admin'
                      : tableName === 'professors' ? 'professor'
                      :                             'student',
        adminLevel:     tableName === 'admins' ? (userData.admin_level || 'admin') : null,
        departmentId:   userData.department_id                        || null,
        department:     departmentInfo ? departmentInfo.department_name : (userData.department || null),
        departmentCode: departmentInfo ? departmentInfo.department_code : null,
        departmentLogo: departmentInfo ? departmentInfo.logo_url        : null,
        loginTime:      new Date().toISOString(),
    };

    sessionStorage.setItem('user', JSON.stringify(userObj));
    console.log('[loginUser] ✓ User saved to sessionStorage:', userObj);

    // ── Audit log (admins + professors) — awaited BEFORE redirect ────────────
    if (tableName === 'admins' || tableName === 'professors') {
        console.log('[loginUser] Writing audit log for:', tableName);
        await writeLoginAudit(userObj, tableName);
        console.log('[loginUser] ✓ Audit log step complete');
    }

    // ── Redirect ──────────────────────────────────────────────────────────────
    console.log('[loginUser] Redirecting... tableName=', tableName);
    if (tableName === 'admins' && userData.admin_level === 'super_admin') {
        window.location.href = '../admin/usermanagement.html';
    } else {
        window.location.href = '../portal/portal.html';
    }
}

function togglePassword() {
    const pwd  = document.getElementById('password');
    const icon = document.getElementById('toggle-icon');
    if (pwd.type === 'password') {
        pwd.type = 'text';
        icon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`;
    } else {
        pwd.type = 'password';
        icon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
    }
}