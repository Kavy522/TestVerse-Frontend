/**
 * TestVerse - Staff Create Exam Page
 * Matches API specification exactly
 */

let calculatedDuration = 0;

document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.requireStaff()) return;

    _initSidebar();
    _initForm();
    _setDefaultDates();
    _initDurationCalculator();
});

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

function _setDefaultDates() {
    const startTime = document.getElementById('startTime');
    const endTime = document.getElementById('endTime');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    
    const endDate = new Date(tomorrow);
    endDate.setHours(12, 0, 0, 0);

    if (startTime) startTime.value = _formatDateTimeLocal(tomorrow);
    if (endTime) endTime.value = _formatDateTimeLocal(endDate);

    _calculateDuration();
}

function _formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function _initDurationCalculator() {
    const startTime = document.getElementById('startTime');
    const endTime = document.getElementById('endTime');

    startTime?.addEventListener('change', _calculateDuration);
    endTime?.addEventListener('change', _calculateDuration);
}

function _calculateDuration() {
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    const durationDisplay = document.getElementById('durationDisplay');

    const startTime = startTimeInput?.value;
    const endTime = endTimeInput?.value;

    if (!startTime || !endTime || !durationDisplay) {
        if (durationDisplay) {
            durationDisplay.textContent = 'Not calculated';
        }
        calculatedDuration = 0;
        return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (end <= start) {
        durationDisplay.innerHTML = '<span style="color: #ef4444;">⚠️ End time must be after start time</span>';
        calculatedDuration = 0;
        UI.setFieldError('endTime', 'End time must be after start time');
        if (endTimeInput) {
            endTimeInput.classList.add('error');
        }
        return;
    }

    UI.setFieldError('endTime', '');
    if (endTimeInput) {
        endTimeInput.classList.remove('error');
    }

    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / (1000 * 60));

    calculatedDuration = diffMins;

    const hours = Math.floor(diffMins / 60);
    const minutes = diffMins % 60;

    let durationText = '';
    if (hours > 0) {
        durationText = `${hours} hour${hours > 1 ? 's' : ''}`;
        if (minutes > 0) {
            durationText += ` ${minutes} min`;
        }
    } else {
        durationText = `${minutes} minutes`;
    }

    durationText += ` (${diffMins} minutes total)`;
    durationDisplay.textContent = durationText;
}

function _initForm() {
    const form = document.getElementById('examForm');
    if (!form) return;

    const fields = ['title', 'subject', 'category', 'totalMarks', 'passingMarks', 'startTime', 'endTime'];
    fields.forEach(fieldId => {
        const input = document.getElementById(fieldId);
        input?.addEventListener('blur', () => _validateField(fieldId));
        input?.addEventListener('input', () => {
            UI.setFieldError(fieldId, '');
            if (fieldId === 'startTime' || fieldId === 'endTime') {
                _calculateDuration();
            }
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await _handleSubmit();
    });
}

async function _handleSubmit() {
    UI.clearAlert('alertContainer');

    const title = document.getElementById('title')?.value.trim();
    const description = document.getElementById('description')?.value.trim();
    const subject = document.getElementById('subject')?.value.trim();
    const category = document.getElementById('category')?.value;
    const totalMarks = parseFloat(document.getElementById('totalMarks')?.value);
    const passingMarks = parseFloat(document.getElementById('passingMarks')?.value);
    const startTime = document.getElementById('startTime')?.value;
    const endTime = document.getElementById('endTime')?.value;
    const shuffleQuestions = document.getElementById('shuffleQuestions')?.checked;
    const showResults = document.getElementById('showResults')?.checked;
    const allowReview = document.getElementById('allowReview')?.checked;

    const selectedBranches = Array.from(document.querySelectorAll('.branch-checkbox:checked'))
        .map(cb => cb.value);

    // Validate
    const errors = [
        _validateField('title'),
        _validateField('subject'),
        _validateField('category'),
        _validateField('totalMarks'),
        _validateField('passingMarks'),
        _validateField('startTime'),
        _validateField('endTime'),
        _validateBranches(),
        _validateDateTime(startTime, endTime),
    ];

    if (errors.some(Boolean)) {
        UI.showAlert('alertContainer', 'Please fix the errors highlighted below', 'error');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    if (passingMarks > totalMarks) {
        UI.setFieldError('passingMarks', 'Passing marks cannot exceed total marks');
        UI.showAlert('alertContainer', 'Passing marks cannot exceed total marks', 'error');
        return;
    }

    if (calculatedDuration <= 0) {
        UI.setFieldError('endTime', 'Invalid exam duration');
        UI.showAlert('alertContainer', 'Please set a valid exam duration', 'error');
        return;
    }

    _setLoading(true);

    try {
        // Build payload matching API specification exactly
        const payload = {
            title: title,
            description: description || `${subject} - ${category}`,
            exam_type: category,  // API expects exam_type
            start_time: new Date(startTime).toISOString(),
            end_time: new Date(endTime).toISOString(),
            duration: calculatedDuration,
            total_marks: totalMarks.toString(),
            passing_marks: passingMarks.toString(),
            instructions: `Subject: ${subject}\nShuffle Questions: ${shuffleQuestions ? 'Yes' : 'No'}\nShow Results: ${showResults ? 'Yes' : 'No'}\nAllow Review: ${allowReview ? 'Yes' : 'No'}`,
            allowed_departments: selectedBranches
        };

        console.log('Creating exam with payload:', payload);

        const res = await Api.post(CONFIG.ENDPOINTS.STAFF_EXAMS, payload);
        const { data, error } = await Api.parse(res);

        if (error) {
            _handleApiErrors(error);
            return;
        }

        UI.showAlert('alertContainer', 'Exam created successfully! Redirecting to add questions...', 'success');
        
        setTimeout(() => {
            window.location.href = `examedit.html?id=${data.id}`;
        }, 1500);

    } catch (err) {
        console.error('Create exam error:', err);
        UI.showAlert('alertContainer', 'Network error. Please check your connection.', 'error');
    } finally {
        _setLoading(false);
    }
}

function _validateField(fieldId) {
    const input = document.getElementById(fieldId);
    if (!input) return null;

    const value = input.value;
    let error = null;

    switch (fieldId) {
        case 'title':
            error = UI.validateField(value.trim(), [
                UI.validators.required,
                UI.validators.minLength(5),
                UI.validators.maxLength(255)
            ]);
            break;

        case 'subject':
            error = UI.validateField(value.trim(), [
                UI.validators.required,
                UI.validators.minLength(2),
                UI.validators.maxLength(100)
            ]);
            break;

        case 'category':
            if (!value) {
                error = 'Please select a category';
            }
            break;

        case 'totalMarks':
        case 'passingMarks':
            const num = parseFloat(value);
            if (!value) {
                error = 'This field is required';
            } else if (isNaN(num) || num < 1) {
                error = 'Must be a positive number';
            } else if (num > 10000) {
                error = 'Maximum 10000 marks allowed';
            }
            break;

        case 'startTime':
        case 'endTime':
            if (!value) {
                error = 'This field is required';
            }
            break;
    }

    if (error) {
        UI.setFieldError(fieldId, error);
    } else {
        UI.setFieldValid(fieldId);
    }

    return error;
}

function _validateBranches() {
    const selectedBranches = document.querySelectorAll('.branch-checkbox:checked');
    const errorEl = document.getElementById('branches-error');

    if (selectedBranches.length === 0) {
        if (errorEl) {
            errorEl.textContent = 'Please select at least one branch';
            errorEl.style.display = 'block';
        }
        return 'branches';
    }

    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }
    return null;
}

function _validateDateTime(startTime, endTime) {
    if (!startTime || !endTime) {
        return 'datetime';
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();

    if (start < now) {
        UI.setFieldError('startTime', 'Start time cannot be in the past');
        return 'datetime';
    }

    if (end <= start) {
        UI.setFieldError('endTime', 'End time must be after start time');
        return 'datetime';
    }

    const diffMins = Math.floor((end - start) / (1000 * 60));
    if (diffMins < 5) {
        UI.setFieldError('endTime', 'Exam duration must be at least 5 minutes');
        return 'datetime';
    }

    if (diffMins > 1440) {
        UI.setFieldError('endTime', 'Exam duration cannot exceed 24 hours');
        return 'datetime';
    }

    UI.setFieldError('startTime', '');
    UI.setFieldError('endTime', '');
    return null;
}

function _handleApiErrors(error) {
    if (typeof error !== 'object') {
        UI.showAlert('alertContainer', Auth.extractErrorMessage(error), 'error');
        return;
    }

    const fieldMap = {
        title: 'title',
        description: 'description',
        exam_type: 'category',
        start_time: 'startTime',
        end_time: 'endTime',
        duration: 'endTime',
        total_marks: 'totalMarks',
        passing_marks: 'passingMarks',
        allowed_departments: 'branches'
    };

    const unhandled = [];

    for (const [key, val] of Object.entries(error)) {
        const fieldId = fieldMap[key];
        const msg = Array.isArray(val) ? val.join(' ') : String(val);

        if (fieldId) {
            UI.setFieldError(fieldId, msg);
        } else if (key === 'detail' || key === 'non_field_errors') {
            unhandled.push(msg);
        } else {
            unhandled.push(`${key}: ${msg}`);
        }
    }

    if (unhandled.length) {
        UI.showAlert('alertContainer', unhandled.join(' | '), 'error');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function _setLoading(loading) {
    const btn = document.getElementById('submitBtn');
    if (!btn) return;

    const textEl = btn.querySelector('.btn-text');
    const loaderEl = btn.querySelector('.btn-loader');

    btn.disabled = loading;
    if (textEl) textEl.classList.toggle('hidden', loading);
    if (loaderEl) loaderEl.classList.toggle('hidden', !loading);
}
