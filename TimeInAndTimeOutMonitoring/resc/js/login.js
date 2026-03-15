/* ============================================================
   login.js
   TimeInAndTimeOutMonitoring / resc / js / login.js

   Handles:
   - Password show/hide toggle
   - Login form submission via Supabase Auth
   ============================================================ */

import { supabase } from '../../config/config.js'

// ── Password toggle ────────────────────────────────────────────
document.getElementById('togglePw').addEventListener('click', function () {
    const pw = document.getElementById('password');
    const isHidden = pw.type === 'password';
    pw.type = isHidden ? 'text' : 'password';
    this.classList.toggle('fa-eye-slash');
    this.classList.toggle('fa-eye');
});

// ── Helper: show error ─────────────────────────────────────────
function showError(message) {
    const box = document.getElementById('errorBox');
    const msg = document.getElementById('errorMsg');
    msg.textContent = message;
    box.style.display = 'flex';
}

function hideError() {
    document.getElementById('errorBox').style.display = 'none';
}

// ── Login form submit ──────────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    const employeeId = document.getElementById('employee_id').value.trim();
    const password   = document.getElementById('password').value.trim();
    const btn        = document.getElementById('btnLogin');

    if (!employeeId || !password) {
        showError('Please fill in all fields.');
        return;
    }

    // Disable button while loading
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in...';

    try {
        /*
         * Step 1: Look up the admin's email using their employee_id
         * Your admins table uses email for Supabase Auth,
         * but your login form uses employee_id — so we look up
         * the email first, then sign in with it.
         *
         * NOTE: Update the table name below if needed.
         * Based on your Supabase schema the table is 'admins'
         * but your original PHP used 'system_admins'.
         * Confirm with your team which one to use.
         */
        const { data: adminData, error: lookupError } = await supabase
            .from('admins')               // ← update table name if needed
            .select('email, admin_level, status')
            .eq('employee_id', employeeId)  // ← update column name if needed
            .eq('status', 'active')
            .single();

        if (lookupError || !adminData) {
            showError('Employee ID not found or account is inactive.');
            return;
        }

        // Step 2: Sign in via Supabase Auth using their email
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
            email:    adminData.email,
            password: password
        });

        if (signInError) {
            showError('Incorrect password.');
            return;
        }

        // Step 3: Redirect based on role
        const role = adminData.admin_level;

        if (role === 'super_admin' || role === 'admin') {
            window.location.href = '../admin/dashboard.html';
        } else {
            showError('Unknown role assigned. Please contact the system administrator.');
        }

    } catch (err) {
        console.error(err);
        showError('Something went wrong. Please try again.');
    } finally {
        // Re-enable button
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Log In';
    }
});