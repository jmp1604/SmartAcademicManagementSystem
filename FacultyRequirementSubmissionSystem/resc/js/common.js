
function checkSupabaseConnection() {
    const indicator = document.getElementById('supabaseIndicator');
    
    if (typeof supabaseClient !== 'undefined' && supabaseClient !== null) {
        console.log('✓ Supabase client is connected to:', SUPABASE_CONFIG.projectUrl);
        
        // Update indicator to show connected status (green light)
        if (indicator) {
            indicator.classList.add('connected');
            indicator.classList.remove('disconnected');
            indicator.title = 'Supabase Connected';
        }
        
        return true;
    } else {
        console.error('✗ Supabase client is not initialized');
        
        // Update indicator to show disconnected status (red light)
        if (indicator) {
            indicator.classList.add('disconnected');
            indicator.classList.remove('connected');
            indicator.title = 'Supabase Disconnected';
        }
        
        return false;
    }
}

// Check if user is logged in
function checkUserSession() {
    const user = sessionStorage.getItem('user');
    if (!user) {
        // Redirect to login if no session found
        window.location.href = '../../auth/login.html';
        return false;
    }
    return true;
}

document.addEventListener('DOMContentLoaded', function () {
    // Check user session first
    checkUserSession();
    
    // Verify Supabase connection on page load
    checkSupabaseConnection();
    
    const logoutBtn = document.querySelector('.btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function (e) {
            e.preventDefault();
            if (confirm('Are you sure you want to log out?')) {
                // Clear session
                sessionStorage.removeItem('user');
                window.location.href = '../../auth/login.html';
            }
        });
    }

    const helpBtn = document.querySelector('.help-btn');
    if (helpBtn) {
        helpBtn.addEventListener('click', function () {
            alert('For assistance, please contact the CCS System Administrator.');
        });
    }

});
