/**
 * TestVerse — Staff: Exam Question Editor
 * Works for BOTH first-time add (from examcreate) AND editing existing questions.
 * URL params:  ?id=<examId>   required
 *              ?new=1         optional — shows welcome banner
 */
'use strict';

// ── State ──────────────────────────────────────────────────────────
let _examId       = null;
let _exam         = null;
let _questions    = [];       // full list from API
let _filtered     = [];       // after type-tab filter
let _typeFilter   = '';
let _drawerMode   = 'add';    // 'add' | 'edit'
let _editQId      = null;
let _deleteQId    = null;
let _saving       = false;
let _optionCount  = 0;        // tracks letters A B C D…

// ── Boot ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireStaff()) return;

    const params = new URLSearchParams(location.search);
    _examId = params.get('id');
    if (!_examId) { window.location.href = 'exams.html'; return; }

    _initSidebar();
    _initUser();
    _initDrawer();
    _initTypeTabs();
    _initDeleteModal();

    await _loadExam();
    await _loadQuestions();

    // Welcome banner for fresh exam
    if (params.get('new') === '1') _showWelcome();
});

// ── User ───────────────────────────────────────────────────────────
function _initUser() {
    const user = Auth.getUser(); if (!user) return;
    const name = user.name || user.username || user.email?.split('@')[0] || 'Staff';
    const av   = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;
    _set('sidebarName', name); _set('topbarName', name);
    _img('sidebarAvatar', av); _img('topbarAvatar', av);
}

// ── Sidebar ────────────────────────────────────────────────────────
function _initSidebar() {
    const sb  = document.getElementById('sidebar');
    const ov  = document.getElementById('sidebarOverlay');
    const open = () => { sb.classList.add('open'); ov.classList.add('show'); };
    const close= () => { sb.classList.remove('open'); ov.classList.remove('show'); };
    document.getElementById('menuToggle')?.addEventListener('click', open);
    document.getElementById('sidebarClose')?.addEventListener('click', close);
    ov?.addEventListener('click', close);
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Logout from TestVerse?')) Auth.logout();
    });
}

// ── Load Exam Details ──────────────────────────────────────────────
async function _loadExam() {
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.STAFF_EXAM_DETAIL(_examId));
        const { data, error } = await Api.parse(res);
        if (error || !data) return;
        _exam = data;
        _renderExamBar(data);
    } catch { /* silent */ }
}

function _renderExamBar(exam) {
    const typeMap = { midterm:'Midterm', final:'Final', quiz:'Quiz', assignment:'Assignment', practice:'Practice' };
    const status  = exam.is_published
        ? (new Date() > new Date(exam.end_time) ? 'Completed' : new Date() >= new Date(exam.start_time) ? 'Live' : 'Published')
        : 'Draft';

    _set('esbTitle', exam.title || '—');
    _set('esbType',  typeMap[exam.exam_type] || exam.exam_type || '—');
    _set('esbDuration', `${exam.duration || 0} min`);
    _set('esbMarks', `${exam.total_marks || 0} marks`);
    _set('esbStatus', status);
    _set('breadcrumbExamTitle', exam.title || 'Questions');
    document.title = `${exam.title} — Questions | TestVerse`;
    document.getElementById('examSummaryBar').style.display = '';
}

// ── Load Questions ─────────────────────────────────────────────────
async function _loadQuestions() {
    _showLoading();
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.STAFF_QUESTIONS(_examId));
        const { data, error } = await Api.parse(res);
        if (error) {
            _showAlert('Failed to load questions.', 'error');
            _showEmpty(); return;
        }
        _questions = Array.isArray(data)
            ? data
            : (data?.results || data?.questions || []);

        // Sort by order field if present
        _questions.sort((a, b) => (a.order || 0) - (b.order || 0));
        _applyFilter();
        _updateSummaryStats();
    } catch {
        _showAlert('Network error loading questions.', 'error');
        _showEmpty();
    }
}

function _applyFilter() {
    _filtered = _typeFilter
        ? _questions.filter(q => q.question_type === _typeFilter)
        : [..._questions];
    _renderQuestions();
}

// ── Render Questions ───────────────────────────────────────────────
function _renderQuestions() {
    const list = document.getElementById('questionsList');
    const tb   = document.getElementById('qToolbar');
    const addR = document.getElementById('addQRow');
    document.getElementById('loadingState').style.display = 'none';

    const badge = document.getElementById('qCountBadge');
    if (badge) badge.textContent = `${_filtered.length} question${_filtered.length !== 1 ? 's' : ''}`;

    if (_questions.length === 0) {
        _showEmpty(); return;
    }

    document.getElementById('emptyState').style.display = 'none';
    tb.style.display   = '';
    list.style.display = '';
    addR.style.display = '';

    list.innerHTML = _filtered.map((q, i) => _buildQCard(q, i + 1)).join('');

    // Bind action buttons
    list.querySelectorAll('.q-action-btn.edit').forEach(btn => {
        btn.addEventListener('click', () => _openDrawerEdit(btn.dataset.id));
    });
    list.querySelectorAll('.q-action-btn.del').forEach(btn => {
        btn.addEventListener('click', () => _openDeleteModal(btn.dataset.id));
    });
}

function _buildQCard(q, num) {
    const typeLabel = { mcq:'MCQ', true_false:'True/False', short_answer:'Short Answer', long_answer:'Long Answer' };
    const type = q.question_type || 'mcq';

    let bodyHtml = '';

    if (type === 'mcq' && Array.isArray(q.options) && q.options.length) {
        bodyHtml = `<div class="q-card-options">` +
            q.options.map((opt, i) => {
                const letter = String.fromCharCode(65 + i);
                const isCorrect = String(opt.id) === String(q.correct_option)
                    || opt.is_correct
                    || String(opt.value || opt.text) === String(q.correct_option);
                return `<div class="q-option ${isCorrect ? 'correct' : ''}">
                    <div class="q-option-indicator">${isCorrect ? '<i class="fas fa-check"></i>' : letter}</div>
                    <span>${_esc(opt.text || opt.value || '')}</span>
                </div>`;
            }).join('') + `</div>`;
    }

    if (type === 'true_false') {
        const ans = String(q.correct_answer).toLowerCase();
        bodyHtml = `<div class="q-tf-answer ${ans}">
            <i class="fas fa-${ans === 'true' ? 'check' : 'times'}"></i>
            Correct answer: <strong>${ans === 'true' ? 'True' : 'False'}</strong>
        </div>`;
    }

    if ((type === 'short_answer' || type === 'long_answer') && q.model_answer) {
        bodyHtml = `<div class="q-model-answer">
            <strong>Model answer:</strong> ${_esc(q.model_answer)}
        </div>`;
    }

    if (q.explanation) {
        bodyHtml += `<div class="q-explanation">
            <i class="fas fa-lightbulb"></i>
            <span>${_esc(q.explanation)}</span>
        </div>`;
    }

    return `
    <div class="q-card" data-id="${q.id}">
        <div class="q-card-top">
            <div class="q-card-left">
                <div class="q-num">${num}</div>
                <div class="q-text-block">
                    <p class="q-text">${_esc(q.text || q.question_text || '')}</p>
                    <div class="q-badges">
                        <span class="q-type-badge ${type}">${typeLabel[type] || type}</span>
                        <span class="q-marks-badge"><i class="fas fa-star"></i> ${q.marks || 0} mark${q.marks !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            </div>
            <div class="q-card-actions">
                <button class="q-action-btn edit" data-id="${q.id}" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="q-action-btn del" data-id="${q.id}" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        ${bodyHtml}
    </div>`;
}

// ── Summary Stats ──────────────────────────────────────────────────
function _updateSummaryStats() {
    const total = _questions.length;
    const totalMarks = _questions.reduce((s, q) => s + (parseFloat(q.marks) || 0), 0);
    _set('esbQCount', total);
    _set('esbTotalQ', totalMarks % 1 === 0 ? totalMarks : totalMarks.toFixed(1));
}

// ── Type Tabs ──────────────────────────────────────────────────────
function _initTypeTabs() {
    document.querySelectorAll('.q-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.q-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            _typeFilter = tab.dataset.type;
            _applyFilter();
        });
    });
}

// ── Welcome Banner ─────────────────────────────────────────────────
function _showWelcome() {
    const b = document.getElementById('welcomeBanner');
    if (b) b.style.display = '';
    document.getElementById('welcomeClose')?.addEventListener('click', () => {
        if (b) b.style.display = 'none';
    });
}

// ═══════════════════════════════════════════════════════════════════
//  QUESTION DRAWER
// ═══════════════════════════════════════════════════════════════════

function _initDrawer() {
    // Open triggers
    document.getElementById('addQuestionBtn')?.addEventListener('click',  () => _openDrawerAdd());
    document.getElementById('emptyAddBtn')?.addEventListener('click',     () => _openDrawerAdd());
    document.getElementById('addQRowBtn')?.addEventListener('click',      () => _openDrawerAdd());

    // Close
    document.getElementById('drawerClose')?.addEventListener('click',      _closeDrawer);
    document.getElementById('drawerCancelBtn')?.addEventListener('click',  _closeDrawer);
    document.getElementById('drawerBackdrop')?.addEventListener('click',   _closeDrawer);

    // Save buttons
    document.getElementById('drawerSaveBtn')?.addEventListener('click',    () => _saveQuestion(false));
    document.getElementById('drawerSaveAddBtn')?.addEventListener('click', () => _saveQuestion(true));

    // Type selector
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => _setQType(btn.dataset.value));
    });

    // MCQ add option
    document.getElementById('addOptionBtn')?.addEventListener('click', _addOptionRow);

    // Keyboard close
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') _closeDrawer();
    });

    // Build initial 4 MCQ options
    _resetOptions();
}

function _openDrawerAdd() {
    _drawerMode = 'add';
    _editQId    = null;
    _resetDrawer();
    _set('drawerTitle',    'Add Question');
    _set('drawerSubtitle', `Exam: ${_exam?.title || ''}`);
    document.getElementById('drawerIcon').innerHTML = '<i class="fas fa-plus"></i>';
    _openDrawer();
}

function _openDrawerEdit(qId) {
    const q = _questions.find(x => String(x.id) === String(qId));
    if (!q) return;
    _drawerMode = 'edit';
    _editQId    = qId;
    _resetDrawer();
    _set('drawerTitle',    'Edit Question');
    _set('drawerSubtitle', `Editing Q${_questions.indexOf(q) + 1}`);
    document.getElementById('drawerIcon').innerHTML = '<i class="fas fa-edit"></i>';
    _populateDrawer(q);
    _openDrawer();
}

function _openDrawer() {
    document.getElementById('questionDrawer').classList.add('open');
    document.getElementById('drawerBackdrop').classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('qText')?.focus(), 300);
}

function _closeDrawer() {
    document.getElementById('questionDrawer').classList.remove('open');
    document.getElementById('drawerBackdrop').classList.remove('show');
    document.body.style.overflow = '';
    _saving = false;
}

// ── Reset Drawer ───────────────────────────────────────────────────
function _resetDrawer() {
    _clearEl('drawerAlert');
    _val('qText', '');
    _val('qMarks', '');
    _val('qOrder', '');
    _val('qExplanation', '');
    _val('modelAnswer', '');
    _val('correctOption', '');
    // Reset TF
    document.querySelectorAll('input[name="tfAnswer"]').forEach(r => r.checked = false);
    // Reset type to MCQ
    _setQType('mcq');
    // Clear errors
    ['qTextErr','qOptionsErr','qCorrectErr','qTfErr','qMarksErr'].forEach(_clearEl);
}

// ── Populate Drawer for Edit ───────────────────────────────────────
function _populateDrawer(q) {
    const type = q.question_type || 'mcq';
    _setQType(type);
    _val('qText', q.text || q.question_text || '');
    _val('qMarks', q.marks || '');
    _val('qOrder', q.order || '');
    _val('qExplanation', q.explanation || '');
    _val('modelAnswer', q.model_answer || '');

    if (type === 'mcq') {
        _resetOptions();
        // Load saved options
        const opts = q.options || [];
        const rows = document.querySelectorAll('.option-row');

        opts.forEach((opt, i) => {
            if (i < rows.length) {
                rows[i].querySelector('.option-input').value = opt.text || opt.value || '';
            } else {
                _addOptionRow(opt.text || opt.value || '');
            }
        });
        // Trim excess rows if API returned fewer options
        const allRows = document.querySelectorAll('.option-row');
        allRows.forEach((row, i) => {
            if (i >= opts.length && opts.length >= 2) row.remove();
        });
        _syncCorrectSelect();

        // Set correct option
        const correctIdx = opts.findIndex(o =>
            String(o.id) === String(q.correct_option) || o.is_correct === true);
        if (correctIdx !== -1) {
            const sel = document.getElementById('correctOption');
            if (sel) sel.value = String(correctIdx);
        }
    }

    if (type === 'true_false') {
        const ans = String(q.correct_answer).toLowerCase();
        document.querySelector(`input[name="tfAnswer"][value="${ans}"]`).checked = true;
    }
}

// ── Set Question Type (shows/hides sections) ───────────────────────
function _setQType(type) {
    document.querySelectorAll('.type-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.value === type);
    });
    document.getElementById('mcqSection').style.display      = type === 'mcq'          ? '' : 'none';
    document.getElementById('tfSection').style.display       = type === 'true_false'   ? '' : 'none';
    document.getElementById('saSection').style.display       = (type === 'short_answer' || type === 'long_answer') ? '' : 'none';
}

function _currentType() {
    return document.querySelector('.type-btn.active')?.dataset.value || 'mcq';
}

// ── Options Builder ────────────────────────────────────────────────
function _resetOptions() {
    const list = document.getElementById('optionsList');
    if (!list) return;
    list.innerHTML = '';
    _optionCount = 0;
    ['Option A', 'Option B', 'Option C', 'Option D'].forEach(ph => _addOptionRow('', ph));
    _syncCorrectSelect();
}

function _addOptionRow(value = '', placeholder = '') {
    const list = document.getElementById('optionsList');
    if (!list) return;
    const count = list.querySelectorAll('.option-row').length;
    if (count >= 6) { _showAlert('Maximum 6 options allowed.', 'info'); return; }
    const letter = String.fromCharCode(65 + count);
    const row = document.createElement('div');
    row.className = 'option-row';
    row.dataset.idx = count;
    row.innerHTML = `
        <div class="option-letter">${letter}</div>
        <input type="text" class="option-input" placeholder="${placeholder || 'Option ' + letter}" value="${_esc(value)}" maxlength="500">
        <button type="button" class="option-remove" title="Remove option">
            <i class="fas fa-times"></i>
        </button>`;
    row.querySelector('.option-remove').addEventListener('click', () => {
        if (list.querySelectorAll('.option-row').length <= 2) {
            _showAlert('Minimum 2 options required.', 'info'); return;
        }
        row.remove();
        _relabelOptions();
        _syncCorrectSelect();
    });
    row.querySelector('.option-input').addEventListener('input', _syncCorrectSelect);
    list.appendChild(row);
    _syncCorrectSelect();
}

function _relabelOptions() {
    document.querySelectorAll('.option-row').forEach((row, i) => {
        row.querySelector('.option-letter').textContent = String.fromCharCode(65 + i);
    });
}

function _syncCorrectSelect() {
    const sel = document.getElementById('correctOption');
    if (!sel) return;
    const prev = sel.value;
    const rows = document.querySelectorAll('.option-row');
    sel.innerHTML = '<option value="">— select correct answer —</option>';
    rows.forEach((row, i) => {
        const txt = row.querySelector('.option-input').value.trim();
        const letter = String.fromCharCode(65 + i);
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `${letter}: ${txt || '(empty)'}`;
        sel.appendChild(opt);
    });
    if (prev !== '') sel.value = prev;
}

// ── Validate Drawer ────────────────────────────────────────────────
function _validateDrawer() {
    let ok = true;
    const type = _currentType();

    const text = document.getElementById('qText')?.value.trim();
    if (!text) { _setErr('qTextErr', 'Question text is required'); ok = false; }
    else _clearEl('qTextErr');

    const marks = parseFloat(document.getElementById('qMarks')?.value);
    if (!marks || marks <= 0) { _setErr('qMarksErr', 'Enter valid marks (> 0)'); ok = false; }
    else _clearEl('qMarksErr');

    if (type === 'mcq') {
        const rows = document.querySelectorAll('.option-row');
        const filled = [...rows].filter(r => r.querySelector('.option-input').value.trim());
        if (filled.length < 2) { _setErr('qOptionsErr', 'At least 2 options required'); ok = false; }
        else _clearEl('qOptionsErr');

        const correct = document.getElementById('correctOption')?.value;
        if (correct === '' || correct === null || correct === undefined) {
            _setErr('qCorrectErr', 'Select the correct answer'); ok = false;
        } else _clearEl('qCorrectErr');
    }

    if (type === 'true_false') {
        const sel = document.querySelector('input[name="tfAnswer"]:checked');
        if (!sel) { _setErr('qTfErr', 'Select True or False'); ok = false; }
        else _clearEl('qTfErr');
    }

    return ok;
}

// ── Build Payload ──────────────────────────────────────────────────
function _buildPayload() {
    const type  = _currentType();
    const text  = document.getElementById('qText').value.trim();
    const marks = parseFloat(document.getElementById('qMarks').value);
    const order = parseInt(document.getElementById('qOrder').value) || undefined;
    const expl  = document.getElementById('qExplanation').value.trim();
    const payload = {
        question_type: type,
        text,
        marks,
        explanation: expl || '',
    };
    if (order) payload.order = order;

    if (type === 'mcq') {
        const rows   = document.querySelectorAll('.option-row');
        const options = [...rows]
            .map(r => r.querySelector('.option-input').value.trim())
            .filter(Boolean)
            .map(text => ({ text }));
        const correctIdx = parseInt(document.getElementById('correctOption').value);
        payload.options         = options;
        payload.correct_option  = correctIdx;   // backend expects index or option text
    }

    if (type === 'true_false') {
        payload.correct_answer = document.querySelector('input[name="tfAnswer"]:checked').value;
    }

    if (type === 'short_answer' || type === 'long_answer') {
        payload.model_answer = document.getElementById('modelAnswer').value.trim();
    }

    return payload;
}

// ── Save Question ──────────────────────────────────────────────────
async function _saveQuestion(addAnother) {
    if (_saving) return;
    if (!_validateDrawer()) return;

    _saving = true;
    const btn = addAnother
        ? document.getElementById('drawerSaveAddBtn')
        : document.getElementById('drawerSaveBtn');
    _setBtnLoading(btn, true);
    _clearEl('drawerAlert');

    const payload = _buildPayload();

    try {
        let res, data, error;

        if (_drawerMode === 'add') {
            res = await Api.post(CONFIG.ENDPOINTS.STAFF_QUESTIONS(_examId), payload);
        } else {
            res = await Api.patch(CONFIG.ENDPOINTS.STAFF_QUESTION_DETAIL(_editQId), payload);
        }

        ({ data, error } = await Api.parse(res));

        if (error) {
            _setEl('drawerAlert', _alertHtml(_extractErr(error), 'error'));
            _setBtnLoading(btn, false);
            _saving = false;
            return;
        }

        // Update local state
        if (_drawerMode === 'add') {
            _questions.push(data);
        } else {
            const idx = _questions.findIndex(q => String(q.id) === String(_editQId));
            if (idx !== -1) _questions[idx] = data;
        }

        _questions.sort((a, b) => (a.order || 0) - (b.order || 0));
        _applyFilter();
        _updateSummaryStats();

        if (addAnother) {
            _setBtnLoading(btn, false);
            _saving = false;
            _resetDrawer();
            _set('drawerTitle', 'Add Question');
            _set('drawerSubtitle', `Question ${_questions.length + 1}`);
            _setEl('drawerAlert', _alertHtml('Question saved! Add another.', 'success'));
        } else {
            _closeDrawer();
            _showAlert(
                _drawerMode === 'add' ? 'Question added successfully!' : 'Question updated!',
                'success'
            );
        }

    } catch {
        _setEl('drawerAlert', _alertHtml('Network error. Please try again.', 'error'));
        _setBtnLoading(btn, false);
        _saving = false;
    }
}

// ── Delete ─────────────────────────────────────────────────────────
function _initDeleteModal() {
    document.getElementById('deleteModalClose')?.addEventListener('click', _closeDeleteModal);
    document.getElementById('deleteCancelBtn')?.addEventListener('click',  _closeDeleteModal);
    document.getElementById('deleteModal')?.addEventListener('click', e => {
        if (e.target.id === 'deleteModal') _closeDeleteModal();
    });
    document.getElementById('deleteConfirmBtn')?.addEventListener('click', _confirmDelete);
}

function _openDeleteModal(qId) {
    _deleteQId = qId;
    document.getElementById('deleteModal').classList.add('show');
}
function _closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('show');
    _deleteQId = null;
}

async function _confirmDelete() {
    if (!_deleteQId) return;
    const btn = document.getElementById('deleteConfirmBtn');
    _setBtnLoading(btn, true);
    try {
        const res = await Api.del(CONFIG.ENDPOINTS.STAFF_QUESTION_DETAIL(_deleteQId));
        if (res.ok || res.status === 204) {
            _questions = _questions.filter(q => String(q.id) !== String(_deleteQId));
            _applyFilter();
            _updateSummaryStats();
            _closeDeleteModal();
            _showAlert('Question deleted.', 'success');
        } else {
            const { error } = await Api.parse(res);
            _showAlert(_extractErr(error), 'error');
            _closeDeleteModal();
        }
    } catch {
        _showAlert('Network error.', 'error');
        _closeDeleteModal();
    } finally {
        _setBtnLoading(btn, false);
    }
}

// ── Show States ────────────────────────────────────────────────────
function _showLoading() {
    document.getElementById('loadingState').style.display   = '';
    document.getElementById('emptyState').style.display     = 'none';
    document.getElementById('questionsList').style.display  = 'none';
    document.getElementById('qToolbar').style.display       = 'none';
    document.getElementById('addQRow').style.display        = 'none';
}
function _showEmpty() {
    document.getElementById('loadingState').style.display   = 'none';
    document.getElementById('questionsList').style.display  = 'none';
    document.getElementById('qToolbar').style.display       = 'none';
    document.getElementById('addQRow').style.display        = 'none';
    document.getElementById('emptyState').style.display     = '';
}

// ── Global Alert ───────────────────────────────────────────────────
function _showAlert(msg, type) {
    const wrap = document.getElementById('alertContainer'); if (!wrap) return;
    wrap.innerHTML = _alertHtml(msg, type);
    setTimeout(() => { if (wrap.innerHTML) wrap.innerHTML = ''; }, 4000);
}
function _alertHtml(msg, type) {
    const icon = type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle';
    return `<div class="alert alert-${type}"><i class="fas fa-${icon}"></i><span>${msg}</span></div>`;
}

// ── Helpers ────────────────────────────────────────────────────────
function _set(id, val)  { const el = document.getElementById(id); if (el) el.textContent = val; }
function _img(id, src)  { const el = document.getElementById(id); if (el) el.src = src; }
function _val(id, val)  { const el = document.getElementById(id); if (el) el.value = val; }
function _clearEl(id)   { const el = document.getElementById(id); if (el) el.textContent = ''; }
function _setEl(id, html){ const el = document.getElementById(id); if (el) el.innerHTML = html; }
function _setErr(id, m) { const el = document.getElementById(id); if (el) el.textContent = m; }
function _setBtnLoading(btn, on) {
    if (!btn) return;
    btn.disabled = on;
    btn.querySelector('.btn-text')?.classList.toggle('hidden', on);
    const l = btn.querySelector('.btn-loader');
    if (l) { l.classList.toggle('hidden', !on); if (on) l.style.display = 'inline-flex'; }
}
function _extractErr(err) {
    if (!err) return 'Something went wrong';
    if (typeof err === 'string') return err;
    const v = Object.values(err);
    return v.length ? (Array.isArray(v[0]) ? v[0][0] : String(v[0])) : 'Something went wrong';
}
function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
