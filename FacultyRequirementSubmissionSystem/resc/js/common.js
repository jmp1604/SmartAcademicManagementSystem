document.addEventListener('DOMContentLoaded', function () {
    const logoutBtn = document.querySelector('.btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function (e) {
            e.preventDefault();
            if (confirm('Are you sure you want to log out?')) {
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
