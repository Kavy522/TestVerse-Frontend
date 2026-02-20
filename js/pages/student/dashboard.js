/**
 * TestVerse — Student Dashboard
 *
 * Auth:     Auth.requireAuth() / Auth.getUser() / Auth.logout()
 * API:      Api.get(endpoint, params) → Response → Api.parse(res) → { data, error }
 * Endpoints from config.js:
 *   EXAMS_AVAILABLE    /api/v1/exams/available/
 *   EXAMS_MY_RESULTS   /api/v1/exams/my-results/
 *   EXAMS_MY_ATTEMPTS  /api/v1/exams/my-attempts/
 *   ANALYTICS          /api/v1/auth/analytics/
 *   LEADERBOARD        /api/v1/auth/leaderboard/
 *   NOTIF_COUNT        /api/v1/auth/notifications/count/
 */
'use strict';

let _liveTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.requireAuth()) return;   // bounces to login if no token
    _initSidebar();
    _populateUser();
    _loadAll();
});

// ── Sidebar + Logout ────────────────────────────────────────────
function _initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle  = document.getElementById('mobileSidebarToggle');
    const overlay = document.getElementById('sidebarOverlay');
    const logout  = document.getElementById('logoutBtn');

    toggle?.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('show');
    });
    overlay?.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
    });
    logout?.addEventListener('click', () => {
        if (confirm('Log out of TestVerse?')) Auth.logout();
    });
}

// ── User info from localStorage (no extra request) ──────────────
function _populateUser() {
    const user = Auth.getUser();
    if (!user) return;

    const name      = user.name || user.username || user.email?.split('@')[0] || 'Student';
    const firstName = name.split(' ')[0];
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff&size=64`;

    _setText('sidebarName', name);
    _setText('topbarName',  name);
    _setText('welcomeName', firstName);

    ['sidebarAvatar', 'topbarAvatar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.src = avatarUrl;
    });
}

// ── Fire all loaders in parallel ────────────────────────────────
function _loadAll() {
    Promise.allSettled([
        _loadAvailableExams(),
        _loadMyResults(),
        _loadUpcoming(),
        _loadPerformance(),
        _loadLeaderboard(),
        _loadLiveAlert(),
        _loadNotifCount(),
    ]);
}

// ══════════════════════════════════════════════════════════════════
//  1. AVAILABLE EXAMS  →  EXAMS_AVAILABLE
// ══════════════════════════════════════════════════════════════════
async function _loadAvailableExams() {
    const el = document.getElementById('availableExamsList');
    if (!el) return;
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.EXAMS_AVAILABLE);
        const { data, error } = await Api.parse(res);

        if (error || !data) { el.innerHTML = _empty('fas fa-file-alt', 'Could not load exams'); return; }

        const exams = Array.isArray(data) ? data : (data.results ?? []);

        if (!exams.length) { el.innerHTML = _empty('fas fa-file-alt', 'No exams available right now'); return; }

        _setText('statAvailable', exams.length);

        const now      = Date.now();
        const upcoming = exams.filter(e => new Date(e.start_time).getTime() > now);
        _setText('statUpcoming', upcoming.length);

        el.innerHTML = `<div class="avail-list">
            ${exams.slice(0, 6).map(e => _availCard(e, now)).join('')}
        </div>`;
    } catch (err) {
        console.error('[dashboard] availableExams:', err);
        el.innerHTML = _empty('fas fa-exclamation-circle', 'Failed to load exams');
    }
}

function _availCard(e, now) {
    const startMs = new Date(e.start_time).getTime();
    const endMs   = new Date(e.end_time).getTime();
    const isLive  = now >= startMs && now <= endMs;
    const isSoon  = !isLive && startMs > now && (startMs - now) < 3_600_000;
    const notYet  = startMs > now && !isSoon;

    const pillCls  = isLive ? 'live' : isSoon ? 'soon' : 'open';
    const pillText = isLive ? '<i class="fas fa-circle"></i> Live'
                   : notYet ? `<i class="fas fa-clock"></i> in ${_rel(startMs)}`
                   : isSoon ? `<i class="fas fa-clock"></i> Soon`
                   :          `<i class="fas fa-door-open"></i> Open`;

    return `
    <a href="exam-taking.html?id=${e.id}" class="avail-card">
        <div class="ac-left">
            <div class="ac-name">${_esc(e.title)}</div>
            <div class="ac-meta">
                ${e.total_questions != null ? `<span><i class="fas fa-question-circle"></i>${e.total_questions} Qs</span>` : ''}
                ${e.duration        != null ? `<span><i class="fas fa-clock"></i>${e.duration} min</span>` : ''}
                ${e.total_marks     != null ? `<span><i class="fas fa-star"></i>${e.total_marks} marks</span>` : ''}
                ${e.exam_type             ? `<span><i class="fas fa-tag"></i>${_esc(e.exam_type)}</span>` : ''}
            </div>
        </div>
        <div class="ac-right">
            <span class="ac-pill ${pillCls}">${pillText}</span>
            <span class="ac-start ${isLive ? 'live' : ''}">
                <i class="fas ${isLive ? 'fa-play' : 'fa-arrow-right'}"></i>
                ${isLive ? 'Start' : 'Go'}
            </span>
        </div>
    </a>`;
}

// ══════════════════════════════════════════════════════════════════
//  2. MY RESULTS  →  EXAMS_MY_RESULTS
// ══════════════════════════════════════════════════════════════════
async function _loadMyResults() {
    const el = document.getElementById('recentResultsList');
    if (!el) return;
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.EXAMS_MY_RESULTS);
        const { data, error } = await Api.parse(res);

        if (error || !data) { el.innerHTML = _empty('fas fa-chart-bar', 'No results yet'); return; }

        const results = Array.isArray(data) ? data : (data.results ?? []);

        if (!results.length) { el.innerHTML = _empty('fas fa-chart-bar', 'No results yet — attempt an exam!'); return; }

        // Derive stats
        const submitted = results.filter(r => r.obtained_marks != null || r.obtained_score != null);
        _setText('statCompleted', submitted.length);

        const scores = submitted.map(r => {
            const t = r.total_marks || r.total_score || 100;
            const o = r.obtained_marks ?? r.obtained_score ?? r.score ?? 0;
            return t > 0 ? (o / t) * 100 : 0;
        });
        if (scores.length) {
            _setText('statAvgScore',  Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) + '%');
            _setText('statBestScore', Math.round(Math.max(...scores)) + '%');
        }

        el.innerHTML = `<div class="results-inner">
            ${results.slice(0, 5).map(r => {
                const t    = r.total_marks || r.total_score || 100;
                const o    = r.obtained_marks ?? r.obtained_score ?? r.score ?? 0;
                const pct  = t > 0 ? Math.round((o / t) * 100) : 0;
                const pm   = r.passing_marks || r.passing_score || (t * 0.5);
                const pass = o >= pm;
                const date = r.submitted_at || r.created_at;
                return `
                <div class="result-row">
                    <div class="rr-left">
                        <div class="rr-exam">${_esc(r.exam_title || r.exam?.title || 'Exam')}</div>
                        <div class="rr-date">${date ? _fmtDate(date) : '—'}</div>
                    </div>
                    <div class="rr-right">
                        <div class="rr-score">${pct}%</div>
                        <span class="rr-badge ${pass?'pass':'fail'}">${pass?'Pass':'Fail'}</span>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    } catch (err) {
        console.error('[dashboard] myResults:', err);
        el.innerHTML = _empty('fas fa-chart-bar', 'Failed to load results');
    }
}

// ══════════════════════════════════════════════════════════════════
//  3. UPCOMING  (re-uses EXAMS_AVAILABLE, filter start_time > now)
// ══════════════════════════════════════════════════════════════════
async function _loadUpcoming() {
    const el = document.getElementById('upcomingExamsList');
    if (!el) return;
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.EXAMS_AVAILABLE);
        const { data, error } = await Api.parse(res);

        const now    = Date.now();
        const all    = Array.isArray(data) ? data : (data?.results ?? []);
        const upcoming = all
            .filter(e => new Date(e.start_time).getTime() > now)
            .sort((a,b) => new Date(a.start_time) - new Date(b.start_time))
            .slice(0, 5);

        if (error || !upcoming.length) { el.innerHTML = _empty('fas fa-calendar-alt', 'No upcoming exams'); return; }

        el.innerHTML = `<div class="upcoming-inner">
            ${upcoming.map(e => {
                const startMs = new Date(e.start_time).getTime();
                return `
                <div class="upcoming-row">
                    <div class="up-icon"><i class="fas fa-file-alt"></i></div>
                    <div class="up-body">
                        <div class="up-name">${_esc(e.title)}</div>
                        <div class="up-when"><i class="fas fa-calendar"></i>${_fmtDate(e.start_time)}</div>
                    </div>
                    <span class="up-eta">in ${_dur(startMs - now)}</span>
                </div>`;
            }).join('')}
        </div>`;
    } catch (err) {
        console.error('[dashboard] upcoming:', err);
        el.innerHTML = _empty('fas fa-calendar-alt', 'Failed to load');
    }
}

// ══════════════════════════════════════════════════════════════════
//  4. PERFORMANCE  →  ANALYTICS  (fallback: EXAMS_MY_RESULTS)
// ══════════════════════════════════════════════════════════════════
async function _loadPerformance() {
    const el = document.getElementById('performancePanel');
    if (!el) return;
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.ANALYTICS);
        const { data, error } = await Api.parse(res);

        if (error || !data) { await _perfFallback(el); return; }

        const pass     = data.passed_exams  ?? data.pass_count  ?? 0;
        const fail     = data.failed_exams  ?? data.fail_count  ?? 0;
        const total    = data.total_exams   ?? data.total       ?? (pass + fail);
        const avg      = data.average_score ?? data.avg_score   ?? 0;
        const passRate = total > 0 ? Math.round((pass / total) * 100) : 0;
        const subjects = data.by_subject || data.category_breakdown || [];

        el.innerHTML = _perfHTML(pass, fail, total, passRate, avg, subjects);
    } catch {
        await _perfFallback(el);
    }
}

async function _perfFallback(el) {
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.EXAMS_MY_RESULTS);
        const { data } = await Api.parse(res);
        const results  = Array.isArray(data) ? data : (data?.results ?? []);
        const sub      = results.filter(r => r.obtained_marks != null || r.obtained_score != null);
        const pass     = sub.filter(r => {
            const t = r.total_marks || r.total_score || 100;
            const o = r.obtained_marks ?? r.obtained_score ?? 0;
            return o >= (r.passing_marks || r.passing_score || t * 0.5);
        }).length;
        const total    = sub.length;
        const passRate = total > 0 ? Math.round((pass/total)*100) : 0;
        el.innerHTML   = _perfHTML(pass, total - pass, total, passRate, 0, []);
    } catch {
        el.innerHTML = _empty('fas fa-chart-pie', 'Complete an exam to see performance');
    }
}

function _perfHTML(pass, fail, total, passRate, avg, subjects) {
    const c    = 2 * Math.PI * 34;
    const dash = ((passRate / 100) * c).toFixed(1);
    const gap  = (c - dash).toFixed(1);

    const bars = subjects.length > 1 ? `
    <div class="perf-bars">
        ${subjects.slice(0,4).map(s => {
            const name  = _esc(s.subject || s.category || s.name || 'General');
            const score = Math.round(s.avg_score || s.average_score || s.score || 0);
            return `<div class="pb-row">
                <div class="pb-label"><span>${name}</span><span>${score}%</span></div>
                <div class="pb-track"><div class="pb-fill" style="width:${score}%"></div></div>
            </div>`;
        }).join('')}
    </div>` : '';

    return `<div class="perf-panel">
        <div class="perf-donut-wrap">
            <div class="perf-donut">
                <svg viewBox="0 0 80 80" width="84" height="84">
                    <circle class="perf-donut-track" cx="40" cy="40" r="34"/>
                    <circle class="perf-donut-fill"  cx="40" cy="40" r="34"
                        stroke-dasharray="${dash} ${gap}" stroke-dashoffset="0"/>
                </svg>
                <div class="perf-donut-center">${passRate}%</div>
            </div>
            <div class="perf-stats">
                <div class="perf-row"><span class="pd pass"></span><strong>${pass}</strong>&nbsp;Passed</div>
                <div class="perf-row"><span class="pd fail"></span><strong>${fail}</strong>&nbsp;Failed</div>
                <div class="perf-row"><span class="pd pend"></span><strong>${total}</strong>&nbsp;Total</div>
                ${avg > 0 ? `<div class="perf-row">Avg: <strong>${Math.round(avg)}%</strong></div>` : ''}
            </div>
        </div>
        ${bars}
    </div>`;
}

// ══════════════════════════════════════════════════════════════════
//  5. LEADERBOARD  →  LEADERBOARD
// ══════════════════════════════════════════════════════════════════
async function _loadLeaderboard() {
    const el = document.getElementById('leaderboardSnippet');
    if (!el) return;
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.LEADERBOARD);
        const { data, error } = await Api.parse(res);

        if (error || !data) { el.innerHTML = _empty('fas fa-trophy', 'Leaderboard not available'); return; }

        const entries = Array.isArray(data) ? data : (data.results ?? []);
        if (!entries.length) { el.innerHTML = _empty('fas fa-trophy', 'No data yet'); return; }

        const me      = Auth.getUser();
        const rankCls = ['gold','silver','bronze'];

        el.innerHTML = `<div class="lb-list">
            ${entries.slice(0, 5).map((e, i) => {
                const name  = e.name || e.student_name || e.username || e.full_name || 'Student';
                const score = e.average_score != null ? Math.round(e.average_score)+'%' : (e.total_score ?? '—');
                const isMe  = me && (e.student_id===me.id || e.user_id===me.id || e.username===me.username);
                const av    = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=40`;
                return `
                <div class="lb-row ${isMe?'is-me':''}">
                    <span class="lb-rank ${rankCls[i]||''}">${i+1}</span>
                    <img src="${av}" alt="" class="lb-avatar">
                    <span class="lb-name">${_esc(name)}${isMe?' <span class="lb-me">You</span>':''}</span>
                    <span class="lb-score">${score}</span>
                </div>`;
            }).join('')}
        </div>`;
    } catch (err) {
        console.error('[dashboard] leaderboard:', err);
        el.innerHTML = _empty('fas fa-trophy', 'Leaderboard not available');
    }
}

// ══════════════════════════════════════════════════════════════════
//  6. LIVE ALERT  →  EXAMS_MY_ATTEMPTS
// ══════════════════════════════════════════════════════════════════
async function _loadLiveAlert() {
    const alertEl = document.getElementById('liveExamAlert');
    const nameEl  = document.getElementById('liveExamName');
    const timerEl = document.getElementById('liveExamTimer');
    const btnEl   = document.getElementById('liveExamResumeBtn');
    if (!alertEl) return;
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.EXAMS_MY_ATTEMPTS);
        const { data } = await Api.parse(res);
        const attempts = Array.isArray(data) ? data : (data?.results ?? []);
        const active   = attempts.find(a => a.status === 'in_progress' || a.is_active === true);

        if (!active) { alertEl.classList.add('hidden'); return; }

        const examTitle = active.exam_title || active.exam?.title || 'Exam';
        const endTime   = new Date(active.end_time || active.exam_end_time || active.exam?.end_time).getTime();

        if (nameEl) nameEl.textContent = examTitle;
        if (btnEl)  btnEl.href = `exam-taking.html?attempt_id=${active.id}`;
        alertEl.classList.remove('hidden');

        clearInterval(_liveTimer);
        const tick = () => {
            const diff = Math.max(0, endTime - Date.now());
            if (timerEl) timerEl.textContent = _fmtMs(diff);
            if (diff <= 0) { clearInterval(_liveTimer); if(timerEl) timerEl.textContent = 'Time up!'; }
        };
        tick();
        _liveTimer = setInterval(tick, 1000);
    } catch {
        alertEl?.classList.add('hidden');
    }
}

// ══════════════════════════════════════════════════════════════════
//  7. NOTIF COUNT  →  NOTIF_COUNT
// ══════════════════════════════════════════════════════════════════
async function _loadNotifCount() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.NOTIF_COUNT);
        const { data } = await Api.parse(res);
        const count = typeof data === 'number' ? data : (data?.unread_count ?? data?.count ?? 0);
        badge.textContent = count;
        badge.classList.toggle('hidden', count === 0);
    } catch { /* non-critical */ }
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════
function _setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = String(val ?? ''); }
function _fmtMs(ms) {
    const s=Math.floor(ms/1000), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60, p=n=>String(n).padStart(2,'0');
    return h>0 ? `${p(h)}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}
function _dur(ms) {
    const min=Math.floor(ms/60_000), hr=Math.floor(min/60), day=Math.floor(hr/24);
    if(day>0) return `${day}d ${hr%24}h`; if(hr>0) return `${hr}h ${min%60}m`; return `${min}m`;
}
function _rel(ts) { const d=ts-Date.now(); return d<=0?'now':_dur(d); }
function _fmtDate(iso) { if(!iso) return '—'; return new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); }
function _empty(icon,msg) { return `<div class="empty-state"><i class="${_esc(icon)}"></i><p>${_esc(msg)}</p></div>`; }
function _esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
