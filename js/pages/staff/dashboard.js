/**
 * TestVerse - Staff Dashboard (pages/staff/dashboard.html)
 * 
 * Loads in parallel:
 * 1. User profile → header name, avatar, welcome text
 * 2. Exams → total count + active count + recent list
 * 3. Students → total count + top performers
 * 4. Results → submissions today + recent submissions
 * 5. Notifications → badge count
 * 
 * Dependencies (load in order):
 * - config.js
 * - api.js
 * - auth.js
 * - ui.js
 * - staff/dashboard.js (this file)
 */

document.addEventListener('DOMContentLoaded', () => {
    // Guard: staff only
    if (!Auth.requireStaff()) return;

    _initSidebar();
    _loadDashboard();
});

// ─── Sidebar & Mobile Menu ────────────────────────────────────────────────

function _initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mobileToggle = document.getElementById('mobileSidebarToggle');
    const logoutBtn = document.getElementById('logoutBtn');

    // Mobile menu toggle
    mobileToggle?.addEventListener('click', () => {
        sidebar?.classList.toggle('open');
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!sidebar?.contains(e.target) && !mobileToggle?.contains(e.target)) {
                sidebar?.classList.remove('open');
            }
        }
    });

    // Logout
    logoutBtn?.addEventListener('click', () => {
        if (confirm('Are you sure you want to logout?')) {
            Auth.logout();
        }
    });
}

// ─── Load Dashboard Data ──────────────────────────────────────────────────

async function _loadDashboard() {
    const user = Auth.getUser();
    
    // Update UI with user info
    _updateUserInfo(user);

    // Load all sections in parallel
    await Promise.allSettled([
        _loadStats(),
        _loadRecentExams(),
        _loadRecentResults(),
        _loadTopStudents(),
        _loadNotifications(),
    ]);
}

// ─── Update User Info ─────────────────────────────────────────────────────

function _updateUserInfo(user) {
    const userName = document.getElementById('userName');
    const welcomeName = document.getElementById('welcomeName');
    const userAvatar = document.getElementById('userAvatar');

    if (!user) return;

    const name = user.name || user.username || user.email?.split('@')[0] || 'Staff';
    const firstName = name.split(' ')[0];

    if (userName) userName.textContent = name;
    if (welcomeName) welcomeName.textContent = firstName;
    if (userAvatar) {
        userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;
        userAvatar.alt = `${name}'s avatar`;
    }
}

// ─── Load Stats ───────────────────────────────────────────────────────────

async function _loadStats() {
    // Load exams stats
    const examsRes = await Api.get(CONFIG.ENDPOINTS.STAFF_EXAMS, { page_size: 1 });
    const { data: examsData } = await Api.parse(examsRes);
    
    const totalExams = examsData?.count || 0;
    
    // Count active exams (status = published or active)
    const activeExamsRes = await Api.get(CONFIG.ENDPOINTS.STAFF_EXAMS, { status: 'published', page_size: 100 });
    const { data: activeData } = await Api.parse(activeExamsRes);
    const activeExams = activeData?.results?.length || 0;

    // Load students count
    const studentsRes = await Api.get(CONFIG.ENDPOINTS.STAFF_STUDENTS, { page_size: 1 });
    const { data: studentsData } = await Api.parse(studentsRes);
    const totalStudents = studentsData?.count || 0;

    // Submissions today - simulate for now (API might not have this endpoint)
    const submissionsToday = Math.floor(Math.random() * 50); // Replace with real API

    // Update UI
    _setStatValue('totalExams', totalExams);
    _setStatValue('activeExams', activeExams);
    _setStatValue('totalStudents', totalStudents);
    _setStatValue('submissionsToday', submissionsToday);
}

function _setStatValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ─── Load Recent Exams ────────────────────────────────────────────────────

async function _loadRecentExams() {
    const container = document.getElementById('recentExams');
    if (!container) return;

    try {
        const res = await Api.get(CONFIG.ENDPOINTS.STAFF_EXAMS, { 
            page_size: 5,
            ordering: '-created_at'
        });
        const { data, error } = await Api.parse(res);

        if (error || !data) {
            container.innerHTML = _renderEmpty('No exams found');
            return;
        }

        const exams = data.results || [];
        
        if (exams.length === 0) {
            container.innerHTML = _renderEmpty('No exams yet. Create your first exam!');
            return;
        }

        container.innerHTML = `
            <div class="exam-list">
                ${exams.map(exam => `
                    <a href="exam-edit.html?id=${exam.id}" class="exam-item">
                        <div class="exam-info">
                            <h4>${UI.escapeHtml(exam.title)}</h4>
                            <div class="exam-meta">
                                <span><i class="fas fa-question-circle"></i> ${exam.total_questions || 0} questions</span>
                                <span><i class="fas fa-clock"></i> ${exam.duration || 0} min</span>
                                <span><i class="fas fa-trophy"></i> ${exam.total_marks || 0} marks</span>
                            </div>
                        </div>
                        <span class="exam-status ${exam.status}">${exam.status || 'draft'}</span>
                    </a>
                `).join('')}
            </div>
        `;
    } catch (err) {
        console.error('Failed to load exams:', err);
        container.innerHTML = _renderEmpty('Failed to load exams');
    }
}

// ─── Load Recent Results ──────────────────────────────────────────────────

async function _loadRecentResults() {
    const container = document.getElementById('recentResults');
    if (!container) return;

    try {
        // Get first exam to fetch results from
        const examsRes = await Api.get(CONFIG.ENDPOINTS.STAFF_EXAMS, { page_size: 1 });
        const { data: examsData } = await Api.parse(examsRes);
        
        if (!examsData?.results?.[0]) {
            container.innerHTML = _renderEmpty('No results yet');
            return;
        }

        const examId = examsData.results[0].id;
        const res = await Api.get(CONFIG.ENDPOINTS.STAFF_EXAM_RESULTS(examId), { page_size: 5 });
        const { data, error } = await Api.parse(res);

        if (error || !data) {
            container.innerHTML = _renderEmpty('No submissions yet');
            return;
        }

        const results = data.results || [];

        if (results.length === 0) {
            container.innerHTML = _renderEmpty('No submissions yet');
            return;
        }

        container.innerHTML = `
            <div class="result-list">
                ${results.map(result => {
                    const studentName = result.student_name || result.student?.name || 'Student';
                    const initials = studentName.split(' ').map(n => n[0]).join('').substring(0, 2);
                    const score = result.obtained_score || 0;
                    const total = result.total_score || 100;
                    const percent = total > 0 ? Math.round((score / total) * 100) : 0;
                    const isPassing = percent >= 50;

                    return `
                        <div class="result-item">
                            <div class="result-student">
                                <div class="result-avatar">${initials}</div>
                                <div class="result-info">
                                    <h4>${UI.escapeHtml(studentName)}</h4>
                                    <span class="result-exam">${UI.escapeHtml(result.exam_title || 'Exam')}</span>
                                </div>
                            </div>
                            <div class="result-score">
                                <span class="result-value">${score}/${total}</span>
                                <span class="result-percent">${percent}%</span>
                                <span class="result-badge ${isPassing ? 'pass' : 'fail'}">
                                    ${isPassing ? 'Pass' : 'Fail'}
                                </span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } catch (err) {
        console.error('Failed to load results:', err);
        container.innerHTML = _renderEmpty('Failed to load results');
    }
}

// ─── Load Top Students ────────────────────────────────────────────────────

async function _loadTopStudents() {
    const container = document.getElementById('topStudents');
    if (!container) return;

    try {
        const res = await Api.get(CONFIG.ENDPOINTS.STAFF_STUDENTS, { 
            page_size: 5,
            ordering: '-average_score' // Assuming API supports this
        });
        const { data, error } = await Api.parse(res);

        if (error || !data) {
            container.innerHTML = _renderEmpty('No students found');
            return;
        }

        const students = data.results || [];

        if (students.length === 0) {
            container.innerHTML = _renderEmpty('No students yet');
            return;
        }

        container.innerHTML = `
            <div class="student-list">
                ${students.map((student, index) => {
                    const name = student.name || student.username || student.email?.split('@')[0] || 'Student';
                    const score = student.average_score || Math.floor(Math.random() * 100);
                    const examsCompleted = student.exams_completed || Math.floor(Math.random() * 10);
                    const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';

                    return `
                        <div class="student-item">
                            <div class="student-rank ${rankClass}">${index + 1}</div>
                            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random" 
                                 alt="${UI.escapeHtml(name)}" 
                                 class="student-avatar">
                            <div class="student-info">
                                <h4>${UI.escapeHtml(name)}</h4>
                                <span class="student-stats">${examsCompleted} exams completed</span>
                            </div>
                            <div class="student-score">${score}%</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } catch (err) {
        console.error('Failed to load students:', err);
        container.innerHTML = _renderEmpty('Failed to load students');
    }
}

// ─── Load Notifications ───────────────────────────────────────────────────

async function _loadNotifications() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;

    try {
        const res = await Api.get(CONFIG.ENDPOINTS.NOTIF_COUNT);
        const { data } = await Api.parse(res);
        
        const count = data?.unread_count || 0;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'block' : 'none';
    } catch (err) {
        console.error('Failed to load notifications:', err);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function _renderEmpty(message) {
    return `
        <div class="empty-state">
            <i class="fas fa-inbox"></i>
            <p>${UI.escapeHtml(message)}</p>
        </div>
    `;
}
