/* ============================================================
   manualAttendance.js
   TimeInAndTimeOutMonitoring / resc / js / manualAttendance.js
   Uses: supabaseClient (from config/.env.js)
============================================================ */

// ── Constants ─────────────────────────────────────────────────
const PROFESSOR_START_WINDOW = 45;
const STUDENT_GRACE_MINUTES  = 15;
const PROF_EARLY_WINDOW_MINS = 30;

const ERR_ACTIONS = new Set([
    'NOT_ENROLLED', 'NO_SCHEDULE', 'SESSION_NOT_STARTED', 'SESSION_ENDED',
    'TOO_EARLY', 'NO_VALID_SCHEDULE', 'CANNOT_TIME_OUT', 'COMPLETED'
]);

// ── State ─────────────────────────────────────────────────────
let payload = null;

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('footerYear').textContent = new Date().getFullYear();

    // Clock
    function tick() {
        const n = new Date();
        document.getElementById('live-clock').textContent =
            n.toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
            + '  ·  '
            + n.toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    }
    tick(); setInterval(tick, 1000);

    // Enter key
    document.getElementById('id_input').addEventListener('keydown', e => {
        if (e.key === 'Enter') doLookup();
    });

    // Buttons
    document.getElementById('btn-lookup').addEventListener('click', doLookup);
    document.getElementById('btn-confirm').addEventListener('click', doConfirm);
    document.getElementById('btn-reset').addEventListener('click', resetForm);
});

// ══════════════════════════════════════════════════════════════
// LOOKUP
// ══════════════════════════════════════════════════════════════
async function doLookup() {
    const id  = document.getElementById('id_input').value.trim();
    if (!id)  { showToast('Please enter your ID.', 'e'); return; }

    const btn = document.getElementById('btn-lookup');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Looking up...';

    try {
        await lookupById(id);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Look Up &amp; Check Status';
    }
}

async function lookupById(id) {
    const panel = document.getElementById('result-panel');
    panel.classList.remove('show');
    panel.style.display = 'none';
    payload = null;

    try {
        const today      = getTodayStr();
        const currentDay = getDayName();
        const now        = new Date();

        // ── Try student first ──
        const { data: student } = await supabaseClient
            .from('students')
            .select('student_id, id_number, first_name, middle_name, last_name, status')
            .eq('id_number', id)
            .maybeSingle();

        if (student) {
            const result = await getStudentStatus(student, today, currentDay, now);
            renderResult({ role: 'student', person: student, ...result });
            return;
        }

        // ── Try professor ──
        const { data: professor } = await supabaseClient
            .from('professors')
            .select('professor_id, employee_id, first_name, middle_name, last_name, status')
            .eq('employee_id', id)
            .maybeSingle();

        if (professor) {
            const result = await getProfessorStatus(professor, today, currentDay, now);
            renderResult({ role: 'professor', person: professor, ...result });
            return;
        }

        renderResult({
            success: false,
            action:  null,
            message: 'ID not found. Check your Student ID or Employee ID and try again.'
        });

    } catch (err) {
        console.error('Lookup error:', err);
        showToast('Could not complete lookup. Please try again.', 'e');
    }
}

// ══════════════════════════════════════════════════════════════
// STUDENT STATUS
// ══════════════════════════════════════════════════════════════
async function getStudentStatus(student, today, currentDay, now) {
    const sid = student.student_id;

    const { data: enrollments } = await supabaseClient
        .from('schedule_enrollments')
        .select('schedule_id')
        .eq('student_id', sid)
        .eq('status', 'enrolled');

    if (!enrollments || !enrollments.length)
        return { success: true, action: 'NOT_ENROLLED', message: 'You are not enrolled in any subject with a schedule today.' };

    const scheduleIds = enrollments.map(e => e.schedule_id);

    // ── 1. Check for Active/Stuck Sessions from ANY Date ──
    const { data: activeSessions } = await supabaseClient
        .from('lab_sessions')
        .select('session_id, schedule_id, status, actual_start_time, session_date')
        .in('schedule_id', scheduleIds)
        .in('status', ['ongoing', 'dismissing']);

    if (activeSessions && activeSessions.length > 0) {
        const sess = activeSessions[0]; 
        const { data: schData } = await supabaseClient
            .from('lab_schedules')
            .select('subjects(subject_code), laboratory_rooms(lab_code)')
            .eq('schedule_id', sess.schedule_id)
            .single();
        const schedInfo = `${schData?.subjects?.subject_code || '—'} - ${schData?.laboratory_rooms?.lab_code || '—'}`;

        const { data: att } = await supabaseClient
            .from('lab_attendance')
            .select('attendance_id, time_in, time_out')
            .eq('session_id', sess.session_id)
            .eq('student_id', sid)
            .maybeSingle();

        if (att && att.time_in && !att.time_out) {
            if (sess.status === 'ongoing') {
                return { success: true, action: 'CANNOT_TIME_OUT', session_id: sess.session_id, schedule: schedInfo,
                    message: 'Professor has not allowed dismissal yet. Please wait.' };
            }
            return { success: true, action: 'OUT', session_id: sess.session_id, schedule: schedInfo, is_late: false, late_minutes: 0,
                message: 'Confirm to record TIME OUT.' };
        } else if (!att) {
            return { success: true, action: 'IN', session_id: sess.session_id, schedule: schedInfo, is_late: false, late_minutes: 0,
                message: 'Session is currently active. Confirm to record TIME IN.' };
        }
    }

    // ── 2. Normal Flow for TODAY's schedules ──
    const { data: schedules } = await supabaseClient
        .from('lab_schedules')
        .select('schedule_id, start_time, end_time, subjects(subject_code), laboratory_rooms(lab_code)')
        .in('schedule_id', scheduleIds)
        .eq('day_of_week', currentDay)
        .eq('status', 'active')
        .order('start_time');

    if (!schedules || !schedules.length)
        return { success: true, action: 'NOT_ENROLLED', message: 'You are not enrolled in any subject with a schedule today.' };

    const { data: sessions } = await supabaseClient
        .from('lab_sessions')
        .select('session_id, schedule_id, status, actual_start_time')
        .in('schedule_id', scheduleIds)
        .eq('session_date', today);

    const sessionMap = {};
    (sessions || []).forEach(s => { sessionMap[s.schedule_id] = s; });

    let best = null, priority = 99;
    for (const sch of schedules) {
        const sess   = sessionMap[sch.schedule_id];
        const status = sess ? sess.status : 'not_created';
        if (status === 'cancelled') continue;
        const rank = { ongoing:1, dismissing:1, scheduled:2, not_created:2, completed:3 }[status] ?? 4;
        if (rank < priority) { priority = rank; best = { ...sch, session: sess, session_status: status }; }
        if (priority === 1) break;
    }

    if (!best)
        return { success: true, action: 'NOT_ENROLLED', message: 'No valid session found. Your class may have been cancelled.' };

    let session_id     = best.session ? best.session.session_id : null;
    let session_status = best.session_status;
    const schedInfo    = `${best.subjects?.subject_code || '—'} - ${best.laboratory_rooms?.lab_code || '—'}`;

    if (!session_id) {
        const { data: newSession } = await supabaseClient
            .from('lab_sessions')
            .insert({ schedule_id: best.schedule_id, session_date: today, status: 'scheduled', created_at: new Date().toISOString() })
            .select('session_id')
            .single();
        if(newSession) {
            session_id     = newSession.session_id;
            session_status = 'scheduled';
        }
    }

    if (['scheduled', 'not_created'].includes(session_status)) {
        const s = secsToDateTime(today, tdToSecs(best.start_time));
        return { success: true, action: 'SESSION_NOT_STARTED', session_id, schedule: schedInfo,
            message: `Professor has not started the session yet. Class starts at ${fmt12(s)}.` };
    }

    if (session_status === 'completed')
        return { success: true, action: 'SESSION_ENDED', session_id, schedule: schedInfo, message: 'The session has already ended.' };

    let is_late = false, late_minutes = 0;
    const actual_start = best.session?.actual_start_time;
    if (actual_start) {
        const sessStart  = secsToDateTime(today, tdToSecs(actual_start));
        const graceCutoff = new Date(sessStart.getTime() + STUDENT_GRACE_MINUTES * 60000);
        if (now > graceCutoff) {
            is_late      = true;
            late_minutes = Math.floor((now - sessStart) / 60000);
        }
    }

    const { data: att } = await supabaseClient
        .from('lab_attendance')
        .select('attendance_id, time_in, time_out')
        .eq('session_id', session_id)
        .eq('student_id', sid)
        .maybeSingle();

    if (!att)
        return { success: true, action: 'IN', session_id, schedule: schedInfo, is_late, late_minutes,
            message: is_late ? `You are LATE by ${late_minutes} min. Confirm to record TIME IN.` : 'Confirm to record TIME IN.' };

    if (att.time_in && !att.time_out) {
        if (session_status === 'ongoing')
            return { success: true, action: 'CANNOT_TIME_OUT', session_id, schedule: schedInfo,
                message: 'Professor has not allowed dismissal yet. Please wait.' };
        return { success: true, action: 'OUT', session_id, schedule: schedInfo, is_late: false, late_minutes: 0,
            message: 'Confirm to record TIME OUT.' };
    }

    return { success: true, action: 'COMPLETED', session_id, schedule: schedInfo,
        message: 'Your attendance for this session is already complete.' };
}

// ══════════════════════════════════════════════════════════════
// PROFESSOR STATUS (FIXED FOR OVERTIME SESSIONS)
// ══════════════════════════════════════════════════════════════
async function getProfessorStatus(professor, today, currentDay, now) {
    const pid = professor.professor_id;

    // ── 1. Ghost & Overtime Session Recovery (Bypasses Time Checks) ──
    const { data: stuckSessions, error: stuckErr } = await supabaseClient
        .from('lab_sessions')
        .select(`
            session_id, status, actual_dismiss_time,
            lab_schedules!inner (
                schedule_id, section, day_of_week, professor_id,
                subjects ( subject_code ),
                laboratory_rooms ( lab_code )
            )
        `)
        .eq('lab_schedules.professor_id', pid)
        .in('status', ['ongoing', 'dismissing']);

    if (stuckErr) console.error("Stuck Session Query Error:", stuckErr);

    if (stuckSessions && stuckSessions.length > 0) {
        const sess = stuckSessions[0];
        const sch  = sess.lab_schedules;
        const si   = sch
            ? `${sch.subjects?.subject_code || '—'} (${sch.section}) - ${sch.laboratory_rooms?.lab_code || '—'}`
            : 'Active Session';

        let action = sess.status === 'ongoing' ? (sess.actual_dismiss_time ? 'END' : 'DISMISS') : 'END';
        return { success: true, action, session_id: sess.session_id, schedule: si,
            message: actionMessage(action, si) };
    }

    // ── 2. Normal Flow for TODAY's schedules ──
    const { data: todaySchedules, error: schedErr } = await supabaseClient
        .from('lab_schedules')
        .select('schedule_id, day_of_week, section, start_time, end_time, subjects(subject_code), laboratory_rooms(lab_code)')
        .eq('professor_id', pid)
        .eq('day_of_week', currentDay)
        .eq('status', 'active')
        .order('start_time');

    if (schedErr) console.error("Schedule Query Error:", schedErr);

    if (!todaySchedules || !todaySchedules.length) {
         return { success: true, action: 'NO_SCHEDULE', message: 'You have no class scheduled today.' };
    }

    const todayIds = todaySchedules.map(s => s.schedule_id);
    const { data: todaySessions, error: sessErr } = await supabaseClient
        .from('lab_sessions')
        .select('session_id, schedule_id, status, actual_dismiss_time')
        .in('schedule_id', todayIds)
        .eq('session_date', today);

    if (sessErr) console.error("Sessions Query Error:", sessErr);

    const sessionMap = {};
    (todaySessions || []).forEach(s => { sessionMap[s.schedule_id] = s; });

    let closestFuture = null, closestTime = null;

    for (const sched of todaySchedules) {
        const sess      = sessionMap[sched.schedule_id];
        const status    = sess ? sess.status : 'not_created';
        const s         = secsToDateTime(today, tdToSecs(sched.start_time));
        const e         = secsToDateTime(today, tdToSecs(sched.end_time));
        const winOpen   = new Date(s.getTime() - PROF_EARLY_WINDOW_MINS * 60000);
        const schedInfo = `${sched.subjects?.subject_code || '—'} (${sched.section}) - ${sched.laboratory_rooms?.lab_code || '—'}`;

        if (status === 'cancelled') continue;

        // Too early?
        if (now < winOpen) {
            if (!closestTime || s < closestTime) { closestFuture = sched; closestTime = s; }
            continue;
        }

        // CRITICAL BUG FIX: If it is past the end time (e.g. 10:06 PM > 9:00 PM), 
        // we ONLY skip it if the session is NOT active. If it is active, keep processing!
        if (now > e && !['ongoing', 'dismissing'].includes(status)) {
            continue;
        }

        let session_id  = sess ? sess.session_id : null;
        let sess_status = status;

        if (!session_id) {
            const { data: newSession } = await supabaseClient
                .from('lab_sessions')
                .insert({ schedule_id: sched.schedule_id, session_date: today, status: 'scheduled', created_at: new Date().toISOString() })
                .select('session_id')
                .single();
            if (newSession) {
                session_id  = newSession.session_id;
                sess_status = 'scheduled';
            }
        }

        let action;
        if (['scheduled', 'not_created'].includes(sess_status)) action = 'START';
        else if (sess_status === 'ongoing')    action = sess?.actual_dismiss_time ? 'END' : 'DISMISS';
        else if (sess_status === 'dismissing') action = 'END';
        else if (sess_status === 'completed')  { continue; }
        else action = 'START';

        return { success: true, action, session_id, schedule: schedInfo,
            start: fmt12(s), end: fmt12(e), message: actionMessage(action, schedInfo) };
    }

    if (closestFuture) {
        const s    = secsToDateTime(today, tdToSecs(closestFuture.start_time));
        const w    = new Date(s.getTime() - PROF_EARLY_WINDOW_MINS * 60000);
        const mins = Math.floor((w - now) / 60000);
        const si   = `${closestFuture.subjects?.subject_code || '—'} (${closestFuture.section}) - ${closestFuture.laboratory_rooms?.lab_code || '—'}`;
        return { success: true, action: 'TOO_EARLY', schedule: si,
            message: `Next class ${closestFuture.subjects?.subject_code} starts at ${fmt12(s)}. Window opens at ${fmt12(w)} (${mins} min from now).` };
    }

    return { success: true, action: 'NO_VALID_SCHEDULE',
        message: 'No valid schedule available. All classes have ended or been voided.' };
}

function actionMessage(action, sched) {
    return {
        START:   `Confirm to START session: ${sched}`,
        DISMISS: `Confirm to allow students to TIME OUT for: ${sched}`,
        END:     `Confirm to END session: ${sched}. Remaining students will be auto timed-out.`
    }[action] || action;
}

// ══════════════════════════════════════════════════════════════
// CONFIRM
// ══════════════════════════════════════════════════════════════
async function doConfirm() {
    if (!payload) return;
    const d       = payload;
    const savedId = document.getElementById('id_input').value.trim();
    const cb      = document.getElementById('btn-confirm');

    cb.disabled = true;
    cb.textContent = '';
    const sp = document.createElement('i'); sp.className = 'fa-solid fa-spinner fa-spin';
    cb.appendChild(sp); cb.appendChild(document.createTextNode(' Processing...'));

    try {
        let res;
        if (d.role === 'professor') {
            res = await confirmProfessor(d.action, d.session_id);
        } else {
            res = await confirmStudent(d.action, d.session_id,
                d.person.student_id, d.is_late, d.late_minutes);
        }

        showToast(res.message || 'Done', res.success ? 's' : 'e');

        if (res.success) {
            payload = null;
            await new Promise(r => setTimeout(r, 600));
            await lookupById(savedId);
        } else {
            restoreConfirmBtn(cb, d.action);
        }
    } catch (err) {
        console.error('Confirm error:', err);
        showToast('Network error. Please try again.', 'e');
        restoreConfirmBtn(cb, d.action);
    }
}

async function confirmProfessor(action, session_id) {
    if (['NO_SCHEDULE', 'TOO_EARLY', 'NO_VALID_SCHEDULE'].includes(action))
        return { success: true, message: 'No action needed.' };
    if (!session_id)
        return { success: false, message: 'Missing session ID.' };

    const now = new Date().toTimeString().slice(0, 8);

    if (action === 'START') {
        await supabaseClient.from('lab_sessions').update({
            status: 'ongoing', actual_start_time: now, updated_at: new Date().toISOString()
        }).eq('session_id', session_id);
        return { success: true, message: `Session started — Students have ${STUDENT_GRACE_MINUTES} min grace period` };
    }

    if (action === 'DISMISS') {
        await supabaseClient.from('lab_sessions').update({
            status: 'dismissing', actual_dismiss_time: now, updated_at: new Date().toISOString()
        }).eq('session_id', session_id);
        return { success: true, message: 'Dismissal mode ON — Students may now time out' };
    }

    if (action === 'END') {
        await supabaseClient.from('lab_sessions').update({
            status: 'completed', actual_end_time: now, updated_at: new Date().toISOString()
        }).eq('session_id', session_id);

        // Auto time-out remaining students
        const { data: remaining } = await supabaseClient
            .from('lab_attendance')
            .select('attendance_id, time_in')
            .eq('session_id', session_id)
            .not('time_in', 'is', null)
            .is('time_out', null);

        const nowFull = new Date().toISOString();
        for (const att of (remaining || [])) {
            const duration = Math.floor((new Date() - new Date(att.time_in)) / 60000);
            await supabaseClient.from('lab_attendance').update({
                time_out: nowFull, duration_minutes: duration, updated_at: nowFull
            }).eq('attendance_id', att.attendance_id);
        }

        return { success: true, message: 'Session ended — remaining students timed out' };
    }

    return { success: false, message: 'Unknown action.' };
}

async function confirmStudent(action, session_id, student_id, is_late, late_minutes) {
    if (['NOT_ENROLLED', 'SESSION_NOT_STARTED', 'SESSION_ENDED', 'CANNOT_TIME_OUT', 'COMPLETED'].includes(action))
        return { success: true, message: 'No action needed.' };
    if (!session_id)
        return { success: false, message: 'Missing session ID.' };

    const now = new Date().toISOString();

    // Guard: block time-out if session is still ongoing
    if (action === 'OUT') {
        const { data: sess } = await supabaseClient
            .from('lab_sessions').select('status').eq('session_id', session_id).single();
        if (sess && sess.status === 'ongoing')
            return { success: false, message: 'Time-out blocked — professor has not enabled dismissal yet.' };
    }

    const { data: rec } = await supabaseClient
        .from('lab_attendance')
        .select('attendance_id, time_in, time_out')
        .eq('session_id', session_id)
        .eq('student_id', student_id)
        .maybeSingle();

    if (!rec) {
        await supabaseClient.from('lab_attendance').insert({
            session_id, student_id,
            time_in:                        now,
            time_in_status:                 is_late ? 'late' : 'on-time',
            late_minutes:                   late_minutes || 0,
            verified_by_facial_recognition: false,
            created_at:                     now
        });
        return { success: true, message: is_late ? `Time IN recorded — LATE by ${late_minutes} min` : 'Time IN recorded — On Time' };
    }

    if (rec.time_in && !rec.time_out) {
        const duration = Math.floor((new Date() - new Date(rec.time_in)) / 60000);
        await supabaseClient.from('lab_attendance').update({
            time_out: now, duration_minutes: duration, updated_at: now
        }).eq('attendance_id', rec.attendance_id);
        return { success: true, message: 'Time OUT recorded' };
    }

    return { success: true, message: 'Attendance already complete' };
}

// ══════════════════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════════════════
function renderResult(data) {
    payload = data;
    const panel  = document.getElementById('result-panel');
    const action = data.action || '';
    const role   = data.role   || '';
    const person = data.person || {};
    const isErr  = ERR_ACTIONS.has(action);

    // Avatar
    if (!data.success && !data.action) {
        setAv('av-e', '❓');
    } else if (isErr && action !== 'COMPLETED') {
        setAv('av-w', action === 'SESSION_NOT_STARTED' ? '⏳'
                    : action === 'CANNOT_TIME_OUT'     ? '🚫'
                    : action === 'TOO_EARLY'            ? '🕐' : '⚠️');
    } else if (role === 'professor') {
        setAv(action === 'DISMISS' ? 'av-w' : action === 'END' ? 'av-e' : 'av-p',
              action === 'DISMISS' ? '🚪'   : action === 'END' ? '⏹'   : '👨‍🏫');
    } else {
        setAv('av-s', '🎓');
    }

    const fullName = [person.first_name, person.middle_name, person.last_name].filter(Boolean).join(' ');
    setName(fullName || 'Unknown', role === 'professor' ? 'Professor' : 'Student');

    // Info grid
    const items = [];
    if (role === 'student') {
        items.push(['School ID',  person.id_number || '—']);
        items.push(['Status',    (person.status   || '—').toUpperCase()]);
        if (data.schedule) items.push(['Schedule', data.schedule]);
        if (action === 'IN' && data.is_late) items.push(['Late By', data.late_minutes + ' min']);
    } else {
        items.push(['Employee ID', person.employee_id || '—']);
        items.push(['Status',     (person.status     || '—').toUpperCase()]);
        if (data.schedule) items.push(['Subject / Lab', data.schedule]);
        if (data.start)    items.push(['Time', data.start + ' – ' + (data.end || '')]);
    }

    document.getElementById('rinfo').innerHTML = items.map(([l, v]) =>
        `<div class="ii"><div class="il">${l}</div><div class="iv">${v}</div></div>`
    ).join('');

    // Message
    const { mc, ic } = msgCls(action, data);
    setMsg(mc, ic, data.message);

    // Confirm button
    const cb = document.getElementById('btn-confirm');
    cb.disabled = false; cb.style.opacity = '1';

    if (!isErr && data.session_id) {
        const { lbl, bc, ico } = actBtn(action);
        cb.textContent = '';
        const i = document.createElement('i'); i.className = `fa-solid ${ico}`;
        cb.appendChild(i); cb.appendChild(document.createTextNode(' ' + lbl));
        cb.className = `btn-c ${bc}`;
        cb.style.display = 'flex';
    } else {
        cb.style.display = 'none';
    }

    showPanel(panel);
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function restoreConfirmBtn(cb, action) {
    cb.disabled = false; cb.style.opacity = '1';
    const { lbl, bc, ico } = actBtn(action);
    cb.textContent = '';
    const i = document.createElement('i'); i.className = `fa-solid ${ico}`;
    cb.appendChild(i); cb.appendChild(document.createTextNode(' ' + lbl));
    cb.className = `btn-c ${bc}`;
}

function showPanel(el) {
    el.classList.remove('show'); void el.offsetWidth;
    el.style.display = 'block'; el.classList.add('show');
}

function setAv(cls, emoji) {
    const el = document.getElementById('rav');
    el.className = `av ${cls}`; el.textContent = emoji;
}

function setName(name, role) {
    document.getElementById('rname').textContent = name;
    document.getElementById('rrole').textContent = role;
}

function setMsg(cls, icon, txt) {
    const el = document.getElementById('rmsg');
    el.className = `sm ${cls}`;
    el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${txt}</span>`;
}

function msgCls(action, data) {
    if (action === 'IN')      return data.is_late ? { mc:'mw', ic:'fa-clock' }         : { mc:'ms', ic:'fa-check' };
    if (action === 'OUT')     return { mc:'ms', ic:'fa-right-from-bracket' };
    if (action === 'START')   return { mc:'ms', ic:'fa-play' };
    if (action === 'DISMISS') return { mc:'mo', ic:'fa-door-open' };
    if (action === 'END')     return { mc:'mw', ic:'fa-stop' };
    if (action === 'COMPLETED') return { mc:'mi', ic:'fa-check-double' };
    if (['SESSION_NOT_STARTED','CANNOT_TIME_OUT','TOO_EARLY'].includes(action))
        return { mc:'mw', ic:'fa-hourglass-half' };
    return { mc:'me', ic:'fa-circle-xmark' };
}

function actBtn(action) {
    return ({
        IN:      { lbl: 'Record TIME IN',  bc: 'bg',  ico: 'fa-right-to-bracket' },
        OUT:     { lbl: 'Record TIME OUT', bc: 'bg',  ico: 'fa-right-from-bracket' },
        START:   { lbl: 'Start Session',   bc: 'bg',  ico: 'fa-play' },
        DISMISS: { lbl: 'Allow Time Out',  bc: 'bo',  ico: 'fa-door-open' },
        END:     { lbl: 'End Session',     bc: 'br2', ico: 'fa-stop' }
    }[action]) || { lbl: 'Confirm', bc: 'bg', ico: 'fa-check' };
}

function resetForm() {
    document.getElementById('id_input').value = '';
    const p = document.getElementById('result-panel');
    p.style.display = 'none'; p.classList.remove('show');
    payload = null;
    document.getElementById('id_input').focus();
}

// ══════════════════════════════════════════════════════════════
// HELPERS (With Timezone Fixes)
// ══════════════════════════════════════════════════════════════
function getTodayStr() {
    const d = new Date();
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
}

function getDayName() {
    return new Date().toLocaleDateString('en-US', { weekday: 'long' });
}

function tdToSecs(val) {
    if (!val) return 0;
    const parts = String(val).split(':');
    if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    return 0;
}

function secsToDateTime(todayStr, secs) {
    const dt = new Date(todayStr + 'T00:00:00');
    dt.setSeconds(dt.getSeconds() + secs);
    return dt;
}

function fmt12(dt) {
    return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

let toastTimer;
function showToast(msg, type = 's') {
    clearTimeout(toastTimer);
    document.getElementById('toast-msg').textContent  = msg;
    document.getElementById('toast-icon').className   =
        type === 's' ? 'fa-solid fa-check-circle' : 'fa-solid fa-circle-xmark';
    const t = document.getElementById('toast');
    t.className = `show t${type}`;
    toastTimer  = setTimeout(() => { t.className = ''; }, 4500);
}