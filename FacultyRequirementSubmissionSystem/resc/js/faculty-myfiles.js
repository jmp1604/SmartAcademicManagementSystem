document.addEventListener('DOMContentLoaded', function () {
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
});
