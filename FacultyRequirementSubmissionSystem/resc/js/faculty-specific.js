function loadUserInfo() {
    const userStr = sessionStorage.getItem('user');
    if (!userStr) {
        window.location.href = '../../auth/login.html';
        return;
    }
    
    try {
        const user = JSON.parse(userStr);
        const userName = document.getElementById('userName');
        const userAvatar = document.getElementById('userAvatar');
        const userAvatarLarge = document.getElementById('userAvatarLarge');
        const userFullName = document.getElementById('userFullName');
        const userEmail = document.getElementById('userEmail');
        
        let fullName = 'User';
        let email = 'user@email.com';
        let initials = 'U';
        
        if (user.userType === 'professor') {
            fullName = `${user.firstName} ${user.middleName ? user.middleName + ' ' : ''}${user.lastName}`;
            email = user.email || user.schoolEmail || 'faculty@plpasig.edu.ph';
            initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`;
        } else if (user.userType === 'admin') {
            fullName = user.adminName || 'Admin User';
            email = user.email || 'admin@plpasig.edu.ph';
            initials = user.adminName ? user.adminName.split(' ').map(n => n.charAt(0)).join('').substring(0, 2) : 'A';
        }
        if (userName) userName.textContent = fullName;
        if (userAvatar) userAvatar.textContent = initials.toUpperCase();
        if (userAvatarLarge) userAvatarLarge.textContent = initials.toUpperCase();
        if (userFullName) userFullName.textContent = fullName;
        if (userEmail) userEmail.textContent = email;
        
    } catch (e) {
        console.error('Error loading user info:', e);
        window.location.href = '../../auth/login.html';
    }
}

function initUserDropdown() {
    const userMenuToggle = document.getElementById('userMenuToggle');
    const userDropdown = document.getElementById('userDropdown');
    const logoutBtn = document.getElementById('logoutBtn');
    const viewProfile = document.getElementById('viewProfile');
    const accountSettings = document.getElementById('accountSettings');
    
    console.log('initUserDropdown called', {
        userMenuToggle: !!userMenuToggle,
        userDropdown: !!userDropdown,
        logoutBtn: !!logoutBtn
    });
    
    if (!userMenuToggle || !userDropdown) {
        console.log('Missing required elements - initUserDropdown aborted');
        return;
    }
    userMenuToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        console.log('User menu toggle clicked');
        userDropdown.classList.toggle('show');
        console.log('Dropdown classes after toggle:', userDropdown.className);
    });
    document.addEventListener('click', function(e) {
        if (!userMenuToggle.contains(e.target) && !userDropdown.contains(e.target)) {
            userDropdown.classList.remove('show');
        }
    });
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (confirm('Are you sure you want to logout?')) {
                sessionStorage.removeItem('user');
                sessionStorage.clear();
                window.location.href = '../../auth/login.html';
            }
        });
    }
    
    if (viewProfile) {
        viewProfile.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Profile page coming soon!');
            userDropdown.classList.remove('show');
        });
    }
    
    if (accountSettings) {
        accountSettings.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Account settings coming soon!');
            userDropdown.classList.remove('show');
        });
    }
}

function checkFacultySession() {
    const user = sessionStorage.getItem('user');
    if (!user) {
        window.location.href = '../../auth/login.html';
        return false;
    }
    return true;
}

function updateHeaderSubtitle() {
    const userStr = sessionStorage.getItem('user');
    const subtitleElement = document.getElementById('topbarSubtitle');
    
    if (!userStr || !subtitleElement) return;
    
    try {
        const user = JSON.parse(userStr);
        let subtitle = 'Portal'; 
        
        if (user.userType === 'admin') {
            if (user.adminLevel === 'super_admin') {
                subtitle = 'Super Administrator Portal';
            } else {
                subtitle = 'Administrator Portal';
            }
        } else if (user.userType === 'professor') {
            const role = (user.role || '').toLowerCase();
            if (role === 'dean') {
                subtitle = 'Dean Portal';
            } else if (role === 'professor' || role === 'faculty') {
                subtitle = 'Professor Portal';
            } else {
                subtitle = 'Faculty Portal';
            }
        } else if (user.userType === 'student') {
            subtitle = 'Student Portal';
        }
        
        subtitleElement.textContent = subtitle;
    } catch (e) {
        console.error('Error updating header subtitle:', e);
    }
}

function requireSuperAdmin() {
    if (!isSuperAdmin()) {
        alert('Access denied. This page is restricted to Super Admins only.');
        window.location.href = 'dashboard.html';
        return false;
    }
    return true;
}

document.addEventListener('DOMContentLoaded', function () {
    checkFacultySession();
    const currentPage = window.location.pathname.split('/').pop();
    document.querySelectorAll('.nav-item').forEach(function (el) {
        if (el.getAttribute('href') === currentPage) {
            el.classList.add('active');
        }
    });

    const helpBtn = document.querySelector('.help-btn');
    if (helpBtn) {
        helpBtn.addEventListener('click', function () {
            alert('For assistance, please contact the CCS System Administrator.');
        });
    }

    const categoryCards = document.querySelectorAll('.category-card');
    const step1          = document.getElementById('upload-step-1');
    const step2          = document.getElementById('upload-step-2');
    const selectedCatEl  = document.getElementById('selected-category-name');
    const btnBackStep    = document.getElementById('btn-back-step');

    if (categoryCards.length) {
        categoryCards.forEach(function (card) {
            card.addEventListener('click', function () {
                const catName = card.dataset.cat;
                categoryCards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');

                setTimeout(function () {
                    if (selectedCatEl) selectedCatEl.textContent = catName;
                    if (step1) step1.classList.remove('active');
                    if (step2) {
                        step2.classList.add('active');
                        const catSelect = document.getElementById('file-category');
                        if (catSelect) catSelect.value = catName;
                    }
                }, 180);
            });
        });
    }

    if (btnBackStep) {
        btnBackStep.addEventListener('click', function () {
            if (step2) step2.classList.remove('active');
            if (step1) step1.classList.add('active');
            categoryCards.forEach(c => c.classList.remove('selected'));
        });
    }

    const dropzone   = document.getElementById('dropzone');
    const fileInput  = document.getElementById('file-input');
    const browseBtn  = document.getElementById('browse-btn');
    const preview    = document.getElementById('file-preview');
    const prevName   = document.getElementById('preview-name');
    const prevSize   = document.getElementById('preview-size');
    const removeBtn  = document.getElementById('remove-file');

    if (dropzone && fileInput) {
        browseBtn?.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', function (e) {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', function () {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', function (e) {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) showFilePreview(file);
        });

        fileInput.addEventListener('change', function () {
            const file = fileInput.files[0];
            if (file) showFilePreview(file);
        });

        removeBtn?.addEventListener('click', function (e) {
            e.stopPropagation();
            fileInput.value = '';
            if (preview) preview.classList.remove('show');
        });
    }

    function showFilePreview(file) {
        if (!preview || !prevName || !prevSize) return;
        prevName.textContent = file.name;
        prevSize.textContent = formatBytes(file.size);
        preview.classList.add('show');
    }

    function formatBytes(bytes) {
        if (bytes < 1024)       return bytes + ' B';
        if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    const uploadForm = document.getElementById('upload-form');
    if (uploadForm) {
        uploadForm.addEventListener('submit', function (e) {
            e.preventDefault();

            const fileInput2 = document.getElementById('file-input');
            const fileDesc   = document.getElementById('file-description');

            if (!fileInput2?.files.length) {
                alert('Please select a file to upload.');
                return;
            }
            showUploadSuccess();
        });
    }

    function showUploadSuccess() {
        if (!step2) return;
        step2.innerHTML = `
            <div class="panel-header">
                <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                File Uploaded Successfully
            </div>
            <div class="panel-body" style="text-align:center; padding:3rem 2rem;">
                <div style="width:64px;height:64px;border-radius:50%;background:#d1fae5;display:flex;align-items:center;justify-content:center;margin:0 auto 1.2rem;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#065f46" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <h3 style="font-family:'Merriweather',serif;color:#145a2e;margin-bottom:.5rem;font-size:1.1rem;">Upload Submitted!</h3>
                <p style="color:#6b7f6e;font-size:.875rem;margin-bottom:1.75rem;">Your file has been submitted and is pending admin review.</p>
                <div style="display:flex;gap:.85rem;justify-content:center;">
                    <a href="faculty-upload.html" style="padding:.6rem 1.4rem;background:#1a6b36;color:#fff;border-radius:.6rem;font-weight:700;font-size:.875rem;text-decoration:none;box-shadow:0 3px 12px rgba(20,90,46,.3);">Upload Another</a>
                    <a href="faculty-myfiles.html" style="padding:.6rem 1.4rem;border:1.5px solid #d4ddd6;color:#1a2e1c;border-radius:.6rem;font-weight:600;font-size:.875rem;text-decoration:none;">View My Files</a>
                </div>
            </div>`;
    }

    const searchInput  = document.querySelector('.files-search');
    const catFilter    = document.querySelector('.cat-filter');
    const statusFilter = document.querySelector('.status-filter');

    function applyFilters() {
        const q      = (searchInput?.value || '').toLowerCase();
        const cat    = (catFilter?.value    || '').toLowerCase();
        const status = (statusFilter?.value || '').toLowerCase();

        document.querySelectorAll('.file-card[data-cat]').forEach(function (card) {
            const matchQ      = !q      || card.dataset.name?.toLowerCase().includes(q);
            const matchCat    = !cat    || cat === 'all categories' || card.dataset.cat?.toLowerCase() === cat;
            const matchStatus = !status || status === 'all status'  || card.dataset.status?.toLowerCase() === status;
            card.style.display = (matchQ && matchCat && matchStatus) ? '' : 'none';
        });
    }

    searchInput?.addEventListener('input',  applyFilters);
    catFilter?.addEventListener('change',   applyFilters);
    statusFilter?.addEventListener('change', applyFilters);
    const filterYear     = document.getElementById('filter-year');
    const filterSemester = document.getElementById('filter-semester');
    const filterCategory = document.getElementById('filter-category');
    const filterStatus   = document.getElementById('filter-status');

    if (filterYear && filterSemester && filterCategory && filterStatus) {
        function applyReportFilters() {
            const year     = filterYear.value;
            const semester = filterSemester.value;
            const category = filterCategory.value;
            const status   = filterStatus.value.toLowerCase();

            const rows = document.querySelectorAll('#submissions-tbody tr');
            let total = 0, approved = 0, pending = 0, rejected = 0;

            rows.forEach(function (row) {
                const rYear     = row.dataset.year     || '';
                const rSem      = row.dataset.semester || '';
                const rCat      = row.dataset.category || '';
                const rStatus   = row.dataset.status   || '';

                const matchYear = year === '2023-2024' ? rYear === year : true;
                const matchSem  = semester === 'All Semesters' || rSem.includes(semester.replace('1st ', '1st ').replace('2nd ', '2nd '));
                const matchCat  = category === 'All Categories' || rCat === category;
                const matchStat = status   === 'all status'     || rStatus === status;

                const show = matchYear && matchSem && matchCat && matchStat;
                row.style.display = show ? '' : 'none';

                if (show) {
                    total++;
                    if (rStatus === 'approved') approved++;
                    else if (rStatus === 'pending') pending++;
                    else if (rStatus === 'rejected') rejected++;
                }
            });

            document.getElementById('stat-total').textContent    = total;
            document.getElementById('stat-approved').textContent = approved;
            document.getElementById('stat-pending').textContent  = pending;
            document.getElementById('stat-rejected').textContent = rejected;
            document.getElementById('filtered-count').textContent = total;
        }

        filterYear.addEventListener('change',     applyReportFilters);
        filterSemester.addEventListener('change', applyReportFilters);
        filterCategory.addEventListener('change', applyReportFilters);
        filterStatus.addEventListener('change',   applyReportFilters);
    }

    if (typeof Chart !== 'undefined') {
        initReportCharts();
    }

});

function initReportCharts() {
    const donutCtx = document.getElementById('statusDonut');
    if (donutCtx) {
        new Chart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: ['Approved', 'Pending', 'Rejected'],
                datasets: [{
                    data: [5, 2, 1],
                    backgroundColor: ['#1a6b36', '#ea580c', '#dc2626'],
                    borderWidth: 0,
                    hoverOffset: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            font: { family: "'Source Sans 3', sans-serif", size: 12 },
                            color: '#6b7f6e',
                            padding: 16,
                        }
                    }
                }
            }
        });
    }

    const barCtx = document.getElementById('monthBar');
    if (barCtx) {
        new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
                datasets: [{
                    label: 'Files Uploaded',
                    data: [1, 2, 3, 1, 2, 4, 3],
                    backgroundColor: '#145a2e',
                    borderRadius: 5,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: "'Source Sans 3', sans-serif", size: 11 }, color: '#6b7f6e' }
                    },
                    y: {
                        grid: { color: '#e2ebe4', drawBorder: false },
                        ticks: { font: { family: "'Source Sans 3', sans-serif", size: 11 }, color: '#6b7f6e', stepSize: 1 },
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

function generateReport(type) {
    const labels = {
        summary:  'Submission Summary Report',
        timeline: 'Timeline Report',
        category: 'Category Breakdown Report',
        semester: 'Semester Report',
    };
    alert('Generating ' + labels[type] + '…\n\nConnect this button to your backend export endpoint (PDF/Excel).');
}
