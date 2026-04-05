const PAGE_SIZE = 20;

let allLogs     = [];
let filtered    = [];
let currentPage = 1;

document.addEventListener('DOMContentLoaded', async () => {
    const userStr = sessionStorage.getItem('user');
    if (!userStr) { window.location.href = '../../auth/login.html'; return; }

    try {
        const user = JSON.parse(userStr);
        if (user.userType !== 'admin') {
            alert('Access denied. Admin privileges required.');
            window.location.href = '../../portal/portal.html';
            return;
        }
    } catch {
        window.location.href = '../../auth/login.html';
        return;
    }

    if (typeof supabaseClient === 'undefined') {
        await new Promise(r => setTimeout(r, 100));
    }

    await loadLogs();
    initFilters();
});

async function loadLogs() {
    try {
        const user = JSON.parse(sessionStorage.getItem('user'));
        console.log('[AuditLogsPage] User info:', { id: user.id, deptId: user.departmentId, userType: user.userType });

        const { data, error } = await supabaseClient
            .from('requirement_submission_audit_logs')
            .select('*')
            .eq('department_id', user.departmentId)
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) {
            console.error('[AuditLogsPage] Query error:', error);
            throw error;
        }

        console.log('[AuditLogsPage] Logs found:', data.length);
        console.log('[AuditLogsPage] Raw data:', data);

        allLogs  = data || [];
        filtered = [...allLogs];
        updateStats();
        renderPage(1);

    } catch (err) {
        console.error('[AuditLogsPage] Error loading audit logs:', err);
        showNotification('Error loading audit logs', 'error');
        showEmptyState();
    }
}

function updateStats() {
    document.getElementById('statTotal').textContent   = allLogs.length;
    document.getElementById('statCreates').textContent = allLogs.filter(l => l.action.startsWith('CREATE')).length;
    document.getElementById('statUpdates').textContent = allLogs.filter(l => l.action.startsWith('UPDATE') || l.action.startsWith('TOGGLE')).length;
    document.getElementById('statDeletes').textContent = allLogs.filter(l => l.action.startsWith('DELETE')).length;
}

function initFilters() {
    document.getElementById('searchLogs').addEventListener('input',   applyFilters);
    document.getElementById('filterAction').addEventListener('change', applyFilters);
    document.getElementById('filterTable').addEventListener('change',  applyFilters);
    document.getElementById('filterDate').addEventListener('change',   applyFilters);
}

function applyFilters() {
    const search = document.getElementById('searchLogs').value.toLowerCase();
    const action = document.getElementById('filterAction').value;
    const table  = document.getElementById('filterTable').value;
    const date   = document.getElementById('filterDate').value; // 'YYYY-MM-DD' or ''

    filtered = allLogs.filter(log => {
        if (action !== 'all' && log.action !== action) return false;
        if (table  !== 'all' && log.target_table !== table) return false;

        if (date) {
            const logDate = new Date(log.created_at).toISOString().slice(0, 10);
            if (logDate !== date) return false;
        }

        if (search) {
            const haystack = [
                log.action,
                log.target_table,
                log.target_name,
            ].join(' ').toLowerCase();
            if (!haystack.includes(search)) return false;
        }

        return true;
    });

    renderPage(1);
}

function renderPage(page) {
    currentPage = page;
    const start = (page - 1) * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);

    const tbody      = document.getElementById('auditTableBody');
    const emptyState = document.getElementById('emptyState');
    const table      = document.getElementById('auditTable');

    if (filtered.length === 0) {
        table.style.display = 'none';
        emptyState.style.display = 'block';
        document.getElementById('paginationBar').innerHTML = '';
        return;
    }

    table.style.display = 'table';
    emptyState.style.display = 'none';

    tbody.innerHTML = slice.map((log, idx) => {
        const dt         = new Date(log.created_at);
        const dateStr    = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr    = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const badge      = actionBadge(log.action);
        const hasChanges = log.old_value || log.new_value;

        return `
            <tr>
                <td>
                    <div class="timestamp-cell">
                        <span class="timestamp-date">${dateStr}</span>
                        <span class="timestamp-time">${timeStr}</span>
                    </div>
                </td>
                <td>${badge}</td>
                <td>
                    <div class="record-cell">
                        <strong>${escapeHtml(log.target_name || '—')}</strong>
                        <small>${log.target_id ? log.target_id.substring(0, 8) + '…' : ''}</small>
                    </div>
                </td>
                <td><span class="table-badge">${escapeHtml(log.target_table)}</span></td>
                <td>
                    ${hasChanges
                        ? `<button class="btn-view-diff" onclick="openDiffModal(${start + idx})">
                               <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                               View
                           </button>`
                        : `<span class="no-changes">No snapshot</span>`
                    }
                </td>
            </tr>
        `;
    }).join('');

    renderPagination();
}

function renderPagination() {
    const total = Math.ceil(filtered.length / PAGE_SIZE);
    const bar   = document.getElementById('paginationBar');

    if (total <= 1) { bar.innerHTML = ''; return; }

    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end   = Math.min(currentPage * PAGE_SIZE, filtered.length);

    let html = `<span class="page-info">Showing ${start}–${end} of ${filtered.length}</span>`;
    html += `<button class="page-btn" onclick="renderPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;

    for (let p = 1; p <= total; p++) {
        if (total > 7 && p > 2 && p < total - 1 && Math.abs(p - currentPage) > 1) {
            if (p === 3 || p === total - 2) html += `<span class="page-btn" style="border:none;cursor:default;">…</span>`;
            continue;
        }
        html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="renderPage(${p})">${p}</button>`;
    }

    html += `<button class="page-btn" onclick="renderPage(${currentPage + 1})" ${currentPage === total ? 'disabled' : ''}>›</button>`;
    bar.innerHTML = html;
}

function openDiffModal(index) {
    const log = filtered[index];
    if (!log) return;

    document.getElementById('diffModalTitle').textContent =
        `${humanAction(log.action)} — ${log.target_name || log.target_table}`;

    const container = document.getElementById('diffContainer');
    container.innerHTML = '';

    if (log.action.startsWith('CREATE')) {
        container.appendChild(buildDiffSection('after',  '✦ Created With',  log.new_value));
    } else if (log.action.startsWith('DELETE')) {
        container.appendChild(buildDiffSection('before', '✕ Deleted Record', log.old_value));
    } else {
        if (log.old_value) container.appendChild(buildDiffSection('before', '← Before', log.old_value));
        if (log.new_value) container.appendChild(buildDiffSection('after',  '→ After',  log.new_value));
    }

    document.getElementById('diffModal').style.display = 'flex';
}

function buildDiffSection(type, title, data) {
    if (!data) return document.createDocumentFragment();

    const section = document.createElement('div');
    section.className = `diff-section ${type}`;

    const titleEl = document.createElement('div');
    titleEl.className = 'diff-section-title';
    titleEl.textContent = title;

    const body = document.createElement('div');
    body.className = 'diff-body';

    const skip = ['id', 'created_at', 'updated_at', 'department_id', 'created_by'];

    Object.entries(data).forEach(([key, val]) => {
        if (skip.includes(key)) return;
        const row = document.createElement('div');
        row.className = 'diff-row';

        const k = document.createElement('span');
        k.className = 'diff-key';
        k.textContent = key.replace(/_/g, ' ');

        const v = document.createElement('span');
        v.className = 'diff-val';
        v.textContent = val === null || val === undefined ? '—' : String(val);

        row.appendChild(k);
        row.appendChild(v);
        body.appendChild(row);
    });

    section.appendChild(titleEl);
    section.appendChild(body);
    return section;
}

function closeDiffModal() {
    document.getElementById('diffModal').style.display = 'none';
}

function actionBadge(action) {
    const map = {
        LOGIN:                   { cls: 'login',  label: 'Login' },
        CREATE_CATEGORY:         { cls: 'create', label: 'Create Category' },
        UPDATE_CATEGORY:         { cls: 'update', label: 'Update Category' },
        TOGGLE_CATEGORY_STATUS:  { cls: 'toggle', label: 'Toggle Status' },
        DELETE_CATEGORY:         { cls: 'delete', label: 'Delete Category' },
        CREATE_REQUIREMENT:      { cls: 'create', label: 'Create Requirement' },
        UPDATE_REQUIREMENT:      { cls: 'update', label: 'Update Requirement' },
        DELETE_REQUIREMENT:      { cls: 'delete', label: 'Delete Requirement' },
        SUBMIT_FILE:             { cls: 'create', label: 'Submit File' },
        DELETE_SUBMISSION:       { cls: 'delete', label: 'Delete Submission' },
        APPROVE_SUBMISSION:      { cls: 'update', label: 'Approve Submission' },
        REJECT_SUBMISSION:       { cls: 'delete', label: 'Reject Submission' },
    };

    const def = map[action] || { cls: 'update', label: action };
    return `<span class="action-badge ${def.cls}">${escapeHtml(def.label)}</span>`;
}

function humanAction(action) {
    return action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function showEmptyState() {
    document.getElementById('auditTable').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
}

function escapeHtml(text) {
    const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' };
    return text ? String(text).replace(/[&<>"']/g, m => map[m]) : '';
}

function showNotification(message, type = 'info') {
    const n = document.createElement('div');
    n.style.cssText = `
        position:fixed;top:90px;right:20px;
        background:${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color:#fff;padding:1rem 1.5rem;border-radius:.5rem;
        box-shadow:0 10px 30px rgba(0,0,0,.2);z-index:9999;
        font-weight:600;font-size:.9rem;`;
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 3000);
}