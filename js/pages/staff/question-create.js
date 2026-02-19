/**
 * Staff Question Create / Edit Page
 * Handles creating and editing questions for an exam
 */
(function () {
  if (!Auth.requireStaff()) return;

  const $ = (s) => document.getElementById(s);
  const params = new URLSearchParams(window.location.search);
  const examId = params.get('exam');
  const questionId = params.get('id');
  const isEdit = !!questionId;

  const user = Auth.getUser();
  if (user) {
    const el = $('userName');
    if (el) el.textContent = user.name || user.email;
    const av = $('userAvatar');
    if (av) av.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'S')}&background=6366f1&color=fff`;
  }

  // Sidebar
  const sidebar = $('sidebar');
  const t1 = $('sidebarToggle');
  const t2 = $('mobileSidebarToggle');
  if (t1) t1.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
  if (t2) t2.addEventListener('click', () => sidebar.classList.toggle('mobile-open'));
  const logoutBtn = $('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());

  if (isEdit) $('pageTitle').textContent = 'Edit Question';

  let options = ['', ''];
  renderOptions();

  // Question type change
  $('questionType').addEventListener('change', (e) => {
    const type = e.target.value;
    $('mcqSection').style.display = (type === 'mcq' || type === 'multiple_mcq') ? '' : 'none';
    $('descriptiveSection').style.display = type === 'descriptive' ? '' : 'none';
    $('codingSection').style.display = type === 'coding' ? '' : 'none';
    renderCorrectAnswerSection();
  });

  // Add option
  $('addOptionBtn').addEventListener('click', () => {
    options.push('');
    renderOptions();
  });

  // Form submit
  $('questionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const type = $('questionType').value;
    const payload = {
      type,
      text: $('questionText').value.trim(),
      points: parseInt($('questionPoints').value) || 1,
    };

    if (type === 'mcq' || type === 'multiple_mcq') {
      const optInputs = document.querySelectorAll('.option-input');
      payload.options = Array.from(optInputs).map((inp) => inp.value.trim()).filter(Boolean);

      if (type === 'mcq') {
        const selected = document.querySelector('input[name="correctAnswer"]:checked');
        payload.correct_answer = selected ? parseInt(selected.value) : 0;
      } else {
        const checked = document.querySelectorAll('input[name="correctAnswers"]:checked');
        payload.correct_answers = Array.from(checked).map((c) => parseInt(c.value));
      }
    } else if (type === 'descriptive') {
      payload.model_answer = $('modelAnswer')?.value?.trim();
    } else if (type === 'coding') {
      payload.language = $('codingLanguage')?.value;
      payload.sample_input = $('sampleInput')?.value?.trim();
      payload.sample_output = $('sampleOutput')?.value?.trim();
    }

    try {
      let res;
      if (isEdit) {
        res = await Api.put(CONFIG.ENDPOINTS.STAFF_QUESTION_DETAIL(questionId), payload);
      } else if (examId) {
        res = await Api.post(CONFIG.ENDPOINTS.STAFF_QUESTIONS(examId), payload);
      } else {
        Ui.toast('No exam ID provided', 'error');
        return;
      }

      const parsed = await Api.parse(res);
      if (parsed.error) {
        Ui.toast(typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error), 'error');
      } else {
        Ui.toast(isEdit ? 'Question updated!' : 'Question created!', 'success');
        setTimeout(() => {
          window.location.href = `questions.html?exam=${examId || parsed.data?.exam}`;
        }, 1000);
      }
    } catch (err) {
      Ui.toast('Failed to save question', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Save Question';
    }
  });

  // Load question data if editing
  if (isEdit) loadQuestion();

  async function loadQuestion() {
    try {
      const res = await Api.get(CONFIG.ENDPOINTS.STAFF_QUESTION_DETAIL(questionId));
      const { data, error } = await Api.parse(res);
      if (error || !data) return;

      $('questionType').value = data.type || 'mcq';
      $('questionText').value = data.text || '';
      $('questionPoints').value = data.points || 1;

      if (data.options) {
        options = data.options;
        renderOptions();
      }
      if (data.model_answer) $('modelAnswer').value = data.model_answer;
      if (data.language) $('codingLanguage').value = data.language;
      if (data.sample_input) $('sampleInput').value = data.sample_input;
      if (data.sample_output) $('sampleOutput').value = data.sample_output;

      // Trigger type change to show correct sections
      $('questionType').dispatchEvent(new Event('change'));

      // Set correct answers after rendering
      if (data.correct_answer !== undefined && data.type === 'mcq') {
        const radio = document.querySelector(`input[name="correctAnswer"][value="${data.correct_answer}"]`);
        if (radio) radio.checked = true;
      }
      if (data.correct_answers && data.type === 'multiple_mcq') {
        data.correct_answers.forEach((idx) => {
          const cb = document.querySelector(`input[name="correctAnswers"][value="${idx}"]`);
          if (cb) cb.checked = true;
        });
      }
    } catch (err) {
      console.error('Load question failed', err);
    }
  }

  function renderOptions() {
    const container = $('optionsList');
    container.innerHTML = options.map((opt, i) => `
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;">
        <span style="min-width:1.5rem;font-weight:600;color:var(--color-text-secondary);">${String.fromCharCode(65 + i)}.</span>
        <input type="text" class="form-input option-input" value="${opt}" placeholder="Option ${String.fromCharCode(65 + i)}" data-idx="${i}" style="flex:1;">
        ${options.length > 2 ? `<button type="button" class="btn btn-ghost" style="padding:.25rem .5rem;color:var(--color-danger);" onclick="removeOption(${i})"><i class="fas fa-times"></i></button>` : ''}
      </div>
    `).join('');

    // Listen for changes
    container.querySelectorAll('.option-input').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        options[parseInt(e.target.dataset.idx)] = e.target.value;
      });
    });

    renderCorrectAnswerSection();
  }

  // Expose removeOption globally
  window.removeOption = function (idx) {
    options.splice(idx, 1);
    renderOptions();
  };

  function renderCorrectAnswerSection() {
    const container = $('correctAnswerSection');
    const type = $('questionType').value;
    if (type === 'mcq') {
      container.innerHTML = options.map((_, i) => `
        <label style="display:flex;align-items:center;gap:.5rem;margin-bottom:.25rem;">
          <input type="radio" name="correctAnswer" value="${i}">
          Option ${String.fromCharCode(65 + i)}
        </label>
      `).join('');
    } else if (type === 'multiple_mcq') {
      container.innerHTML = options.map((_, i) => `
        <label style="display:flex;align-items:center;gap:.5rem;margin-bottom:.25rem;">
          <input type="checkbox" name="correctAnswers" value="${i}">
          Option ${String.fromCharCode(65 + i)}
        </label>
      `).join('');
    }
  }
})();
