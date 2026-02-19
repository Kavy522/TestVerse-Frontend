/**
 * TestVerse — Staff Exams Page
 * Full CRUD + publish/unpublish based on API spec
 */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────
let _page        = 1;
let _totalPages  = 1;
let _totalCount  = 0;
let _allExams    = [];   // current page exams
let _search      = '';
let _statusFilter = '';
let _typeFilter  = '';
let _sort        = '-created_at';
let _editExamId  = null;
let _deleteExamId = null;
let _publishExamId = null;
let _publishAction = 'publish'; // 'publish' | 'unpublish'

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.requireStaff()) return;
    _initSidebar();
    _initFilters();
    _initEditModal();
    _initDeleteModal();
    _initPublishModal();
    _loadExams();
});

// ── Sidebar ───────────────────────────────────────────────────────────────
function _initSidebar() {
    document.getElementById('mobileSidebarToggle')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('open');
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to logout?')) Auth.logout();
    });

    const user = Auth.getUser();
    if (user) {
        const name = user.name || user.username || user.email?.split('@')[0] || 'Staff';
        const el = document.getElementById('userName');
        const av = document.getElementById('userAvatar');
        if (el) el.textContent = name;
        if (av) av.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;
    }
}

// ── Filters ───────────────────────────────────────────────────────────────
function _initFilters() {
    let _searchTimer;

    document.getElementById('searchInput')?.addEventListener('input', e => {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => {
            _search = e.target.value.trim();
            _page = 1;
            _loadExams();
        }, 450);
    });

    document.getElementById('statusFilter')?.addEventListener('change', e => {
        _statusFilter = e.target.value;
        _page = 1;
        _loadExams();
    });

    document.getElementById('examTypeFilter')?.addEventListener('change', e => {
        _typeFilter = e.target.value;
        _page = 1;
        _loadExams();
    });

    document.getElementById('sortFilter')?.addEventListener('change', e => {
        _sort = e.target.value;
        _page = 1;
        _loadExams();
    });

    document.getElementById('prevBtn')?.addEventListener('click', () => {
        if (_page > 1) { _page--; _loadExams(); }
    });

    document.getElementById('nextBtn')?.addEventListener('click', () => {
        if (_page < _totalPages) { _page++; _loadExams(); }
    });
}

// ── Load Exams from API ───────────────────────────────────────────────────
async function _loadExams() {
    _showLoading();

    try {
        const params = new URLSearchParams({ page: _page, page_size: 12 });
        if (_search)       params.set('search',    _search);
        if (_statusFilter) params.set('status',    _statusFilter);
        if (_typeFilter)   params.set('exam_type', _typeFilter);
        if (_sort)         params.set('ordering',  _sort);

        const res = await Api.get(`${CONFIG.ENDPOINTS.STAFF_EXAMS}?${params}`);
        const { data, error } = await Api.parse(res);

        if (error) {
            UI.showAlert('alertContainer', 'Failed to load exams. Please try again.', 'error');
            _showEmpty('Error loading exams', 'Please try again or contact support.', false);
            return;
        }

        let exams = [];
        if (data && data.results) {
            exams = data.results;
            _totalCount = data.count || 0;
            _totalPages = Math.ceil(_totalCount / 12) || 1;
        } else if (Array.isArray(data)) {
            exams = data;
            _totalCount = exams.length;
            _totalPages = 1;
        }

        _allExams = exams;
        _updateSummaryStats(exams);

        if (exams.length === 0) {
            _showEmpty(
                (_search || _statusFilter || _typeFilter) ? 'No exams found' : 'No Exams Yet',
                (_search || _statusFilter || _typeFilter) ? 'Try adjusting your filters or search.' : 'Create your first exam to get started.',
                !(_search || _statusFilter || _typeFilter)
            );
        } else {
            _renderExams(exams);
            _updatePagination();
        }

    } catch (err) {
        console.error('Load exams error:', err);
        UI.showAlert('alertContainer', 'Network error. Check your connection.', 'error');
        _showEmpty('Network error', 'Check your connection and try again.', false);
    }
}

// ── Update Summary Stats ──────────────────────────────────────────────────
function _updateSummaryStats(exams) {
    const now = new Date();
    let draft = 0, published = 0, active = 0, completed = 0;

    exams.forEach(e => {
        const status = _getExamStatus(e, now);
        if (status === 'draft')     draft++;
        else if (status === 'published') published++;
        else if (status === 'active')    active++;
        else if (status === 'completed') completed++;
    });

    document.getElementById('statTotal').textContent     = exams.length;
    document.getElementById('statDraft').textContent     = draft;
    document.getElementById('statPublished').textContent = published;
    document.getElementById('statActive').textContent    = active;
    document.getElementById('statCompleted').textContent = completed;
}

// ── Derive Status ─────────────────────────────────────────────────────────
function _getExamStatus(exam, now = new Date()) {
    if (!exam.is_published) return 'draft';
    const start = new Date(exam.start_time);
    const end   = new Date(exam.end_time);
    if (now < start)  return 'published';
    if (now <= end)   return 'active';
    return 'completed';
}

// ── Render Exams ──────────────────────────────────────────────────────────
function _renderExams(exams) {
    const grid = document.getElementById('examsGrid');
    if (!grid) return;

    grid.innerHTML = exams.map(exam => _buildCard(exam)).join('');
    grid.style.display = 'grid';

    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('emptyState').style.display   = 'none';
    document.getElementById('pagination').style.display   = 'flex';
}

function _buildCard(exam) {
    const now    = new Date();
    const status = _getExamStatus(exam, now);

    const statusLabels = {
        draft:     { text: 'Draft',     icon: 'fa-pencil-alt' },
        published: { text: 'Published', icon: 'fa-check-circle' },
        active:    { text: 'Live',      icon: 'fa-play-circle' },
        completed: { text: 'Completed', icon: 'fa-flag-checkered' }
    };

    const { text: statusText, icon: statusIcon } = statusLabels[status] || statusLabels.draft;

    const startDate = exam.start_time
        ? new Date(exam.start_time).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
        : 'Not scheduled';

    const endDate = exam.end_time
        ? new Date(exam.end_time).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
        : '—';

    const qCount = exam.question_count || 0;
    const examType = (exam.exam_type || 'general').charAt(0).toUpperCase() + (exam.exam_type || 'general').slice(1);

    // Publish / Unpublish button
    const publishBtn = exam.is_published
        ? `<button class="exam-action-btn unpublish" onclick="window.openPublishModal('${exam.id}','unpublish','${UI.escapeHtml(exam.title)}')">
               <i class="fas fa-eye-slash"></i> Unpublish
           </button>`
        : `<button class="exam-action-btn publish" onclick="window.openPublishModal('${exam.id}','publish','${UI.escapeHtml(exam.title)}')">
               <i class="fas fa-check-circle"></i> Publish
           </button>`;

    // Live monitor only when active
    const liveBtn = status === 'active'
        ? `<a href="live-monitor.html?id=${exam.id}" class="exam-action-btn" style="background:rgba(34,197,94,.1);color:#22c55e;border-color:rgba(34,197,94,.2);">
               <i class="fas fa-broadcast-tower"></i> Live
           </a>`
        : '';

    return `
        <div class="exam-card status-${status}" data-id="${exam.id}">
            <div class="exam-card-top">
                <h3 class="exam-card-title">${UI.escapeHtml(exam.title)}</h3>
                <span class="exam-status-badge ${status}">
                    <span class="status-dot"></span>
                    ${statusText}
                </span>
            </div>
            <div class="exam-card-body">
                ${exam.description ? `<p class="exam-description">${UI.escapeHtml(exam.description)}</p>` : ''}
                <div class="exam-meta-grid">
                    <div class="exam-meta-item">
                        <i class="fas fa-tag"></i>
                        <span>${examType}</span>
                    </div>
                    <div class="exam-meta-item">
                        <i class="fas fa-question-circle"></i>
                        <span><strong>${qCount}</strong> Questions</span>
                    </div>
                    <div class="exam-meta-item">
                        <i class="fas fa-clock"></i>
                        <span><strong>${exam.duration || 0}</strong> min</span>
                    </div>
                    <div class="exam-meta-item">
                        <i class="fas fa-trophy"></i>
                        <span><strong>${exam.total_marks || 0}</strong> marks</span>
                    </div>
                    <div class="exam-meta-item">
                        <i class="fas fa-crosshairs"></i>
                        <span>Pass: <strong>${exam.passing_marks || 0}</strong></span>
                    </div>
                    <div class="exam-meta-item">
                        <i class="fas fa-users"></i>
                        <span>Attempts: <strong>${exam.total_attempts || 0}</strong></span>
                    </div>
                </div>
                <div class="exam-date-row">
                    <i class="fas fa-calendar-alt"></i>
                    <span>${startDate} → ${endDate}</span>
                </div>
            </div>
            <div class="exam-card-actions">
                <a href="examedit.html?id=${exam.id}" class="exam-action-btn questions">
                    <i class="fas fa-list-ol"></i> Questions
                </a>
                <button class="exam-action-btn edit" onclick="window.openEditModal('${exam.id}')">
                    <i class="fas fa-edit"></i> Edit
                </button>
                ${publishBtn}
                ${liveBtn}
                <button class="exam-action-btn delete" onclick="window.openDeleteModal('${exam.id}','${UI.escapeHtml(exam.title)}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

// ── Show States ───────────────────────────────────────────────────────────
function _showLoading() {
    document.getElementById('loadingState').style.display = 'flex';
    document.getElementById('examsGrid').style.display    = 'none';
    document.getElementById('emptyState').style.display   = 'none';
    document.getElementById('pagination').style.display   = 'none';
}

function _showEmpty(title, subtitle, showCreateBtn = true) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('examsGrid').style.display    = 'none';
    document.getElementById('pagination').style.display   = 'none';

    document.getElementById('emptyTitle').textContent    = title;
    document.getElementById('emptySubtitle').textContent = subtitle;

    const btn = document.getElementById('emptyAction');
    if (btn) btn.style.display = showCreateBtn ? 'inline-flex' : 'none';

    document.getElementById('emptyState').style.display = 'flex';
}

function _updatePagination() {
    document.getElementById('paginationInfo').textContent = `Page ${_page} of ${_totalPages}`;
    document.getElementById('prevBtn').disabled = _page <= 1;
    document.getElementById('nextBtn').disabled = _page >= _totalPages;
    document.getElementById('pagination').style.display = _totalPages > 1 ? 'flex' : 'none';
}

// ── Edit Exam Modal ───────────────────────────────────────────────────────
function _initEditModal() {
    document.getElementById('editModalClose')?.addEventListener('click', _closeEditModal);
    document.getElementById('cancelEditBtn')?.addEventListener('click', _closeEditModal);
    document.getElementById('editExamModal')?.addEventListener('click', e => {
        if (e.target.id === 'editExamModal') _closeEditModal();
    });

    // Auto-calculate duration
    ['editStartTime','editEndTime'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', _calcEditDuration);
    });

    document.getElementById('saveEditBtn')?.addEventListener('click', _saveEdit);
}

function _closeEditModal() {
    document.getElementById('editExamModal').classList.remove('show');
    _editExamId = null;
}

window.openEditModal = (examId) => {
    const exam = _allExams.find(e => e.id === examId);
    if (!exam) return;

    _editExamId = examId;

    // Populate form
    document.getElementById('editTitle').value        = exam.title || '';
    document.getElementById('editDescription').value  = exam.description || '';
    document.getElementById('editExamType').value     = exam.exam_type || 'midterm';
    document.getElementById('editTotalMarks').value   = exam.total_marks || '';
    document.getElementById('editPassingMarks').value = exam.passing_marks || '';
    document.getElementById('editInstructions').value = exam.instructions || '';

    // Format datetimes
    if (exam.start_time) document.getElementById('editStartTime').value = _toDatetimeLocal(exam.start_time);
    if (exam.end_time)   document.getElementById('editEndTime').value   = _toDatetimeLocal(exam.end_time);

    _calcEditDuration();
    document.getElementById('editExamModal').classList.add('show');
};

function _toDatetimeLocal(iso) {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _calcEditDuration() {
    const s = document.getElementById('editStartTime')?.value;
    const e = document.getElementById('editEndTime')?.value;
    const dur = document.getElementById('editDuration');

    if (s && e) {
        const diff = Math.floor((new Date(e) - new Date(s)) / 60000);
        if (dur) dur.value = diff > 0 ? diff : '';
    }
}

async function _saveEdit() {
    if (!_editExamId) return;

    const title        = document.getElementById('editTitle')?.value.trim();
    const description  = document.getElementById('editDescription')?.value.trim();
    const exam_type    = document.getElementById('editExamType')?.value;
    const start_time   = document.getElementById('editStartTime')?.value;
    const end_time     = document.getElementById('editEndTime')?.value;
    const total_marks  = document.getElementById('editTotalMarks')?.value;
    const passing_marks= document.getElementById('editPassingMarks')?.value;
    const instructions = document.getElementById('editInstructions')?.value.trim();

    if (!title || !description || !start_time || !end_time || !total_marks || !passing_marks) {
        UI.showAlert('editAlertContainer', 'Please fill in all required fields.', 'error');
        return;
    }

    if (parseFloat(passing_marks) > parseFloat(total_marks)) {
        UI.showAlert('editAlertContainer', 'Passing marks cannot exceed total marks.', 'error');
        return;
    }

    const duration = Math.floor((new Date(end_time) - new Date(start_time)) / 60000);
    if (duration <= 0) {
        UI.showAlert('editAlertContainer', 'End time must be after start time.', 'error');
        return;
    }

    const btn = document.getElementById('saveEditBtn');
    _setBtnLoading(btn, true);

    try {
        const payload = {
            title,
            description,
            exam_type,
            start_time: new Date(start_time).toISOString(),
            end_time:   new Date(end_time).toISOString(),
            duration,
            total_marks:   String(total_marks),
            passing_marks: String(passing_marks),
            instructions:  instructions || ''
        };

        const res = await Api.patch(CONFIG.ENDPOINTS.STAFF_EXAM_DETAIL(_editExamId), payload);
        const { data, error } = await Api.parse(res);

        if (error) {
            UI.showAlert('editAlertContainer', Auth.extractErrorMessage(error), 'error');
            return;
        }

        // Update local state
        const idx = _allExams.findIndex(e => e.id === _editExamId);
        if (idx !== -1) _allExams[idx] = { ..._allExams[idx], ...data };

        _closeEditModal();
        UI.showAlert('alertContainer', 'Exam updated successfully!', 'success');
        _loadExams();

    } catch (err) {
        UI.showAlert('editAlertContainer', 'Network error. Please try again.', 'error');
    } finally {
        _setBtnLoading(btn, false);
    }
}

// ── Publish / Unpublish Modal ─────────────────────────────────────────────
function _initPublishModal() {
    document.getElementById('publishModalClose')?.addEventListener('click', _closePublishModal);
    document.getElementById('cancelPublishBtn')?.addEventListener('click', _closePublishModal);
    document.getElementById('publishModal')?.addEventListener('click', e => {
        if (e.target.id === 'publishModal') _closePublishModal();
    });
    document.getElementById('confirmPublishBtn')?.addEventListener('click', _confirmPublish);
}

function _closePublishModal() {
    document.getElementById('publishModal').classList.remove('show');
}

window.openPublishModal = (examId, action, examTitle) => {
    _publishExamId = examId;
    _publishAction = action;

    const isPublish = action === 'publish';
    document.getElementById('publishModalTitle').innerHTML = isPublish
        ? '<i class="fas fa-check-circle" style="color:#22c55e;"></i> Publish Exam'
        : '<i class="fas fa-eye-slash" style="color:#fb923c;"></i> Unpublish Exam';

    document.getElementById('publishModalMessage').textContent = isPublish
        ? `"${examTitle}" will become visible to eligible students.`
        : `"${examTitle}" will be hidden from students.`;

    const confirmBtn = document.getElementById('confirmPublishText');
    if (confirmBtn) confirmBtn.textContent = isPublish ? 'Yes, Publish' : 'Yes, Unpublish';

    const btn = document.getElementById('confirmPublishBtn');
    btn.className = `btn ${isPublish ? 'btn-primary' : 'btn-warning'}`;

    document.getElementById('publishModal').classList.add('show');
};

async function _confirmPublish() {
    if (!_publishExamId) return;

    const btn = document.getElementById('confirmPublishBtn');
    _setBtnLoading(btn, true);

    try {
        const endpoint = _publishAction === 'publish'
            ? CONFIG.ENDPOINTS.STAFF_EXAM_PUBLISH(_publishExamId)
            : CONFIG.ENDPOINTS.STAFF_EXAM_UNPUBLISH(_publishExamId);

        const res = await Api.post(endpoint, {});
        const { error } = await Api.parse(res);

        if (error) {
            UI.showAlert('alertContainer', Auth.extractErrorMessage(error), 'error');
            _closePublishModal();
            return;
        }

        const msg = _publishAction === 'publish'
            ? 'Exam published successfully! Students can now access it.'
            : 'Exam unpublished. Students can no longer see it.';

        UI.showAlert('alertContainer', msg, 'success');
        _closePublishModal();
        _loadExams();

    } catch (err) {
        UI.showAlert('alertContainer', 'Network error. Please try again.', 'error');
        _closePublishModal();
    } finally {
        _setBtnLoading(btn, false);
    }
}

// ── Delete Modal ──────────────────────────────────────────────────────────
function _initDeleteModal() {
    document.getElementById('deleteModalClose')?.addEventListener('click', _closeDeleteModal);
    document.getElementById('cancelDeleteBtn')?.addEventListener('click', _closeDeleteModal);
    document.getElementById('deleteModal')?.addEventListener('click', e => {
        if (e.target.id === 'deleteModal') _closeDeleteModal();
    });
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', _confirmDelete);
}

function _closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('show');
    _deleteExamId = null;
}

window.openDeleteModal = (examId, examTitle) => {
    _deleteExamId = examId;
    document.getElementById('deleteExamName').textContent = examTitle;
    document.getElementById('deleteModal').classList.add('show');
};

async function _confirmDelete() {
    if (!_deleteExamId) return;

    const btn = document.getElementById('confirmDeleteBtn');
    _setBtnLoading(btn, true);

    try {
        const res = await Api.del(CONFIG.ENDPOINTS.STAFF_EXAM_DETAIL(_deleteExamId));

        // 204 No Content = success
        if (res.status === 204 || res.ok) {
            UI.showAlert('alertContainer', 'Exam deleted successfully.', 'success');
            _closeDeleteModal();
            _loadExams();
        } else {
            const { error } = await Api.parse(res);
            UI.showAlert('alertContainer', Auth.extractErrorMessage(error), 'error');
            _closeDeleteModal();
        }

    } catch (err) {
        UI.showAlert('alertContainer', 'Network error. Please try again.', 'error');
        _closeDeleteModal();
    } finally {
        _setBtnLoading(btn, false);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function _setBtnLoading(btn, loading) {
    if (!btn) return;
    const textEl   = btn.querySelector('.btn-text');
    const loaderEl = btn.querySelector('.btn-loader');
    btn.disabled = loading;
    textEl?.classList.toggle('hidden', loading);
    loaderEl?.classList.toggle('hidden', !loading);
}
