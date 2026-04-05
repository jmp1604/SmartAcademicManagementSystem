/**
 * audit-logger.js
 * Comprehensive audit logging utility for the Faculty Requirement Submission System.
 * Logs admin actions, professor submissions, logins, and status changes.
 *
 * Include this ONCE in any page that needs audit logging,
 * AFTER supabase is initialized and user session exists.
 *
 * Usage Examples:
 *   // Admin actions
 *   await auditLog('CREATE_CATEGORY', 'categories', id, name, null, newRecord);
 *   await auditLog('UPDATE_CATEGORY', 'categories', id, name, oldRecord, newRecord);
 *
 *   // Professor submissions
 *   await auditLog('SUBMIT_FILE', 'submissions', submissionId, fileName, null, fileRecord);
 *   await auditLog('DELETE_SUBMISSION', 'submissions', submissionId, submissionName, oldRecord, null);
 *
 *   // Status changes
 *   await auditLog('APPROVE_SUBMISSION', 'submissions', submissionId, submissionName, {status:'pending'}, {status:'approved'});
 *
 *   // Logins
 *   await auditLog('LOGIN', 'professors', userId, userName);
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REQUIRED Supabase RLS policies for requirement_submission_audit_logs:
 *
 * -- Run this in Supabase SQL Editor:
 *
 * alter table public.requirement_submission_audit_logs enable row level security;
 *
 * -- Allow ANYONE (anon + authenticated) to insert — the app controls who calls this
 * drop policy if exists "Allow inserts for audit logging" on public.requirement_submission_audit_logs;
 * drop policy if exists "Enable insert for authenticated users" on public.requirement_submission_audit_logs;
 *
 * create policy "Allow all inserts for audit logging"
 *   on public.requirement_submission_audit_logs
 *   for insert
 *   to anon, authenticated
 *   with check (true);
 *
 * -- Allow authenticated users to read
 * drop policy if exists "Enable read for authenticated users" on public.requirement_submission_audit_logs;
 * drop policy if exists "Admins can view audit logs" on public.requirement_submission_audit_logs;
 *
 * create policy "Allow all reads for audit logs"
 *   on public.requirement_submission_audit_logs
 *   for select
 *   to anon, authenticated
 *   using (true);
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Writes one entry to requirement_submission_audit_logs.
 *
 * @param {string}      action      - e.g. 'CREATE_CATEGORY', 'LOGIN', 'APPROVE_SUBMISSION'
 * @param {string}      targetTable - e.g. 'categories', 'professors', 'admins'
 * @param {string}      targetId    - UUID / ID of the affected record
 * @param {string}      targetName  - Human-readable label (name / title of the record)
 * @param {object|null} oldValue    - Record state BEFORE the change (null for creates/logins)
 * @param {object|null} newValue    - Record state AFTER the change  (null for deletes)
 */
async function auditLog(action, targetTable, targetId, targetName, oldValue = null, newValue = null) {
    try {
        // ── 1. Pull user from sessionStorage (set by login.js before this is called) ──
        const userStr = sessionStorage.getItem('user');
        if (!userStr) {
            console.warn('[AuditLog] No user in sessionStorage — logging skipped');
            return;
        }
        const user = JSON.parse(userStr);

        // ── 2. Guard: supabaseClient must exist ───────────────────────────────────────
        if (typeof supabaseClient === 'undefined' || !supabaseClient) {
            console.error('[AuditLog] supabaseClient not available');
            return;
        }

        // ── 3. Build the row ──────────────────────────────────────────────────────────
        let entry = {
            action:        action,
            target_table:  targetTable,
            target_id:     targetId           || null,
            target_name:   targetName         || null,
            old_value:     oldValue           || null,
            new_value:     newValue           || null,
            department_id: user.departmentId  || null,
        };
        if (user.userType === 'admin') {
            entry.admin_id = user.id || null;
        } else if (user.userType === 'professor') {
            entry.professor_id = user.id || null;
        } else {
            entry.admin_id = user.id || null;
        }

        console.log('[AuditLog] Inserting entry:', entry);

        // ── 4. Insert ─────────────────────────────────────────────────────────────────
        //  We do NOT rely on supabase.auth.getSession() here.
        //  The RLS policy must allow `anon` role inserts so this always works,
        //  regardless of whether the user has a Supabase Auth session
        //  (professors often do not — they only live in the custom professors table).
        const { data, error } = await supabaseClient
            .from('requirement_submission_audit_logs')
            .insert([entry])
            .select();

        if (error) {
            console.error('[AuditLog] ✗ Failed to write audit entry:', {
                message: error.message,
                code:    error.code,
                status:  error.status,
                details: error.details,
                hint:    error.hint,
            });
        } else {
            console.log(`[AuditLog] ✓ Logged "${action}" on "${targetTable}" (${targetName}):`, data);
        }

    } catch (err) {
        console.error('[AuditLog] Unexpected error:', err);
    }
}