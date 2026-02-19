/**
 * TestVerse - Staff Exams List Page
 * View, search, filter, and delete exams
 */

let currentPage = 1;
let totalPages = 1;
let currentFilters = {
    search: '',
    status: '',
    ordering: '-created_at'
};

document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.requireStaff()) return;

    _initSidebar();
    _initFilters();
    _loadExams();
    _initDeleteModal();
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

// ─── Filters ──────────────────────────────────────────────────────────────

function _initFilters() {
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const sortFilter = document.getElementById('sortFilter');

    // Debounced search
    let searchTimeout;
    searchInput?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentFilters.search = e.target.value.trim();
            currentPage = 1;
            _loadExams();
        }, 500);
    });

    statusFilter?.addEventListener('change', (e) => {
        currentFilters.status = e.target.value;
        currentPage = 1;
        _loadExams();
    });

    sortFilter?.addEventListener('change', (e) => {
        currentFilters.ordering = e.target.value;
        currentPage = 1;
        _loadExams();
    });
}

// ─── Load Exams ───────────────────────────────────────────────────────────

async function _loadExams() {
    const container = document.getElementById('examsGrid');
    if (!container) return;

    // Show loading
    container.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading exams...</p>
        </div>
    `;

    try {
        const params = {
            page: currentPage,
            page_size: 12,
            ordering: currentFilters.ordering
        };

        if (currentFilters.search) params.search = currentFilters.search;
        if (currentFilters.status) params.status = currentFilters.status;

        const res = await Api.get(CONFIG.ENDPOINTS.STAFF_EXAMS, params);
        const { data, error } = await Api.parse(res);

        if (error) {
            container.innerHTML = _renderEmpty('Failed to load exams. Please try again.');
            UI.showAlert('alertContainer', Auth.extractErrorMessage(error), 'error');
            return;
        }

        const exams = data?.results || [];
        totalPages = Math.ceil((data?.count || 0) / 12);

        if (exams.length === 0) {
            const message = currentFilters.search || currentFilters.status
                ? 'No exams found matching your filters'
                : 'No exams yet. Create your first exam to get started!';
            container.innerHTML = _renderEmpty(message);
            _hidePagination();
            return;
        }

        _renderExams(exams);
        _updatePagination();

    } catch (err) {
        console.error('Error loading exams:', err);
        container.innerHTML = _renderEmpty('An error occurred while loading exams');
    }
}

// ─── Render Exams ─────────────────────────────────────────────────────────

function _renderExams(exams) {
    const container = document.getElementById('examsGrid');
    if (!container) return;

    container.innerHTML = exams.map(exam => {
        const statusClass = exam.status || 'draft';
        const statusText = (exam.status || 'draft').charAt(0).toUpperCase() + (exam.status || 'draft').slice(1);
        
        return `
            <div class="exam-card">
                <div class="exam-card-header">
                    <h3 class="exam-card-title">${UI.escapeHtml(exam.title)}</h3>
                    <span class="exam-status ${statusClass}">${statusText}</span>
                </div>
                
                <div class="exam-card-body">
                    <p class="exam-description">
                        ${exam.description ? UI.escapeHtml(exam.description) : 'No description provided'}
                    </p>
                    
                    <div class="exam-stats">
                        <div class="exam-stat">
                            <i class="fas fa-question-circle"></i>
                            <span>${exam.total_questions || 0} Questions</span>
                        </div>
                        <div class="exam-stat">
                            <i class="fas fa-clock"></i>
                            <span>${exam.duration || 0} min</span>
                        </div>
                        <div class="exam-stat">
                            <i class="fas fa-trophy"></i>
                            <span>${exam.total_marks || 0} marks</span>
                        </div>
                    </div>
                    
                    ${exam.start_time ? `
                        <div class="exam-date">
                            <i class="fas fa-calendar"></i>
                            <span>${_formatDate(exam.start_time)}</span>
                        </div>
                    ` : ''}
                </div>
                
                <div class="exam-card-footer">
                    <a href="exam-edit.html?id=${exam.id}" class="btn btn-sm btn-secondary">
                        <i class="fas fa-edit"></i>
                        Edit
                    </a>
                    <a href="results.html?exam=${exam.id}" class="btn btn-sm btn-secondary">
                        <i class="fas fa-chart-bar"></i>
                        Results
                    </a>
                    <button class="btn btn-sm btn-danger" onclick="window.deleteExam('${exam.id}', '${UI.escapeHtml(exam.title).replace(/'/g, "\\'")}')">
                        <i class="fas fa-trash"></i>
                        Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ─── Pagination ───────────────────────────────────────────────────────────

function _updatePagination() {
    const pagination = document.getElementById('pagination');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const paginationInfo = document.getElementById('paginationInfo');

    if (totalPages <= 1) {
        _hidePagination();
        return;
    }

    pagination.style.display = 'flex';
    
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
    paginationInfo.textContent = `Page ${currentPage} of ${totalPages}`;

    prevBtn.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            _loadExams();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            _loadExams();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };
}

function _hidePagination() {
    const pagination = document.getElementById('pagination');
    if (pagination) pagination.style.display = 'none';
}

// ─── Delete Modal ─────────────────────────────────────────────────────────

let deleteExamId = null;

function _initDeleteModal() {
    const modal = document.getElementById('deleteModal');
    const closeBtn = document.getElementById('modalCloseBtn');
    const cancelBtn = document.getElementById('cancelDeleteBtn');
    const confirmBtn = document.getElementById('confirmDeleteBtn');

    closeBtn?.addEventListener('click', () => _closeDeleteModal());
    cancelBtn?.addEventListener('click', () => _closeDeleteModal());
    confirmBtn?.addEventListener('click', () => _confirmDelete());

    // Close on outside click
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) _closeDeleteModal();
    });
}

window.deleteExam = (examId, examTitle) => {
    deleteExamId = examId;
    const modal = document.getElementById('deleteModal');
    const titleEl = document.getElementById('deleteExamTitle');
    
    if (titleEl) titleEl.textContent = examTitle;
    modal?.classList.add('show');
};

function _closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    modal?.classList.remove('show');
    deleteExamId = null;
}

async function _confirmDelete() {
    if (!deleteExamId) return;

    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const textEl = confirmBtn?.querySelector('.btn-text');
    const loaderEl = confirmBtn?.querySelector('.btn-loader');

    try {
        // Set loading
        if (confirmBtn) confirmBtn.disabled = true;
        if (textEl) textEl.classList.add('hidden');
        if (loaderEl) loaderEl.classList.remove('hidden');

        const res = await Api.del(CONFIG.ENDPOINTS.STAFF_EXAM_DETAIL(deleteExamId));
        const { error } = await Api.parse(res);

        if (error) {
            UI.showAlert('alertContainer', Auth.extractErrorMessage(error), 'error');
            return;
        }

        UI.showAlert('alertContainer', 'Exam deleted successfully', 'success');
        _closeDeleteModal();
        _loadExams();

    } catch (err) {
        console.error('Delete error:', err);
        UI.showAlert('alertContainer', 'Failed to delete exam. Please try again.', 'error');
    } finally {
        // Reset loading
        if (confirmBtn) confirmBtn.disabled = false;
        if (textEl) textEl.classList.remove('hidden');
        if (loaderEl) loaderEl.classList.add('hidden');
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function _renderEmpty(message) {
    return `
        <div class="empty-state" style="grid-column: 1 / -1;">
            <i class="fas fa-inbox"></i>
            <p>${UI.escapeHtml(message)}</p>
        </div>
    `;
}

function _formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
