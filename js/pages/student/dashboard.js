/**
 * TestVerse - Student Dashboard (pages/student/dashboard.html)
 *
 * Loads in parallel:
 *   1. User profile   → header name, avatar, welcome text
 *   2. Available exams → stat card + exam cards list + upcoming list
 *   3. My results     → completed count + recent results + average score
 *   4. Notifications  → badge count
 *
 * NOTE: /api/v1/auth/analytics/ returns HTTP 500 (server bug) so it is
 * intentionally skipped. Average score is calculated locally from results.
 *
 * Load order (before </body>):
 *   <script src="../../js/config.js"></script>
 *   <script src="../../js/api.js"></script>
 *   <script src="../../js/auth.js"></script>
 *   <script src="../../js/ui.js"></script>
 *   <script src="../../js/pages/student/dashboard.js"></script>
 */

document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireAuth()) return;

  _initHeader();
  _initDropdown();
  _initLogout();
  _loadDashboard();
});

// ─── Parallel Data Load ───────────────────────────────────────────────────────

async function _loadDashboard() {
  // All 4 requests fire at the same time — one slow/failing endpoint
  // does NOT block the others
  const [profileResult, examsResult, resultsResult, notifResult] =
    await Promise.allSettled([
      _fetchProfile(),
      _fetchAvailableExams(),
      _fetchMyResults(),
      _fetchNotifCount(),
    ]);

  if (profileResult.status === 'fulfilled') _renderProfile(profileResult.value);
  if (examsResult.status   === 'fulfilled') _renderExams(examsResult.value);
  if (examsResult.status   === 'fulfilled') _renderUpcoming(examsResult.value);

  if (resultsResult.status === 'fulfilled') {
    _renderResults(resultsResult.value);
    // Calculate average score locally — avoids the broken analytics endpoint
    _renderAverageScore(resultsResult.value);
  }

  if (notifResult.status === 'fulfilled') _renderNotifCount(notifResult.value);
}

// ─── API Fetches ──────────────────────────────────────────────────────────────

async function _fetchProfile() {
  try {
    const res = await Api.get(CONFIG.ENDPOINTS.PROFILE);
    const { data, error } = await Api.parse(res);
    if (data && !error) {
      Auth.saveUser(data); // keep cache fresh
      return data;
    }
  } catch { /* fall through to cache */ }
  return Auth.getUser();
}

async function _fetchAvailableExams() {
  const res = await Api.get(CONFIG.ENDPOINTS.EXAMS_AVAILABLE, { page_size: 20 });
  const { data, error } = await Api.parse(res);
  if (error) throw new Error('Failed to load exams');
  return data?.results ?? data ?? [];
}

async function _fetchMyResults() {
  const res = await Api.get(CONFIG.ENDPOINTS.EXAMS_MY_RESULTS, { page_size: 50 });
  const { data, error } = await Api.parse(res);
  if (error) throw new Error('Failed to load results');
  return data?.results ?? data ?? [];
}

async function _fetchNotifCount() {
  const res = await Api.get(CONFIG.ENDPOINTS.NOTIF_COUNT);
  const { data, error } = await Api.parse(res);
  if (error) return null;
  return data;
}

// ─── Renderers ────────────────────────────────────────────────────────────────

/** 1. Profile → welcome name, header name, avatar initials */
function _renderProfile(profile) {
  if (!profile) return;

  const displayName = profile.name || profile.username || 'Student';
  const firstName   = displayName.split(' ')[0];

  const welcomeEl = document.getElementById('welcomeName');
  if (welcomeEl) welcomeEl.textContent = firstName;

  const nameEl = document.getElementById('userName');
  if (nameEl) nameEl.textContent = displayName;

  const avatarEl = document.getElementById('userAvatar');
  if (avatarEl) avatarEl.textContent = _getInitials(displayName);
}

/** 2a. Available exams → stat card count + exam card list */
function _renderExams(exams) {
  const list        = Array.isArray(exams) ? exams : [];
  const activeExams = list.filter(e => e.status === 'active');

  _setStatValue('availableExamsCount', activeExams.length);

  const container = document.getElementById('availableExamsList');
  if (!container) return;

  const toShow = activeExams.slice(0, 3);

  if (toShow.length === 0) {
    container.innerHTML = _emptyStateHTML('📋', 'No exams available', 'Check back later for new exams.');
    return;
  }

  container.innerHTML = toShow.map(_examCardHTML).join('');
}

/** 2b. Upcoming exams → stat card count + upcoming list */
function _renderUpcoming(exams) {
  const list = Array.isArray(exams) ? exams : [];
  const now  = Date.now();

  const upcoming = list
    .filter(e => new Date(e.start_time).getTime() > now)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    .slice(0, 3);

  _setStatValue('upcomingExamsCount', upcoming.length);

  const container = document.getElementById('upcomingExamsList');
  if (!container) return;

  if (upcoming.length === 0) {
    container.innerHTML = _emptyStateHTML('📅', 'No upcoming exams', 'All clear for now!');
    return;
  }

  container.innerHTML = upcoming.map(_upcomingItemHTML).join('');
}

/** 3a. Results → completed count + recent results list */
function _renderResults(results) {
  const list = Array.isArray(results) ? results : [];

  // Completed = how many exams the student has submitted (one result per exam)
  _setStatValue('completedExamsCount', list.length);

  const container = document.getElementById('recentResultsList');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = _emptyStateHTML('📊', 'No results yet', 'Complete an exam to see your results here.');
    return;
  }

  container.innerHTML = list.slice(0, 4).map(_resultItemHTML).join('');

  container.querySelectorAll('.result-item[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      window.location.href = `results.html?id=${el.dataset.id}`;
    });
  });
}

/**
 * 3b. Average score — calculated locally from results array.
 * Skips the /analytics/ endpoint which returns HTTP 500 (server-side bug).
 * Uses result.percentage (string decimal e.g. "78.50") from ResultList schema.
 */
function _renderAverageScore(results) {
  const list = Array.isArray(results) ? results : [];

  // Only include graded results (status !== 'pending')
  const graded = list.filter(r => r.percentage != null && r.status !== 'pending');

  if (graded.length === 0) {
    _setStatValue('averageScore', '—');
    return;
  }

  const total = graded.reduce((sum, r) => sum + parseFloat(r.percentage || 0), 0);
  const avg   = (total / graded.length).toFixed(1);

  _setStatValue('averageScore', `${avg}%`);
}

/** 4. Notification badge */
function _renderNotifCount(data) {
  const badge = document.getElementById('notificationBadge');
  if (!badge) return;

  const count = typeof data === 'number'
    ? data
    : data?.count ?? data?.unread_count ?? 0;

  badge.textContent   = count > 99 ? '99+' : count > 0 ? count : '';
  badge.style.display = count > 0 ? '' : 'none';
}

// ─── HTML Builders ────────────────────────────────────────────────────────────

function _examCardHTML(exam) {
  const status   = _examStatusLabel(exam.status);
  const duration = UI.formatDuration(exam.duration);
  const endDate  = UI.formatDateTime(exam.end_time);
  const isActive = exam.status === 'active';

  return `
    <div class="exam-card" onclick="window.location.href='exam-detail.html?id=${exam.id}'">
      <div class="exam-card-header">
        <div>
          <div class="exam-card-title">${_esc(exam.title)}</div>
          <div class="exam-card-meta">
            <span class="exam-card-meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              ${duration}
            </span>
            <span class="exam-card-meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              ${_esc(String(exam.total_marks))} marks
            </span>
          </div>
        </div>
        <span class="badge ${status.cls}">${status.text}</span>
      </div>
      <div class="exam-card-footer">
        <span class="exam-card-time">Ends: ${endDate}</span>
        ${isActive
          ? `<button class="btn btn-primary btn-sm"
               onclick="event.stopPropagation(); window.location.href='take-exam.html?id=${exam.id}'">
               Start Exam
             </button>`
          : `<button class="btn btn-outline btn-sm"
               onclick="event.stopPropagation(); window.location.href='exam-detail.html?id=${exam.id}'">
               View Details
             </button>`
        }
      </div>
    </div>`;
}

function _upcomingItemHTML(exam) {
  const d     = new Date(exam.start_time);
  const day   = d.getDate();
  const month = d.toLocaleString('default', { month: 'short' }).toUpperCase();
  const time  = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return `
    <div class="upcoming-item">
      <div class="upcoming-date">
        <span class="upcoming-day">${day}</span>
        <span class="upcoming-month">${month}</span>
      </div>
      <div class="upcoming-info">
        <div class="upcoming-title">${_esc(exam.title)}</div>
        <div class="upcoming-time">${time} · ${UI.formatDuration(exam.duration)}</div>
      </div>
    </div>`;
}

function _resultItemHTML(result) {
  const pct    = result.percentage != null ? `${parseFloat(result.percentage).toFixed(1)}%` : '—';
  const status = result.status || 'pending';
  const date   = UI.formatDate(result.submitted_at);

  return `
    <div class="result-item" data-id="${_esc(result.id)}" style="cursor:pointer">
      <div class="result-info">
        <div class="result-title">${_esc(result.exam_title || 'Exam')}</div>
        <div class="result-date">${date}</div>
      </div>
      <div class="result-score">
        <span class="result-percentage">${pct}</span>
        <span class="result-status ${status}">${_capitalize(status)}</span>
      </div>
    </div>`;
}

function _emptyStateHTML(icon, title, text) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-title">${title}</div>
      <div class="empty-state-text">${text}</div>
    </div>`;
}

// ─── Header / Dropdown / Logout ───────────────────────────────────────────────

function _initHeader() {
  // Show cached user immediately — no flicker while API loads
  const user = Auth.getUser();
  if (user) _renderProfile(user);
}

function _initDropdown() {
  const btn      = document.getElementById('userBtn');
  const dropdown = document.getElementById('userDropdown');
  if (!btn || !dropdown) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.classList.toggle('active');
  });

  document.addEventListener('click', () => dropdown.classList.remove('active'));
}

function _initLogout() {
  document.getElementById('logoutBtn')?.addEventListener('click', () => Auth.logout());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _setStatValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<span>${value}</span>`;
}

function _getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function _examStatusLabel(status) {
  const map = {
    active:   { text: 'Live',     cls: 'badge-live'     },
    upcoming: { text: 'Upcoming', cls: 'badge-upcoming'  },
    ended:    { text: 'Ended',    cls: 'badge-ended'     },
    draft:    { text: 'Draft',    cls: 'badge-draft'     },
  };
  return map[status] ?? { text: status || 'Unknown', cls: '' };
}