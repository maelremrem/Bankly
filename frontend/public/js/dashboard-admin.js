// dashboard-admin.js - Admin dashboard functionality

const API_BASE = '';

const state = {
    currentUser: null,
    overview: null,
    users: [],
    tasks: [],
    allowances: [],
    advances: [],
    transactions: [],
    reversals: [],
    pendingCompletionsCount: 0,
    eventsBound: {
        htmx: false,
        documentClick: false
    },
    filters: {
        usersSearch: '',
        advancesStatus: '',
        transactions: {
            userId: '',
            type: '',
            startDate: '',
            endDate: ''
        }
    }
};

function t(key, fallback = '') {
    if (window.i18n && typeof window.i18n.t === 'function') {
        return window.i18n.t(key, fallback);
    }
    return fallback || key;
}

function redirectToLogin() {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
}

async function apiCall(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    });

    if (response.status === 401) {
        redirectToLogin();
        return { success: false, error: 'Unauthorized' };
    }

    try {
        return await response.json();
    } catch (error) {
        console.error('Invalid JSON response', error);
        return { success: false, error: 'Invalid response' };
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatCurrency(amount) {
    if (window.utils && typeof window.utils.formatCurrency === 'function') {
        return window.utils.formatCurrency(amount);
    }
    return `$${Number(amount || 0).toFixed(2)}`;
}

function formatDateTime(value) {
    if (window.utils && typeof window.utils.formatDateTime === 'function') {
        return window.utils.formatDateTime(value);
    }
    return new Date(value).toLocaleString();
}

function formatDate(value) {
    if (window.utils && typeof window.utils.formatDate === 'function') {
        return window.utils.formatDate(value);
    }
    return new Date(value).toLocaleDateString();
}

function bindOnce(element, eventName, handler) {
    if (!element) return;
    const key = `bound${eventName}`;
    if (element.dataset[key]) return;
    element.addEventListener(eventName, handler);
    element.dataset[key] = 'true';
}

function updateActiveMenu() {
    const links = document.querySelectorAll('.menu-links a');
    if (!links.length) return;
    const currentPath = window.location.pathname;
    links.forEach((link) => {
        const linkPath = new URL(link.href, window.location.origin).pathname;
        if (linkPath === currentPath) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}

async function ensureAdmin() {
    try {
        const res = await fetch('/auth/me', { credentials: 'same-origin' });
        if (!res.ok) {
            redirectToLogin();
            return null;
        }
        const data = await res.json();
        if (!data.success || data.data.role !== 'admin') {
            redirectToLogin();
            return null;
        }
        state.currentUser = data.data;
        return data.data;
    } catch (error) {
        console.error('Auth check failed', error);
        redirectToLogin();
        return null;
    }
}

function updateCurrentUserLabel() {
    const el = document.getElementById('currentUser');
    if (!el || !state.currentUser) return;
    const roleLabel = t(`roles.${state.currentUser.role}`, state.currentUser.role);
    el.textContent = `${state.currentUser.username} • ${roleLabel}`;
}

function updateThemeLabel(theme) {
    const label = document.getElementById('themeModeLabel');
    if (!label) return;
    const isDark = theme === 'dark';
    label.setAttribute('data-i18n', isDark ? 'theme.dark' : 'theme.light');
    label.textContent = t(isDark ? 'theme.dark' : 'theme.light');
}

function updatePageTitle() {
    const baseTitle = t('dashboard.admin.pageTitle', document.title);
    const heading = document.querySelector('main h2');
    const headingText = heading ? heading.textContent.trim() : '';
    document.title = headingText ? `${baseTitle} - ${headingText}` : baseTitle;
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bankly_theme', theme);
    updateThemeLabel(theme);
}

function initTheme() {
    const stored = localStorage.getItem('bankly_theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');
    const toggle = document.getElementById('themeToggle');
    applyTheme(theme);
    if (toggle) {
        toggle.checked = theme === 'dark';
        toggle.addEventListener('change', () => {
            applyTheme(toggle.checked ? 'dark' : 'light');
        });
    }
}

function refreshUsersTable() {
    if (!window.htmx) return;
    const target = document.querySelector('#usersBody');
    if (!target) return;
    window.htmx.trigger(target, 'refreshUsers');
}

function refreshSection(targetId, eventName) {
    if (!window.htmx) return;
    const target = document.querySelector(targetId);
    if (!target) return;
    window.htmx.trigger(target, eventName);
}

function refreshAllSections() {
    refreshUsersTable();
    refreshSection('#tasksBody', 'refreshTasks');
    refreshSection('#allowancesBody', 'refreshAllowances');
    refreshSection('#advancesBody', 'refreshAdvances');
    refreshSection('#transactionsBody', 'refreshTransactions');
    refreshSection('#reversalsBody', 'refreshReversals');
}


async function loadUsers() {
    const params = new URLSearchParams();
    params.set('limit', '200');
    if (state.filters.usersSearch) {
        params.set('search', state.filters.usersSearch);
    }

    const response = await apiCall(`/api/users?${params.toString()}`);
    if (!response.success) {
        showToast(t('messages.loadFailed'));
        return;
    }
    state.users = response.data.users || [];
    updateUserSelects();
}

async function loadTasks() {
    const response = await apiCall('/api/tasks');
    if (!response.success) {
        showToast(t('messages.loadFailed'));
        return;
    }
    state.tasks = response.data || [];
    await loadPendingCompletionsCount();
}

async function loadPendingCompletionsCount() {
    if (!state.tasks.length) {
        state.pendingCompletionsCount = 0;
        return;
    }

    const results = await Promise.all(
        state.tasks.map((task) => apiCall(`/api/tasks/${task.id}/completions`))
    );

    let total = 0;
    results.forEach((res) => {
        if (!res || !res.success || !Array.isArray(res.data)) return;
        total += res.data.filter((item) => item.status === 'pending').length;
    });
    state.pendingCompletionsCount = total;
}

async function loadTaskCompletions(taskId) {
    const response = await apiCall(`/api/tasks/${taskId}/completions`);
    const body = document.getElementById('taskCompletionsBody');
    const panel = document.getElementById('taskCompletionsPanel');
    if (!response.success || !body || !panel) {
        showToast(t('messages.loadFailed'));
        return;
    }

    panel.classList.remove('hidden');

    const completions = response.data || [];
    if (!completions.length) {
        body.innerHTML = `<tr><td colspan="5">${escapeHtml(t('common.noData'))}</td></tr>`;
        return;
    }

    body.innerHTML = completions
        .map((completion) => {
            const statusTag = getStatusTag(completion.status);
            const actions = completion.status === 'pending'
                ? `
                    <button data-action="approve-completion" data-id="${completion.id}">${escapeHtml(t('common.approve'))}</button>
                    <button class="danger" data-action="reject-completion" data-id="${completion.id}">${escapeHtml(t('common.reject'))}</button>
                `
                : '';
            return `
                <tr>
                    <td>${escapeHtml(completion.username || '')}</td>
                    <td>${escapeHtml(completion.task_name || '')}</td>
                    <td>${statusTag}</td>
                    <td>${escapeHtml(formatDateTime(completion.submitted_at || completion.created_at))}</td>
                    <td><div class="table-actions">${actions}</div></td>
                </tr>
            `;
        })
        .join('');
}

async function loadAllowances() {
    const response = await apiCall('/api/allowances');
    if (!response.success) {
        showToast(t('messages.loadFailed'));
        return;
    }
    state.allowances = response.data || [];
}

async function loadAdvances() {
    const params = new URLSearchParams();
    if (state.filters.advancesStatus) {
        params.set('status', state.filters.advancesStatus);
    }
    const response = await apiCall(`/api/advances?${params.toString()}`);
    if (!response.success) {
        showToast(t('messages.loadFailed'));
        return;
    }
    state.advances = response.data || [];
}

async function loadTransactions() {
    const params = new URLSearchParams();
    params.set('limit', '50');
    if (state.filters.transactions.userId) params.set('userId', state.filters.transactions.userId);
    if (state.filters.transactions.type) params.set('type', state.filters.transactions.type);
    if (state.filters.transactions.startDate) params.set('startDate', state.filters.transactions.startDate);
    if (state.filters.transactions.endDate) params.set('endDate', state.filters.transactions.endDate);

    const response = await apiCall(`/api/transactions?${params.toString()}`);
    if (!response.success) {
        showToast(t('messages.loadFailed'));
        return;
    }
    state.transactions = response.data.transactions || [];
}

async function loadReversals() {
    const response = await apiCall('/api/transactions/reversals?limit=50');
    if (!response.success) {
        showToast(t('messages.loadFailed'));
        return;
    }
    state.reversals = response.data.reversals || response.data || [];
}

function updateUserSelects() {
    const users = state.users;
    const allowanceSelect = document.getElementById('allowanceUser');
    const transactionSelect = document.getElementById('transactionUser');
    const transactionFilter = document.getElementById('transactionUserFilter');

    const options = users
        .map((user) => `<option value="${user.id}">${escapeHtml(user.username)}</option>`)
        .join('');

    if (allowanceSelect) {
        allowanceSelect.innerHTML = options;
    }

    if (transactionSelect) {
        transactionSelect.innerHTML = options;
    }

    if (transactionFilter) {
        const allOption = `<option value="">${escapeHtml(t('common.filter'))}</option>`;
        transactionFilter.innerHTML = allOption + options;
    }
}

function getStatusTag(status) {
    const map = {
        pending: { label: t('common.pending'), className: 'warning' },
        approved: { label: t('common.approved'), className: 'success' },
        rejected: { label: t('common.rejected'), className: 'danger' }
    };
    const entry = map[status] || { label: status, className: 'neutral' };
    return `<span class="tag ${entry.className}">${escapeHtml(entry.label)}</span>`;
}

function bindEvents() {
    const languageSelect = document.getElementById('languageSelect');
    bindOnce(languageSelect, 'change', async (event) => {
        await window.i18n.setLanguage(event.target.value);
        window.i18n.applyTranslations();
        updateThemeLabel(document.documentElement.getAttribute('data-theme'));
        refreshUsersTable();
        refreshSection('#tasksBody', 'refreshTasks');
        refreshSection('#allowancesBody', 'refreshAllowances');
        refreshSection('#advancesBody', 'refreshAdvances');
        refreshSection('#transactionsBody', 'refreshTransactions');
        refreshSection('#reversalsBody', 'refreshReversals');
    });

    const logout = document.getElementById('logout');
    bindOnce(logout, 'click', async (event) => {
        event.preventDefault();
        await apiCall('/auth/logout', { method: 'POST' });
        redirectToLogin();
    });

    const userClearBtn = document.getElementById('userClearBtn');
    bindOnce(userClearBtn, 'click', () => {
        const userSearch = document.getElementById('userSearch');
        if (userSearch) userSearch.value = '';
        refreshUsersTable();
    });

    const userCreateBtn = document.getElementById('userCreateBtn');
    bindOnce(userCreateBtn, 'click', () => openUserModal());

    const taskCreateBtn = document.getElementById('taskCreateBtn');
    bindOnce(taskCreateBtn, 'click', () => openTaskModal());

    const allowanceCreateBtn = document.getElementById('allowanceCreateBtn');
    bindOnce(allowanceCreateBtn, 'click', () => openAllowanceModal());

    const transactionCreateBtn = document.getElementById('transactionCreateBtn');
    bindOnce(transactionCreateBtn, 'click', () => openTransactionModal());

    const advanceClearBtn = document.getElementById('advanceClearBtn');
    bindOnce(advanceClearBtn, 'click', () => {
        const advanceStatusFilter = document.getElementById('advanceStatusFilter');
        if (advanceStatusFilter) advanceStatusFilter.value = '';
        refreshSection('#advancesBody', 'refreshAdvances');
    });

    const transactionClearBtn = document.getElementById('transactionClearBtn');
    bindOnce(transactionClearBtn, 'click', () => {
        const transactionUserFilter = document.getElementById('transactionUserFilter');
        if (transactionUserFilter) transactionUserFilter.value = '';
        const transactionTypeFilter = document.getElementById('transactionTypeFilter');
        if (transactionTypeFilter) transactionTypeFilter.value = '';
        const transactionStart = document.getElementById('transactionStart');
        if (transactionStart) transactionStart.value = '';
        const transactionEnd = document.getElementById('transactionEnd');
        if (transactionEnd) transactionEnd.value = '';
        refreshSection('#transactionsBody', 'refreshTransactions');
    });

    const closeCompletions = document.getElementById('closeCompletions');
    bindOnce(closeCompletions, 'click', () => {
        const panel = document.getElementById('taskCompletionsPanel');
        if (panel) panel.classList.add('hidden');
    });

    const userForm = document.getElementById('userForm');
    bindOnce(userForm, 'submit', handleUserSubmit);
    const taskForm = document.getElementById('taskForm');
    bindOnce(taskForm, 'submit', handleTaskSubmit);
    const allowanceForm = document.getElementById('allowanceForm');
    bindOnce(allowanceForm, 'submit', handleAllowanceSubmit);
    const transactionForm = document.getElementById('transactionForm');
    bindOnce(transactionForm, 'submit', handleTransactionSubmit);
    const taskReviewForm = document.getElementById('taskReviewForm');
    bindOnce(taskReviewForm, 'submit', handleTaskReviewSubmit);
    const advanceRejectForm = document.getElementById('advanceRejectForm');
    bindOnce(advanceRejectForm, 'submit', handleAdvanceRejectSubmit);

    const usersTable = document.getElementById('usersTable');
    bindOnce(usersTable, 'click', handleUsersTableClick);
    const tasksTable = document.getElementById('tasksTable');
    bindOnce(tasksTable, 'click', handleTasksTableClick);
    const allowancesTable = document.getElementById('allowancesTable');
    bindOnce(allowancesTable, 'click', handleAllowancesTableClick);
    const advancesTable = document.getElementById('advancesTable');
    bindOnce(advancesTable, 'click', handleAdvancesTableClick);
    const transactionsTable = document.getElementById('transactionsTable');
    bindOnce(transactionsTable, 'click', handleTransactionsTableClick);
    const reversalsTable = document.getElementById('reversalsTable');
    bindOnce(reversalsTable, 'click', handleReversalsTableClick);
    const taskCompletionsPanel = document.getElementById('taskCompletionsPanel');
    bindOnce(taskCompletionsPanel, 'click', handleCompletionsTableClick);

    if (!state.eventsBound.htmx) {
        document.body.addEventListener('htmx:afterSwap', (event) => {
            if (window.htmx && event.target) {
                window.htmx.process(event.target);
            }
            if (window.i18n) {
                window.i18n.applyTranslations(event.target);
            }
            if (event.target && event.target.id === 'pageContent') {
                updateThemeLabel(document.documentElement.getAttribute('data-theme'));
                updateActiveMenu();
                updatePageTitle();
                bindEvents();
                refreshAllSections();
                void loadDashboard();
            }
        });
        state.eventsBound.htmx = true;
    }

    if (!state.eventsBound.documentClick) {
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (target.matches('[data-action="close"]')) {
                closeModal(target.getAttribute('data-target'));
            }
            if (target.classList.contains('modal')) {
                closeModal(target.id);
            }
        });
        state.eventsBound.documentClick = true;
    }
}

function openUserModal(user = null) {
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = user ? user.id : '';
    document.getElementById('userUsername').value = user ? user.username : '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userRole').value = user ? user.role : 'user';
    document.getElementById('userLanguage').value = user ? user.language || 'en' : 'en';
    document.getElementById('userModalTitle').textContent = user
        ? `${t('common.edit')} ${t('dashboard.admin.users.title')}`
        : t('dashboard.admin.users.create');
    openModal('userModal');
}

function openTaskModal(task = null) {
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = task ? task.id : '';
    document.getElementById('taskName').value = task ? task.name : '';
    document.getElementById('taskDescription').value = task ? task.description || '' : '';
    document.getElementById('taskReward').value = task ? task.reward_amount : '';
    document.getElementById('taskApproval').checked = task ? Boolean(task.requires_approval) : true;
    document.getElementById('taskModalTitle').textContent = task
        ? `${t('common.edit')} ${t('dashboard.admin.tasks.title')}`
        : t('dashboard.admin.tasks.create');
    openModal('taskModal');
}

function openAllowanceModal(allowance = null) {
    document.getElementById('allowanceForm').reset();
    document.getElementById('allowanceId').value = allowance ? allowance.id : '';
    document.getElementById('allowanceUser').value = allowance ? allowance.user_id : state.users[0]?.id || '';
    document.getElementById('allowanceAmount').value = allowance ? allowance.amount : '';
    document.getElementById('allowanceFrequency').value = allowance ? allowance.frequency : 'weekly';
    document.getElementById('allowanceEnabled').checked = allowance ? Boolean(allowance.enabled) : true;
    document.getElementById('allowanceModalTitle').textContent = allowance
        ? `${t('common.edit')} ${t('dashboard.admin.allowances.title')}`
        : t('dashboard.admin.allowances.create');
    openModal('allowanceModal');
}

function openTransactionModal() {
    document.getElementById('transactionForm').reset();
    document.getElementById('transactionType').value = 'manual';
    openModal('transactionModal');
}

function openTaskReviewModal(completionId, approved) {
    document.getElementById('taskReviewForm').reset();
    document.getElementById('reviewCompletionId').value = completionId;
    document.getElementById('reviewApproved').value = approved ? 'true' : 'false';
    openModal('taskReviewModal');
}

function openAdvanceRejectModal(advanceId) {
    document.getElementById('advanceRejectForm').reset();
    document.getElementById('advanceRejectId').value = advanceId;
    openModal('advanceRejectModal');
}

async function handleUserSubmit(event) {
    event.preventDefault();
    const userId = document.getElementById('userId').value;
    const username = document.getElementById('userUsername').value.trim();
    const password = document.getElementById('userPassword').value.trim();
    const role = document.getElementById('userRole').value;
    const language = document.getElementById('userLanguage').value;

    if (!username) return;

    if (!userId && !password) {
        showToast(t('messages.passwordRequired'));
        return;
    }

    const payload = { username, role, language };
    if (password) payload.password = password;

    const response = userId
        ? await apiCall(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiCall('/api/users', { method: 'POST', body: JSON.stringify({ ...payload, password }) });

    if (!response.success) {
        showToast(response.error || t('messages.networkError'));
        return;
    }

    closeModal('userModal');
    showToast(t('messages.saved'));
    await loadUsers();
    refreshUsersTable();
}

async function handleTaskSubmit(event) {
    event.preventDefault();
    const taskId = document.getElementById('taskId').value;
    const name = document.getElementById('taskName').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const reward = parseFloat(document.getElementById('taskReward').value || 0);
    const requiresApproval = document.getElementById('taskApproval').checked;

    if (!name) return;

    const payload = {
        name,
        description,
        reward_amount: reward,
        requires_approval: requiresApproval
    };

    const response = taskId
        ? await apiCall(`/api/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiCall('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });

    if (!response.success) {
        showToast(response.error || t('messages.networkError'));
        return;
    }

    closeModal('taskModal');
    showToast(t('messages.saved'));
    await loadTasks();
    refreshSection('#tasksBody', 'refreshTasks');
}

async function handleAllowanceSubmit(event) {
    event.preventDefault();
    const allowanceId = document.getElementById('allowanceId').value;
    const userId = Number(document.getElementById('allowanceUser').value);
    const amount = parseFloat(document.getElementById('allowanceAmount').value || 0);
    const frequency = document.getElementById('allowanceFrequency').value;
    const enabled = document.getElementById('allowanceEnabled').checked;

    const payload = allowanceId
        ? { amount, frequency, enabled }
        : { userId, amount, frequency, enabled };

    const response = allowanceId
        ? await apiCall(`/api/allowances/${allowanceId}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiCall('/api/allowances', { method: 'POST', body: JSON.stringify(payload) });

    if (!response.success) {
        showToast(response.error || t('messages.networkError'));
        return;
    }

    closeModal('allowanceModal');
    showToast(t('messages.saved'));
    await loadAllowances();
    refreshSection('#allowancesBody', 'refreshAllowances');
}

async function handleTransactionSubmit(event) {
    event.preventDefault();
    const userId = Number(document.getElementById('transactionUser').value);
    const amount = parseFloat(document.getElementById('transactionAmount').value || 0);
    const type = document.getElementById('transactionType').value.trim();
    const description = document.getElementById('transactionDescription').value.trim();

    const payload = { userId, amount, type, description };
    const response = await apiCall('/api/transactions', { method: 'POST', body: JSON.stringify(payload) });

    if (!response.success) {
        showToast(response.error || t('messages.networkError'));
        return;
    }

    closeModal('transactionModal');
    showToast(t('messages.saved'));
    await loadTransactions();
    await loadUsers();
    refreshSection('#transactionsBody', 'refreshTransactions');
    refreshSection('#reversalsBody', 'refreshReversals');
}

async function handleTaskReviewSubmit(event) {
    event.preventDefault();
    const completionId = document.getElementById('reviewCompletionId').value;
    const approved = document.getElementById('reviewApproved').value === 'true';
    const reviewNotes = document.getElementById('reviewNotes').value.trim();

    const payload = { approved, review_notes: reviewNotes };
    const response = await apiCall(`/api/tasks/completions/${completionId}/approve`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if (!response.success) {
        showToast(response.error || t('messages.networkError'));
        return;
    }

    closeModal('taskReviewModal');
    showToast(t('messages.saved'));
    await loadTasks();
    refreshSection('#tasksBody', 'refreshTasks');
    const completionBody = document.getElementById('taskCompletionsBody');
    const taskId = completionBody ? completionBody.dataset.taskId : null;
    if (window.htmx && taskId) {
        window.htmx.ajax('GET', `/api/tasks/${taskId}/completions/html`, { target: '#taskCompletionsBody', swap: 'innerHTML' });
    }
}

async function handleAdvanceRejectSubmit(event) {
    event.preventDefault();
    const advanceId = document.getElementById('advanceRejectId').value;
    const reason = document.getElementById('advanceRejectReason').value.trim();
    const response = await apiCall(`/api/advances/${advanceId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason })
    });

    if (!response.success) {
        showToast(response.error || t('messages.networkError'));
        return;
    }

    closeModal('advanceRejectModal');
    showToast(t('messages.saved'));
    await loadAdvances();
    refreshSection('#advancesBody', 'refreshAdvances');
}

async function handleUsersTableClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.getAttribute('data-action');
    const id = button.getAttribute('data-id');

    if (action === 'edit-user') {
        const user = state.users.find((item) => String(item.id) === id);
        if (user) openUserModal(user);
    }

    if (action === 'delete-user') {
        if (!confirm(t('messages.confirmDeleteUser'))) return;
        const response = await apiCall(`/api/users/${id}`, { method: 'DELETE' });
        if (response.success) {
            showToast(t('messages.deleted'));
            await loadUsers();
            refreshUsersTable();
        } else {
            showToast(response.error || t('messages.networkError'));
        }
    }
}

async function handleTasksTableClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.getAttribute('data-action');
    const id = button.getAttribute('data-id');

    if (action === 'edit-task') {
        const task = state.tasks.find((item) => String(item.id) === id);
        if (task) openTaskModal(task);
    }

    if (action === 'delete-task') {
        if (!confirm(t('messages.confirmDeleteTask'))) return;
        const response = await apiCall(`/api/tasks/${id}`, { method: 'DELETE' });
        if (response.success) {
            showToast(t('messages.deleted'));
            await loadTasks();
            refreshSection('#tasksBody', 'refreshTasks');
        } else {
            showToast(response.error || t('messages.networkError'));
        }
    }

    if (action === 'review-task') {
        const completionBody = document.getElementById('taskCompletionsBody');
        if (completionBody) {
            completionBody.dataset.taskId = id;
        }
        if (window.htmx) {
            window.htmx.ajax('GET', `/api/tasks/${id}/completions/html`, { target: '#taskCompletionsBody', swap: 'innerHTML' });
        } else {
            await loadTaskCompletions(id);
        }
    }
}

async function handleCompletionsTableClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.getAttribute('data-action');
    const id = button.getAttribute('data-id');

    if (action === 'approve-completion') {
        openTaskReviewModal(id, true);
    }

    if (action === 'reject-completion') {
        openTaskReviewModal(id, false);
    }
}

async function handleAllowancesTableClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.getAttribute('data-action');
    const id = button.getAttribute('data-id');

    if (action === 'edit-allowance') {
        const allowance = state.allowances.find((item) => String(item.id) === id);
        if (allowance) openAllowanceModal(allowance);
    }

    if (action === 'delete-allowance') {
        if (!confirm(t('messages.confirmDeleteAllowance'))) return;
        const response = await apiCall(`/api/allowances/${id}`, { method: 'DELETE' });
        if (response.success) {
            showToast(t('messages.deleted'));
            await loadAllowances();
            refreshSection('#allowancesBody', 'refreshAllowances');
        } else {
            showToast(response.error || t('messages.networkError'));
        }
    }
}

async function handleAdvancesTableClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.getAttribute('data-action');
    const id = button.getAttribute('data-id');

    if (action === 'approve-advance') {
        const response = await apiCall(`/api/advances/${id}/approve`, { method: 'POST' });
        if (response.success) {
            showToast(t('messages.saved'));
            await loadAdvances();
            refreshSection('#advancesBody', 'refreshAdvances');
        } else {
            showToast(response.error || t('messages.networkError'));
        }
    }

    if (action === 'reject-advance') {
        openAdvanceRejectModal(id);
    }
}

async function handleTransactionsTableClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.getAttribute('data-action');
    const id = button.getAttribute('data-id');

    if (action === 'reverse-transaction') {
        if (!confirm(t('messages.confirmReverseTransaction'))) return;
        const response = await apiCall(`/api/transactions/${id}/reverse`, { method: 'POST' });
        if (response.success) {
            showToast(t('messages.saved'));
            await loadTransactions();
            await loadReversals();
            await loadUsers();
            refreshSection('#transactionsBody', 'refreshTransactions');
            refreshSection('#reversalsBody', 'refreshReversals');
        } else {
            showToast(response.error || t('messages.networkError'));
        }
    }
}

async function handleReversalsTableClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.getAttribute('data-action');
    const id = button.getAttribute('data-id');

    if (action === 'undo-reversal') {
        if (!confirm(t('messages.confirmUndoReversal'))) return;
        const response = await apiCall(`/api/transactions/reversals/${id}/undo`, { method: 'POST' });
        if (response.success) {
            showToast(t('messages.saved'));
            await loadTransactions();
            await loadReversals();
            await loadUsers();
            refreshSection('#transactionsBody', 'refreshTransactions');
            refreshSection('#reversalsBody', 'refreshReversals');
        } else {
            showToast(response.error || t('messages.networkError'));
        }
    }
}

async function loadDashboard() {
    if (document.getElementById('transactionUserFilter') || document.getElementById('allowanceUser')) {
        await loadUsers();
    }
    if (document.getElementById('tasksTable')) {
        await loadTasks();
    }
    if (document.getElementById('allowancesTable')) {
        await loadAllowances();
    }
}

async function init() {
    const me = await ensureAdmin();
    if (!me) return;
    await window.i18n.init(me.language || undefined);
    window.i18n.applyTranslations();
    updatePageTitle();
    initTheme();
    updateCurrentUserLabel();
    bindEvents();
    updateActiveMenu();
    await loadDashboard();
}

document.addEventListener('DOMContentLoaded', init);