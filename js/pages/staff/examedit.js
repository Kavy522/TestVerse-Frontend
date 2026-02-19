/**
 * TestVerse - Staff Exam Edit & Question Management
 * Add, edit, delete questions for an exam
 */

let examId = null;
let examData = null;
let questions = [];
let editingQuestionId = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.requireStaff()) return;

    _initSidebar();
    _getExamId();
    _loadExamData();
    _initModals();
});

// ─── Sidebar ──────────────────────────────────────────────────────────────

function _initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mobileToggle = document.getElementById('mobileSidebarToggle');
    const logoutBtn = document.getElementById('logoutBtn');

    mobileToggle?.addEventListener('click', () => {
        sidebar?.classList.toggle('open');
    });

    logoutBtn?.addEventListener('click', () => {
        if (confirm('Are you sure you want to logout?')) {
            Auth.logout();
        }
    });

    // Update user info
    const user = Auth.getUser();
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    
    if (user) {
        const name = user.name || user.username || user.email?.split('@')[0] || 'Staff';
        if (userName) userName.textContent = name;
        if (userAvatar) {
            userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;
        }
    }
}

// ─── Get Exam ID from URL ─────────────────────────────────────────────────

function _getExamId() {
    const urlParams = new URLSearchParams(window.location.search);
    examId = urlParams.get('id');

    if (!examId) {
        UI.showAlert('alertContainer', 'Exam ID not found. Redirecting...', 'error');
        setTimeout(() => {
            window.location.href = 'exams.html';
        }, 2000);
    }
}

// ─── Load Exam Data ───────────────────────────────────────────────────────

async function _loadExamData() {
    const loadingState = document.getElementById('loadingState');
    const mainContent = document.getElementById('mainContent');

    try {
        // Load exam details
        const res = await Api.get(CONFIG.ENDPOINTS.STAFF_EXAM_DETAIL(examId));
        const { data, error } = await Api.parse(res);

        if (error || !data) {
            UI.showAlert('alertContainer', 'Failed to load exam details', 'error');
            setTimeout(() => window.location.href = 'exams.html', 2000);
            return;
        }

        examData = data;
        _displayExamInfo(data);

        // Load questions
        await _loadQuestions();

        // Show main content
        if (loadingState) loadingState.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';

    } catch (err) {
        console.error('Error loading exam:', err);
        UI.showAlert('alertContainer', 'Failed to load exam. Please try again.', 'error');
    }
}

function _displayExamInfo(exam) {
    const examTitle = document.getElementById('examTitle');
    const examSubject = document.getElementById('examSubject');
    const examDuration = document.getElementById('examDuration');
    const examMarks = document.getElementById('examMarks');

    if (examTitle) examTitle.textContent = exam.title;
    if (examSubject) examSubject.textContent = exam.subject || 'N/A';
    if (examDuration) examDuration.textContent = `${exam.duration || 0} minutes`;
    if (examMarks) examMarks.textContent = `${exam.total_marks || 0} marks`;
}

// ─── Load Questions ───────────────────────────────────────────────────────

async function _loadQuestions() {
    const questionsList = document.getElementById('questionsList');
    const questionCount = document.getElementById('questionCount');

    try {
        const res = await Api.get(CONFIG.ENDPOINTS.STAFF_QUESTIONS(examId));
        const { data, error } = await Api.parse(res);

        if (error) {
            console.error('Error loading questions:', error);
            questions = [];
        } else {
            questions = data?.results || data || [];
        }

        // Update question count
        if (questionCount) questionCount.textContent = questions.length;

        // Render questions
        if (questions.length === 0) {
            questionsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>No questions added yet</p>
                    <button class="btn btn-primary" onclick="document.getElementById('addQuestionBtn').click()">
                        <i class="fas fa-plus"></i>
                        Add Your First Question
                    </button>
                </div>
            `;
        } else {
            questionsList.innerHTML = questions.map((q, index) => _renderQuestionCard(q, index + 1)).join('');
        }

    } catch (err) {
        console.error('Error loading questions:', err);
        questionsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to load questions</p>
            </div>
        `;
    }
}

// ─── Render Question Card ─────────────────────────────────────────────────

function _renderQuestionCard(question, number) {
    const typeMap = {
        mcq: 'MCQ',
        true_false: 'T/F',
        short_answer: 'Short'
    };

    let optionsHtml = '';
    
    if (question.type === 'mcq' && question.options) {
        const options = typeof question.options === 'string' ? JSON.parse(question.options) : question.options;
        optionsHtml = `
            <div class="question-options">
                ${options.map((opt, idx) => `
                    <div class="option-display ${idx === question.correct_option ? 'correct' : ''}">
                        <span class="option-label">${String.fromCharCode(65 + idx)}</span>
                        <span class="option-text">${UI.escapeHtml(opt)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    } else if (question.type === 'true_false') {
        optionsHtml = `
            <div class="question-options">
                <div class="option-display ${question.correct_answer === 'true' || question.correct_answer === true ? 'correct' : ''}">
                    <span class="option-label">✓</span>
                    <span class="option-text">True</span>
                </div>
                <div class="option-display ${question.correct_answer === 'false' || question.correct_answer === false ? 'correct' : ''}">
                    <span class="option-label">✗</span>
                    <span class="option-text">False</span>
                </div>
            </div>
        `;
    }

    return `
        <div class="question-card" data-question-id="${question.id}">
            <div class="question-header">
                <div class="question-number">
                    <span class="question-badge">${number}</span>
                    <span class="question-type-badge ${question.type}">${typeMap[question.type] || 'MCQ'}</span>
                </div>
                <div class="question-actions">
                    <button class="icon-btn-small" onclick="window.editQuestion('${question.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="icon-btn-small danger" onclick="window.deleteQuestion('${question.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="question-content">
                <p class="question-text">${UI.escapeHtml(question.text || question.question_text)}</p>
                ${optionsHtml}
            </div>
            <div class="question-footer">
                <span class="question-marks">
                    <i class="fas fa-trophy"></i>
                    ${question.marks} marks
                </span>
            </div>
        </div>
    `;
}

// ─── Init Modals ──────────────────────────────────────────────────────────

function _initModals() {
    const addQuestionBtn = document.getElementById('addQuestionBtn');
    const questionModal = document.getElementById('questionModal');
    const questionModalClose = document.getElementById('questionModalClose');
    const cancelQuestionBtn = document.getElementById('cancelQuestionBtn');
    const questionForm = document.getElementById('questionForm');
    const questionType = document.getElementById('questionType');

    // Add question button
    addQuestionBtn?.addEventListener('click', () => {
        editingQuestionId = null;
        _resetQuestionForm();
        document.getElementById('questionModalTitle').textContent = 'Add Question';
        questionModal?.classList.add('show');
    });

    // Close modal
    questionModalClose?.addEventListener('click', () => {
        questionModal?.classList.remove('show');
    });

    cancelQuestionBtn?.addEventListener('click', () => {
        questionModal?.classList.remove('show');
    });

    // Close on outside click
    questionModal?.addEventListener('click', (e) => {
        if (e.target === questionModal) {
            questionModal.classList.remove('show');
        }
    });

    // Question type change
    questionType?.addEventListener('change', (e) => {
        _toggleQuestionTypeFields(e.target.value);
    });

    // Form submission
    questionForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await _saveQuestion();
    });

    // Delete modal
    _initDeleteModal();

    // Publish exam button
    document.getElementById('publishExamBtn')?.addEventListener('click', _publishExam);
}

function _toggleQuestionTypeFields(type) {
    const mcqOptions = document.getElementById('mcqOptions');
    const trueFalseOptions = document.getElementById('trueFalseOptions');
    const shortAnswerSection = document.getElementById('shortAnswerSection');

    if (mcqOptions) mcqOptions.style.display = type === 'mcq' ? 'block' : 'none';
    if (trueFalseOptions) trueFalseOptions.style.display = type === 'true_false' ? 'block' : 'none';
    if (shortAnswerSection) shortAnswerSection.style.display = type === 'short_answer' ? 'block' : 'none';
}

function _resetQuestionForm() {
    const form = document.getElementById('questionForm');
    form?.reset();
    
    // Reset to MCQ by default
    document.getElementById('questionType').value = 'mcq';
    _toggleQuestionTypeFields('mcq');
    
    // Check first option by default
    const firstRadio = document.getElementById('optionRadio0');
    if (firstRadio) firstRadio.checked = true;
}

// ─── Save Question ────────────────────────────────────────────────────────

async function _saveQuestion() {
    const questionText = document.getElementById('questionText')?.value.trim();
    const questionMarks = parseInt(document.getElementById('questionMarks')?.value);
    const questionType = document.getElementById('questionType')?.value;
    const questionExplanation = document.getElementById('questionExplanation')?.value.trim();

    // Validate basic fields
    if (!questionText || !questionMarks || questionMarks < 1) {
        UI.showAlert('alertContainer', 'Please fill in all required fields', 'error');
        return;
    }

    let payload = {
        text: questionText,
        marks: questionMarks,
        type: questionType,
        explanation: questionExplanation || ''
    };

    // Build payload based on question type
    if (questionType === 'mcq') {
        const options = [
            document.getElementById('option0')?.value.trim(),
            document.getElementById('option1')?.value.trim(),
            document.getElementById('option2')?.value.trim(),
            document.getElementById('option3')?.value.trim()
        ].filter(opt => opt !== '');

        if (options.length < 2) {
            UI.showAlert('alertContainer', 'Please provide at least 2 options', 'error');
            return;
        }

        const correctOption = parseInt(document.querySelector('input[name="correctOption"]:checked')?.value);
        if (correctOption === undefined || correctOption >= options.length) {
            UI.showAlert('alertContainer', 'Please select the correct option', 'error');
            return;
        }

        payload.options = options;
        payload.correct_option = correctOption;

    } else if (questionType === 'true_false') {
        const tfAnswer = document.querySelector('input[name="trueFalseAnswer"]:checked')?.value;
        if (!tfAnswer) {
            UI.showAlert('alertContainer', 'Please select True or False', 'error');
            return;
        }
        payload.correct_answer = tfAnswer;

    } else if (questionType === 'short_answer') {
        const shortAnswer = document.getElementById('shortAnswer')?.value.trim();
        if (!shortAnswer) {
            UI.showAlert('alertContainer', 'Please provide expected answer', 'error');
            return;
        }
        payload.expected_answer = shortAnswer;
    }

    _setQuestionLoading(true);

    try {
        let res;
        if (editingQuestionId) {
            // Update existing question
            res = await Api.put(
                CONFIG.ENDPOINTS.STAFF_QUESTIONS(examId) + `${editingQuestionId}/`,
                payload
            );
        } else {
            // Create new question
            res = await Api.post(CONFIG.ENDPOINTS.STAFF_QUESTIONS(examId), payload);
        }

        const { data, error } = await Api.parse(res);

        if (error) {
            UI.showAlert('alertContainer', Auth.extractErrorMessage(error), 'error');
            return;
        }

        UI.showAlert('alertContainer', 
            editingQuestionId ? 'Question updated successfully' : 'Question added successfully', 
            'success');
        
        document.getElementById('questionModal')?.classList.remove('show');
        await _loadQuestions();

    } catch (err) {
        console.error('Save question error:', err);
        UI.showAlert('alertContainer', 'Failed to save question. Please try again.', 'error');
    } finally {
        _setQuestionLoading(false);
    }
}

function _setQuestionLoading(loading) {
    const btn = document.getElementById('saveQuestionBtn');
    if (!btn) return;

    const textEl = btn.querySelector('.btn-text');
    const loaderEl = btn.querySelector('.btn-loader');

    btn.disabled = loading;
    if (textEl) textEl.classList.toggle('hidden', loading);
    if (loaderEl) loaderEl.classList.toggle('hidden', !loading);
}

// ─── Edit Question ────────────────────────────────────────────────────────

window.editQuestion = async (questionId) => {
    editingQuestionId = questionId;
    const question = questions.find(q => q.id == questionId);
    
    if (!question) return;

    // Fill form with question data
    document.getElementById('questionText').value = question.text || question.question_text || '';
    document.getElementById('questionMarks').value = question.marks || 1;
    document.getElementById('questionType').value = question.type || 'mcq';
    document.getElementById('questionExplanation').value = question.explanation || '';

    _toggleQuestionTypeFields(question.type);

    if (question.type === 'mcq' && question.options) {
        const options = typeof question.options === 'string' ? JSON.parse(question.options) : question.options;
        options.forEach((opt, idx) => {
            const input = document.getElementById(`option${idx}`);
            if (input) input.value = opt;
        });
        
        const correctRadio = document.getElementById(`optionRadio${question.correct_option}`);
        if (correctRadio) correctRadio.checked = true;

    } else if (question.type === 'true_false') {
        const tfValue = String(question.correct_answer).toLowerCase();
        const radio = document.getElementById(tfValue === 'true' ? 'tfTrue' : 'tfFalse');
        if (radio) radio.checked = true;

    } else if (question.type === 'short_answer') {
        document.getElementById('shortAnswer').value = question.expected_answer || '';
    }

    document.getElementById('questionModalTitle').textContent = 'Edit Question';
    document.getElementById('questionModal')?.classList.add('show');
};

// ─── Delete Question ──────────────────────────────────────────────────────

let deleteQuestionId = null;

function _initDeleteModal() {
    const deleteModal = document.getElementById('deleteQuestionModal');
    const deleteModalClose = document.getElementById('deleteModalClose');
    const cancelDeleteBtn = document.getElementById('cancelDeleteQuestionBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteQuestionBtn');

    deleteModalClose?.addEventListener('click', () => {
        deleteModal?.classList.remove('show');
    });

    cancelDeleteBtn?.addEventListener('click', () => {
        deleteModal?.classList.remove('show');
    });

    confirmDeleteBtn?.addEventListener('click', _confirmDeleteQuestion);

    deleteModal?.addEventListener('click', (e) => {
        if (e.target === deleteModal) {
            deleteModal.classList.remove('show');
        }
    });
}

window.deleteQuestion = (questionId) => {
    deleteQuestionId = questionId;
    document.getElementById('deleteQuestionModal')?.classList.add('show');
};

async function _confirmDeleteQuestion() {
    if (!deleteQuestionId) return;

    const confirmBtn = document.getElementById('confirmDeleteQuestionBtn');
    const textEl = confirmBtn?.querySelector('.btn-text');
    const loaderEl = confirmBtn?.querySelector('.btn-loader');

    try {
        if (confirmBtn) confirmBtn.disabled = true;
        if (textEl) textEl.classList.add('hidden');
        if (loaderEl) loaderEl.classList.remove('hidden');

        const res = await Api.del(
            CONFIG.ENDPOINTS.STAFF_QUESTIONS(examId) + `${deleteQuestionId}/`
        );
        const { error } = await Api.parse(res);

        if (error) {
            UI.showAlert('alertContainer', Auth.extractErrorMessage(error), 'error');
            return;
        }

        UI.showAlert('alertContainer', 'Question deleted successfully', 'success');
        document.getElementById('deleteQuestionModal')?.classList.remove('show');
        await _loadQuestions();

    } catch (err) {
        console.error('Delete error:', err);
        UI.showAlert('alertContainer', 'Failed to delete question', 'error');
    } finally {
        if (confirmBtn) confirmBtn.disabled = false;
        if (textEl) textEl.classList.remove('hidden');
        if (loaderEl) loaderEl.classList.add('hidden');
    }
}

// ─── Publish Exam ─────────────────────────────────────────────────────────

async function _publishExam() {
    if (questions.length === 0) {
        UI.showAlert('alertContainer', 'Please add at least one question before publishing', 'warning');
        return;
    }

    if (!confirm('Are you sure you want to publish this exam? Students will be able to take it.')) {
        return;
    }

    try {
        const res = await Api.patch(CONFIG.ENDPOINTS.STAFF_EXAM_DETAIL(examId), {
            status: 'published'
        });

        const { data, error } = await Api.parse(res);

        if (error) {
            UI.showAlert('alertContainer', Auth.extractErrorMessage(error), 'error');
            return;
        }

        UI.showAlert('alertContainer', 'Exam published successfully!', 'success');
        examData.status = 'published';

    } catch (err) {
        console.error('Publish error:', err);
        UI.showAlert('alertContainer', 'Failed to publish exam', 'error');
    }
}
