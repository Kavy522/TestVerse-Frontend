/**
 * TestVerse — Staff: Create Exam
 * On submit → POST to STAFF_EXAMS → redirect to examedit.html?id=<new_id>
 */
'use strict';

// ── State ──────────────────────────────────────────────────────────
let _selectedBranches = [];   // [{ id, name, code }]
let _allBranches      = [];   // fetched from API
let _submitting       = false;

// ── Boot ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.requireStaff()) return;
    _initUser();
    _initSidebar();
    _initSchedule();
    _initScoring();
    _initBranches();
    _initCharCounts();
    _initForm();
});

// ── User ───────────────────────────────────────────────────────────
function _initUser() {
    const user   = Auth.getUser(); if (!user) return;
    const name   = user.name || user.username || user.email?.split('@')[0] || 'Staff';
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;
    const setEl  = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setImg = (id, src) => { const el = document.getElementById(id); if (el) el.src = src; };
    setEl('sidebarName', name); setEl('topbarName', name);
    setImg('sidebarAvatar', avatar); setImg('topbarAvatar', avatar);
}

// ── Sidebar ────────────────────────────────────────────────────────
function _initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const open    = () => { sidebar.classList.add('open'); overlay.classList.add('show'); };
    const close   = () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); };
    document.getElementById('menuToggle')?.addEventListener('click', open);
    document.getElementById('sidebarClose')?.addEventListener('click', close);
    overlay?.addEventListener('click', close);
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Logout from TestVerse?')) Auth.logout();
    });
}

// ── Char Counts ────────────────────────────────────────────────────
function _initCharCounts() {
    _bindCharCount('examDescription', 'descCount', 1000);
    _bindCharCount('examInstructions', 'instrCount', 2000);
}
function _bindCharCount(inputId, countId, max) {
    const el = document.getElementById(inputId);
    const ct = document.getElementById(countId);
    if (!el || !ct) return;
    const update = () => {
        const len = el.value.length;
        ct.textContent = `${len} / ${max}`;
        ct.classList.toggle('warn', len >= max * 0.85 && len < max);
        ct.classList.toggle('over', len >= max);
    };
    el.addEventListener('input', update);
    update();
}

// ── Schedule — Duration Auto-calc ─────────────────────────────────
function _initSchedule() {
    const startEl = document.getElementById('startTime');
    const endEl   = document.getElementById('endTime');

    // Set min to now (round up to next minute)
    const nowStr = _toDateTimeLocal(new Date(Date.now() + 60000));
    if (startEl) startEl.min = nowStr;

    startEl?.addEventListener('change', () => {
        // End must be after start
        if (endEl && startEl.value) endEl.min = startEl.value;
        _calcDuration();
        _clearErr('startErr');
    });
    endEl?.addEventListener('change', () => { _calcDuration(); _clearErr('endErr'); });
    _calcDuration();
}

function _calcDuration() {
    const s = document.getElementById('startTime')?.value;
    const e = document.getElementById('endTime')?.value;
    const disp = document.getElementById('durationDisplay');
    const val  = document.getElementById('durationValue');
    const bkd  = document.getElementById('durationBreakdown');
    if (!disp || !val) return;

    if (!s || !e) {
        val.textContent = '—';
        disp.classList.remove('valid', 'invalid');
        if (bkd) bkd.textContent = '';
        return;
    }

    const diffMs = new Date(e) - new Date(s);
    if (diffMs <= 0) {
        val.textContent = 'Invalid range';
        disp.classList.add('invalid'); disp.classList.remove('valid');
        if (bkd) bkd.innerHTML = '<i class="fas fa-exclamation-circle"></i> End must be after start';
        return;
    }

    const totalMins = Math.floor(diffMs / 60000);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;

    val.textContent = h > 0 ? `${h}h ${m > 0 ? m + 'm' : ''}`.trim() : `${m} min`;
    disp.classList.add('valid'); disp.classList.remove('invalid');

    // Breakdown
    const days = Math.floor(h / 24), rh = h % 24;
    let bkStr = '';
    if (days)    bkStr += `${days}d `;
    if (rh)      bkStr += `${rh}h `;
    if (m)       bkStr += `${m}m `;
    if (bkd) bkd.innerHTML = `<i class="fas fa-clock"></i> ${totalMins} minutes total`;
}

// ── Scoring — Pass % + Bar ─────────────────────────────────────────
function _initScoring() {
    document.getElementById('totalMarks')?.addEventListener('input',   _calcScoring);
    document.getElementById('passingMarks')?.addEventListener('input', _calcScoring);
}
function _calcScoring() {
    const total = parseFloat(document.getElementById('totalMarks')?.value) || 0;
    const pass  = parseFloat(document.getElementById('passingMarks')?.value) || 0;
    const pctEl = document.getElementById('passPercent');
    const wrap  = document.getElementById('passBarWrap');
    const fill  = document.getElementById('passBarFill');
    const mark  = document.getElementById('passBarMarker');
    const passL = document.getElementById('passBarPassLabel');
    const totL  = document.getElementById('totalMarksLabel');

    if (!total || !pass) {
        if (pctEl) pctEl.textContent = '—';
        if (wrap)  wrap.style.display = 'none';
        return;
    }

    const pct = Math.min(100, Math.round((pass / total) * 100 * 10) / 10);
    if (pctEl) pctEl.textContent = pct;
    if (wrap)  wrap.style.display = 'block';

    const fillW = Math.min(100, (pass / total) * 100);
    if (fill)  fill.style.width  = `${fillW}%`;
    if (mark)  mark.style.left   = `calc(${fillW}% - 2px)`;
    if (passL) passL.textContent = pass;
    if (totL)  totL.textContent  = total;

    // Validation feedback
    if (pass > total) {
        _setErr('passErr', 'Cannot exceed total marks');
    } else {
        _clearErr('passErr');
    }
}

// ── Branches ───────────────────────────────────────────────────────
async function _initBranches() {
    try {
        // Try your staff branches endpoint; fallback to students endpoint for branch list
        const ep = CONFIG.ENDPOINTS.STAFF_BRANCHES || '/api/v1/auth/staff/branches/';
        const res = await Api.get(ep);
        const { data, error } = await Api.parse(res);

        if (error || !data) {
            // Fallback: use a hardcoded set until backend provides endpoint
            _allBranches = _defaultBranches();
        } else {
            _allBranches = Array.isArray(data) ? data : (data.results || data.branches || []);
        }
    } catch {
        _allBranches = _defaultBranches();
    }
    _renderBranchList(_allBranches);
    _initBranchSearch();
}

function _defaultBranches() {
    return [
        { id: 'CE',  name: 'Computer Engineering',          code: 'CE'  },
        { id: 'IT',  name: 'Information Technology',        code: 'IT'  },
        { id: 'EC',  name: 'Electronics & Communication',   code: 'EC'  },
        { id: 'ME',  name: 'Mechanical Engineering',        code: 'ME'  },
        { id: 'CV',  name: 'Civil Engineering',             code: 'CV'  },
        { id: 'EE',  name: 'Electrical Engineering',        code: 'EE'  },
        { id: 'CH',  name: 'Chemical Engineering',          code: 'CH'  },
        { id: 'BCA', name: 'Bachelor of Computer Apps',     code: 'BCA' },
        { id: 'MCA', name: 'Master of Computer Apps',       code: 'MCA' },
    ];
}

function _renderBranchList(branches) {
    const list = document.getElementById('branchList'); if (!list) return;
    if (!branches.length) {
        list.innerHTML = '<div class="branch-empty">No branches found</div>';
        return;
    }
    list.innerHTML = branches.map(b => {
        const sel = _selectedBranches.some(s => s.id === b.id);
        return `
        <div class="branch-item ${sel ? 'selected' : ''}" data-id="${b.id}" data-name="${_esc(b.name)}" data-code="${_esc(b.code || b.id)}">
            <div class="branch-check"></div>
            <span class="branch-name">${_esc(b.name)}</span>
            <span class="branch-code">${_esc(b.code || b.id)}</span>
        </div>`;
    }).join('');
    list.querySelectorAll('.branch-item').forEach(item => {
        item.addEventListener('click', () => _toggleBranch(item));
    });
}

function _initBranchSearch() {
    document.getElementById('branchSearch')?.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        const filtered = _allBranches.filter(b =>
            b.name.toLowerCase().includes(q) || (b.code || '').toLowerCase().includes(q));
        _renderBranchList(filtered);
    });
}

function _toggleBranch(item) {
    const id   = item.dataset.id;
    const name = item.dataset.name;
    const code = item.dataset.code;
    const idx  = _selectedBranches.findIndex(s => s.id === id);
    if (idx === -1) {
        _selectedBranches.push({ id, name, code });
    } else {
        _selectedBranches.splice(idx, 1);
    }
    item.classList.toggle('selected', idx === -1);
    _renderChips();
    _clearErr('branchErr');
}

function _renderChips() {
    const wrap = document.getElementById('selectedBranches'); if (!wrap) return;
    if (!_selectedBranches.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = _selectedBranches.map(b => `
        <span class="branch-chip" data-id="${b.id}">
            ${_esc(b.name)}
            <button class="branch-chip-remove" type="button" title="Remove"><i class="fas fa-times"></i></button>
        </span>`).join('');
    wrap.querySelectorAll('.branch-chip').forEach(chip => {
        chip.querySelector('.branch-chip-remove').addEventListener('click', () => {
            const id = chip.dataset.id;
            _selectedBranches = _selectedBranches.filter(s => s.id !== id);
            _renderChips();
            // deselect in list
            const li = document.querySelector(`.branch-item[data-id="${id}"]`);
            if (li) li.classList.remove('selected');
        });
    });
}

// ── Form Init ──────────────────────────────────────────────────────
function _initForm() {
    document.getElementById('createExamForm')?.addEventListener('submit', e => {
        e.preventDefault(); _submit(false);
    });
    document.getElementById('saveDraftBtn')?.addEventListener('click', () => {
        _submit(true);
    });
    // ← ADD THIS: live hint under result visibility
    _initResultVisibility();
}

function _initResultVisibility() {
    const sel  = document.getElementById('resultVisibility');
    const hint = document.getElementById('resultVisibilityHint');
    if (!sel || !hint) return;
    const hints = {
        immediate: 'Students see score & answers right after they submit',
        after_end: 'Results become visible once the exam window closes',
        manual:    'You control exactly when results are released to students',
    };
    sel.addEventListener('change', () => {
        hint.textContent = hints[sel.value] || '';
    });
}

// ── Validate ───────────────────────────────────────────────────────
function _validate(asDraft) {
    let ok = true;
    const title = document.getElementById('examTitle')?.value.trim();
    const type  = document.getElementById('examType')?.value;
    const desc  = document.getElementById('examDescription')?.value.trim();
    const start = document.getElementById('startTime')?.value;
    const end   = document.getElementById('endTime')?.value;
    const total = parseFloat(document.getElementById('totalMarks')?.value);
    const pass  = parseFloat(document.getElementById('passingMarks')?.value);

    if (!title) { _setErr('titleErr', 'Title is required'); ok = false; }
    else _clearErr('titleErr');

    if (!type) { _setErr('typeErr', 'Select an exam type'); ok = false; }
    else _clearErr('typeErr');

    if (!desc) { _setErr('descErr', 'Description is required'); ok = false; }
    else _clearErr('descErr');

    if (!start) { _setErr('startErr', 'Start time is required'); ok = false; }
    else _clearErr('startErr');

    if (!end) { _setErr('endErr', 'End time is required'); ok = false; }
    else if (start && new Date(end) <= new Date(start)) {
        _setErr('endErr', 'End time must be after start time'); ok = false;
    } else _clearErr('endErr');

    if (!total || total < 1) { _setErr('totalErr', 'Enter valid total marks'); ok = false; }
    else _clearErr('totalErr');

    if (!pass || pass < 1) { _setErr('passErr', 'Enter valid passing marks'); ok = false; }
    else if (total && pass > total) { _setErr('passErr', 'Cannot exceed total marks'); ok = false; }
    else _clearErr('passErr');

    if (!asDraft && !_selectedBranches.length) {
        _setErr('branchErr', 'Select at least one branch'); ok = false;
    } else _clearErr('branchErr');

    return ok;
}

// ── Submit ─────────────────────────────────────────────────────────
async function _submit(asDraft) {
    if (_submitting) return;
    if (!_validate(asDraft)) {
        // Scroll to first error
        document.querySelector('.form-error:not(:empty)')?.closest('.form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    _submitting = true;
    const btn = asDraft
        ? document.getElementById('saveDraftBtn')
        : document.getElementById('submitBtn');
    _setBtnLoading(btn, true);

    const start = document.getElementById('startTime').value;
    const end   = document.getElementById('endTime').value;
    const durationMins = Math.floor((new Date(end) - new Date(start)) / 60000);

    const payload = {
        title:               document.getElementById('examTitle').value.trim(),
        exam_type:           document.getElementById('examType').value,
        description:         document.getElementById('examDescription').value.trim(),
        instructions:        document.getElementById('examInstructions').value.trim(),
        start_time:          new Date(start).toISOString(),
        end_time:            new Date(end).toISOString(),
        duration:            durationMins,
        total_marks:         String(document.getElementById('totalMarks').value),
        passing_marks:       String(document.getElementById('passingMarks').value),
        allowed_branches:    _selectedBranches.map(b => b.id),
        max_attempts:        parseInt(document.getElementById('attemptLimit').value) || 1,
        result_visibility:   document.getElementById('resultVisibility').value,
        shuffle_questions:   document.getElementById('shuffleQuestions').checked,
        shuffle_options:     document.getElementById('shuffleOptions').checked,
        show_score: document.getElementById('resultVisibility').value === 'immediate',
        allow_review:        document.getElementById('allowReview').checked,
        is_published:        false,   // always starts as draft
    };

    try {
        const res = await Api.post(CONFIG.ENDPOINTS.STAFF_EXAMS, payload);
        const { data, error } = await Api.parse(res);

        if (error) {
            _showAlert(typeof error === 'string' ? error : _extractErr(error), 'error');
            _setBtnLoading(btn, false);
            _submitting = false;
            return;
        }

        const examId = data?.id || data?.exam_id;

        if (asDraft) {
            // Just saved as draft — go back to exams list
            window.location.href = `exams.html?created=draft&title=${encodeURIComponent(payload.title)}`;
        } else {
            // Continue to question editor
            window.location.href = `examedit.html?id=${examId}&new=1`;
        }

    } catch (err) {
        console.error(err);
        _showAlert('Network error. Please check your connection.', 'error');
        _setBtnLoading(btn, false);
        _submitting = false;
    }
}

// ── Helpers ────────────────────────────────────────────────────────
function _setErr(id, msg)   { const el = document.getElementById(id); if (el) el.textContent = msg; }
function _clearErr(id)      { const el = document.getElementById(id); if (el) el.textContent = ''; }

function _showAlert(msg, type) {
    const wrap = document.getElementById('alertContainer'); if (!wrap) return;
    wrap.innerHTML = `
        <div class="alert alert-${type}">
            <i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'check-circle'}"></i>
            <span>${msg}</span>
        </div>`;
    wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function _setBtnLoading(btn, on) {
    if (!btn) return;
    btn.disabled = on;
    btn.querySelector('.btn-text')?.classList.toggle('hidden', on);
    const loader = btn.querySelector('.btn-loader');
    if (loader) { loader.classList.toggle('hidden', !on); if (on) loader.style.display = 'inline-flex'; }
}

function _extractErr(err) {
    if (typeof err === 'string') return err;
    const vals = Object.values(err);
    if (vals.length) return Array.isArray(vals[0]) ? vals[0][0] : String(vals[0]);
    return 'Something went wrong';
}

function _toDateTimeLocal(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
