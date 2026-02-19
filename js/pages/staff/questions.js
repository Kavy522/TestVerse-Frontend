/**
 * Staff Questions Page
 * Manage questions for an exam: add, edit, delete, reorder
 */
(function () {
  if (!Auth.requireStaff()) return;

  const $ = (s) => document.getElementById(s);
  const params = new URLSearchParams(window.location.search);
  const examId = params.get('exam');
  let questions = [];
  let currentType = 'mcq';

  if (!examId) {
    $('questions-list').innerHTML = '<p style="text-align:center;color:var(--text-tertiary);padding:2rem;">No exam specified. <a href="exams.html">Go to Exams</a></p>';
    return;
  }

  loadExamInfo();
  loadQuestions();

  // Type selector
  document.querySelectorAll('#type-selector .type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#type-selector .type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentType = btn.dataset.type;
      $('mcq-options').style.display = (currentType === 'mcq' || currentType === 'multiple_mcq') ? '' : 'none';
      $('descriptive-fields').style.display = currentType === 'descriptive' ? '' : 'none';
      $('coding-fields').style.display = currentType === 'coding' ? '' : 'none';

      // Switch radio/checkbox for mcq vs multiple_mcq
      if (currentType === 'multiple_mcq') {
        document.querySelectorAll('#options-list input[type="radio"]').forEach(r => {
          const cb = document.createElement('input');
          cb.type = 'checkbox'; cb.name = 'correct'; cb.value = r.value;
          r.replaceWith(cb);
        });
      } else if (currentType === 'mcq') {
        document.querySelectorAll('#options-list input[type="checkbox"]').forEach(cb => {
          const r = document.createElement('input');
          r.type = 'radio'; r.name = 'correct'; r.value = cb.value;
          cb.replaceWith(r);
        });
      }
    });
  });

  // Add option
  $('add-option-btn').addEventListener('click', () => {
    const list = $('options-list');
    const idx = list.children.length;
    const row = document.createElement('div');
    row.className = 'option-row';
    const inputType = currentType === 'multiple_mcq' ? 'checkbox' : 'radio';
    row.innerHTML = `
      <input type="${inputType}" name="correct" value="${idx}">
      <input type="text" class="form-input option-input" placeholder="Option ${idx + 1}" required>
      <button type="button" class="btn btn-ghost btn-sm remove-option" onclick="this.parentElement.remove()">×</button>
    `;
    list.appendChild(row);
    updateRemoveButtons();
  });

  // Form submit
  $('question-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('add-btn');
    btn.disabled = true;
    btn.textContent = 'Adding...';

    const payload = {
      type: currentType,
      text: $('q-text').value.trim(),
      points: parseInt($('q-marks').value) || 1,
    };

    if (currentType === 'mcq' || currentType === 'multiple_mcq') {
      const optInputs = document.querySelectorAll('#options-list .option-input');
      payload.options = Array.from(optInputs).map(i => i.value.trim()).filter(Boolean);

      if (currentType === 'mcq') {
        const checked = document.querySelector('#options-list input[name="correct"]:checked');
        payload.correct_answer = checked ? parseInt(checked.value) : 0;
      } else {
        const checked = document.querySelectorAll('#options-list input[name="correct"]:checked');
        payload.correct_answers = Array.from(checked).map(c => parseInt(c.value));
      }
    } else if (currentType === 'descriptive') {
      payload.expected_answer = $('expected-answer')?.value?.trim();
    } else if (currentType === 'coding') {
      payload.language = $('code-lang')?.value;
    }

    try {
      const res = await Api.post(CONFIG.ENDPOINTS.STAFF_QUESTIONS(examId), payload);
      const parsed = await Api.parse(res);
      if (parsed.error) {
        Ui.toast(typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error), 'error');
      } else {
        Ui.toast('Question added!', 'success');
        $('question-form').reset();
        loadQuestions();
      }
    } catch (err) {
      Ui.toast('Failed to add question', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add Question';
    }
  });

  async function loadExamInfo() {
    try {
      const res = await Api.get(CONFIG.ENDPOINTS.STAFF_EXAM_DETAIL(examId));
      const { data } = await Api.parse(res);
      if (data) {
        $('page-title').textContent = data.title || 'Manage Questions';
        $('exam-info').textContent = `${data.exam_type || ''} · ${data.total_marks || '?'} marks · ${data.duration || '?'} min`;
      }
    } catch (_) {}
  }

  async function loadQuestions() {
    try {
      const res = await Api.get(CONFIG.ENDPOINTS.STAFF_QUESTIONS(examId));
      const { data } = await Api.parse(res);
      questions = Array.isArray(data) ? data : data?.results || [];
      renderQuestions();
    } catch (err) {
      $('questions-list').innerHTML = '<p style="text-align:center;color:var(--text-tertiary);">Failed to load questions</p>';
    }
  }

  function renderQuestions() {
    const container = $('questions-list');
    const summary = $('marks-summary');

    if (!questions.length) {
      container.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text-tertiary);">No questions yet. Add one above.</p>';
      summary.style.display = 'none';
      return;
    }

    summary.style.display = '';
    $('q-count').textContent = questions.length;
    const totalMarks = questions.reduce((s, q) => s + (parseInt(q.points) || 0), 0);
    $('marks-status').textContent = `Total Marks: ${totalMarks}`;

    container.innerHTML = questions.map((q, i) => {
      const typeLabels = { mcq: 'MCQ', multiple_mcq: 'Multi-Select', descriptive: 'Descriptive', coding: 'Coding' };
      return `<div style="border:1px solid var(--border-primary,#e2e8f0);border-radius:8px;padding:1rem;margin-bottom:.75rem;">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;">
              <span style="font-weight:600;">Q${i + 1}.</span>
              <span class="badge badge-secondary">${typeLabels[q.type] || q.type}</span>
              <span style="color:var(--text-tertiary);font-size:.85rem;">${q.points || 0} marks</span>
            </div>
            <p style="margin:0;">${q.text || '-'}</p>
            ${q.options ? `<div style="margin-top:.5rem;padding-left:1rem;color:var(--text-secondary);font-size:.9rem;">${q.options.map((o, j) => `<div>${String.fromCharCode(65 + j)}. ${o}</div>`).join('')}</div>` : ''}
          </div>
          <button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="deleteQuestion('${q.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>`;
    }).join('');
  }

  window.deleteQuestion = async function (qId) {
    if (!confirm('Delete this question?')) return;
    try {
      const res = await Api.delete(CONFIG.ENDPOINTS.STAFF_QUESTION_DETAIL(qId));
      if (res.ok || res.status === 204) {
        Ui.toast('Question deleted', 'success');
        loadQuestions();
      } else {
        const parsed = await Api.parse(res);
        Ui.toast(parsed.error || 'Delete failed', 'error');
      }
    } catch (err) { Ui.toast('Failed to delete', 'error'); }
  };

  function updateRemoveButtons() {
    const rows = document.querySelectorAll('#options-list .option-row');
    rows.forEach(r => {
      const btn = r.querySelector('.remove-option');
      if (btn) btn.style.display = rows.length > 2 ? '' : 'none';
    });
  }
})();
