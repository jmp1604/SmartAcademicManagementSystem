document.addEventListener('DOMContentLoaded', function () {

    const logoutBtn = document.querySelector('.btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function () {
            if (confirm('Are you sure you want to log out?')) {
                window.location.href = '../auth/login.html';
            }
        });
    }

    const helpBtn = document.querySelector('.help-btn');
    if (helpBtn) {
        helpBtn.addEventListener('click', function () {
            alert('For assistance, please contact the CCS System Administrator.');
        });
    }

    const cards = document.querySelectorAll('.system-card');
    cards.forEach(function (card) {
        card.addEventListener('click', function (e) {
            // Href is already set on the <a> tag; this handler can be used
            // for analytics or transition effects in the future.
            // Example: add a ripple / loading state before navigating
            card.style.opacity = '0.8';
            card.style.transform = 'scale(0.98)';
            setTimeout(function () {
                card.style.opacity = '';
                card.style.transform = '';
            }, 200);
        });
    });

});