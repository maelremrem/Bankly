// dashboard-admin.js - Admin dashboard functionality

const API_BASE = '';

// Disable HTMX auto-scroll globally to prevent nav clicks from jumping the page
if (window.htmx && window.htmx.config) {
    // Prevent HTMX from auto-scrolling boosted links into view
    window.htmx.config.scrollIntoViewOnBoost = false;
    // Prevent focus actions from causing scroll jump
    window.htmx.config.defaultFocusScroll = false;
}

// Update active menu link based on current URL
function updateActiveMenuLink() {
    const currentPath = window.location.pathname;
    const menuLinks = document.querySelectorAll('.menu-links a');
    
    menuLinks.forEach(link => {
        const linkPath = link.getAttribute('href');
        if (linkPath === currentPath) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

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
    window.location.href = `/login.html?next=${encodeURIComponent(window.location.pathname)}`;
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
        return { success: false, error: t('messages.unauthorized', 'Unauthorized') };
    }

    try {
        return await response.json();
    } catch (error) {
        console.error('Invalid JSON response', error);
        return { success: false, error: t('messages.invalidResponse', 'Invalid response') };
    }
}

function translateValidationMessage(err) {
    if (!err) return '';
    const path = err.path;
    const msg = (err.msg || err.message || '').toString();
    const norm = msg.toLowerCase();

    // Field-specific rules
    if (path === 'password' && norm.includes('at least 6')) return t('errors.passwordTooShort') || msg;
    if (path === 'username' && norm.includes('at least 3')) return t('errors.usernameTooShort') || msg;

    // Generic matches
    if (norm.includes('username already exists')) return t('errors.usernameExists') || msg;

    // fallback
    return msg;
}

function formatErrorMessage(message) {
    if (!message) return '';
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) {
        const msgs = message.map((m) => {
            if (!m) return '';
            if (typeof m === 'string') return m;
            const translated = translateValidationMessage(m);
            if (m.path) return `${m.path}: ${translated}`;
            return translated || m.msg || m.message || m.error || JSON.stringify(m);
        }).filter(Boolean);
        return msgs.join(', ');
    }
    if (typeof message === 'object') {
        if (message.msg) return translateValidationMessage(message) || message.msg;
        if (message.message) return message.message;
        if (message.error) return formatErrorMessage(message.error);
        try { return JSON.stringify(message); } catch (e) { return String(message); }
    }
    return String(message);
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    const text = formatErrorMessage(message);
    toast.textContent = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// Button spinner helpers (id is the button element id)
function showBtnSpinner(btnId) {
    try {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.disabled = true;
        const spinner = btn.querySelector('.btn-spinner');
        const text = btn.querySelector('.btn-text');
        if (spinner) spinner.classList.remove('hidden');
        if (text) text.classList.add('hidden');
    } catch (err) {
        console.warn('showBtnSpinner failed', err);
    }
}

function hideBtnSpinner(btnId) {
    try {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.disabled = false;
        const spinner = btn.querySelector('.btn-spinner');
        const text = btn.querySelector('.btn-text');
        if (spinner) spinner.classList.add('hidden');
        if (text) text.classList.remove('hidden');
    } catch (err) {
        console.warn('hideBtnSpinner failed', err);
    }
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
    const currency = (window.BANKLY_CONFIG && window.BANKLY_CONFIG.currency) ? String(window.BANKLY_CONFIG.currency) : '$';
    const n = Number(amount || 0).toFixed(2);
    try {
        const pattern = (window.BANKLY_CONFIG && window.BANKLY_CONFIG.currencyPattern) ? String(window.BANKLY_CONFIG.currencyPattern) : null;
        if (pattern && (pattern.includes('%v') || pattern.includes('%c'))) {
            return pattern.replace('%v', n).replace('%c', currency);
        }
    } catch (e) {}
    if (String(currency).length <= 2) return `${currency}${n}`;
    return `${n} ${currency}`;
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

/**
 * showConfirmModal(message) -> Promise<boolean>
 * Opens a confirmation modal and resolves to true if user confirms, false otherwise.
 */
function showConfirmModal(message) {
    return new Promise((resolve) => {
        // Do not show empty confirmation dialogs
        if (!message || String(message).trim() === '') {
            resolve(false);
            return;
        }

        const modal = document.getElementById('confirmModal');
        if (!modal) {
            resolve(false);
            return;
        }
        const body = modal.querySelector('.confirm-body');
        const yesBtn = modal.querySelector('[data-action="confirm-yes"]');
        const noBtn = modal.querySelector('[data-action="confirm-no"]');
        const closeBtn = modal.querySelector('[data-action="close"]');

        if (body) body.textContent = message;

        function cleanup() {
            if (yesBtn) yesBtn.removeEventListener('click', onYes);
            if (noBtn) noBtn.removeEventListener('click', onNo);
            if (closeBtn) closeBtn.removeEventListener('click', onNo);
            modal.removeEventListener('click', onBackdropClick);
            closeModal('confirmModal');
        }

        function onYes() { cleanup(); resolve(true); }
        function onNo() { cleanup(); resolve(false); }

        function onBackdropClick(e) {
            if (e.target === modal) {
                onNo();
            }
        }

        if (yesBtn) yesBtn.addEventListener('click', onYes);
        if (noBtn) noBtn.addEventListener('click', onNo);
        if (closeBtn) closeBtn.addEventListener('click', onNo);
        modal.addEventListener('click', onBackdropClick);

        openModal('confirmModal');
    });
}

// Prompt modal (input) - returns string or null if cancelled
function showPromptModal(message, defaultValue = '') {
    return new Promise((resolve) => {
        const modal = document.getElementById('promptModal');
        if (!modal) {
            resolve(null);
            return;
        }
        const body = modal.querySelector('.prompt-body');
        const input = modal.querySelector('#promptModalInput');
        const okBtn = modal.querySelector('[data-action="prompt-ok"]');
        const cancelBtn = modal.querySelector('[data-action="prompt-cancel"]');

        if (body) body.textContent = message;
        if (input) {
            input.value = defaultValue == null ? '' : String(defaultValue);
            setTimeout(() => input.focus(), 0);
        }

        function cleanup() {
            if (okBtn) okBtn.removeEventListener('click', onOk);
            if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
            if (input) input.removeEventListener('keydown', onKey);
            modal.removeEventListener('click', onBackdrop);
            closeModal('promptModal');
        }

        function onOk() { cleanup(); resolve(input ? input.value : ''); }
        function onCancel() { cleanup(); resolve(null); }
        function onKey(e) { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel(); }
        function onBackdrop(e) { if (e.target === modal) onCancel(); }

        if (okBtn) okBtn.addEventListener('click', onOk);
        if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
        if (input) input.addEventListener('keydown', onKey);
        modal.addEventListener('click', onBackdrop);

        openModal('promptModal');
    });
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
    refreshSection('#depositsBody', 'refreshDeposits');
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
                    <button data-action="approve-completion" data-id="${completion.id}">
                        <span class="btn-icon">✅</span>
                        <span>${escapeHtml(t('common.approve'))}</span>
                    </button>
                    <button class="danger" data-action="reject-completion" data-id="${completion.id}">
                        <span class="btn-icon">✖</span>
                        <span>${escapeHtml(t('common.reject'))}</span>
                    </button>
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

async function loadDeposits() {
    const response = await apiCall('/api/deposits');
    if (!response.success) {
        showToast(t('messages.loadFailed'));
        return;
    }
    state.deposits = response.data || [];
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
        rejected: { label: t('common.rejected'), className: 'danger' },
        cancelled: { label: t('common.cancelled'), className: 'neutral' }
    };
    const entry = map[status] || { label: status, className: 'neutral' };
    return `<span class="tag ${entry.className}">${escapeHtml(entry.label)}</span>`;
}

function bindEvents() {
    // Language is now controlled via server default (.env) and per-user preference. Top-bar selector removed.


    const logout = document.getElementById('logout');
    bindOnce(logout, 'click', async (event) => {
        event.preventDefault();
        await apiCall('/auth/logout', { method: 'POST' });
        redirectToLogin();
    });

    // Prevent nav clicks from causing unwanted scroll jumps: save scroll position before HTMX navigation
    const menuLinks = document.querySelector('.menu-links');
    bindOnce(menuLinks, 'click', (event) => {
        const link = event.target.closest('a');
        if (!link) return;
        try {
            const url = new URL(link.href, window.location.origin);
            // Only preserve scroll for internal links
            if (url.origin === window.location.origin) {
                state._savedScroll = window.scrollY;
            }
        } catch (err) {
            // ignore malformed URLs
        }
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

    const taskGenerateBtn = document.getElementById('taskGenerateBtn');
    bindOnce(taskGenerateBtn, 'click', generateDefaultTasks);

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

    const depositClearBtn = document.getElementById('depositClearBtn');
    bindOnce(depositClearBtn, 'click', () => {
        const depositStatusFilter = document.getElementById('depositStatusFilter');
        if (depositStatusFilter) depositStatusFilter.value = '';
        refreshSection('#depositsBody', 'refreshDeposits');
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
    const advanceRejectForm = document.getElementById('advanceRejectForm');
    bindOnce(advanceRejectForm, 'submit', handleAdvanceRejectSubmit);
    const depositRejectForm = document.getElementById('depositRejectForm');
    if (depositRejectForm) bindOnce(depositRejectForm, 'submit', handleDepositRejectSubmit);

async function handleDepositRejectSubmit(evt) {
    evt.preventDefault();
    const id = document.getElementById('depositRejectId').value;
    const reason = document.getElementById('depositRejectReason').value;
    try {
        const res = await apiCall(`/api/deposits/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
        if (res && res.success) {
            showToast(t('messages.saved'));
            await loadDeposits();
            refreshSection('#depositsBody', 'refreshDeposits');
            closeModal('depositRejectModal');
        } else {
            showToast(res && res.error ? res.error : t('messages.networkError'));
        }
    } catch (err) {
        console.error('Deposit reject failed', err);
        showToast(t('messages.networkError'));
    }
}

    const usersTable = document.getElementById('usersTable');
    bindOnce(usersTable, 'click', handleUsersTableClick);
    const tasksTable = document.getElementById('tasksTable');
    bindOnce(tasksTable, 'click', handleTasksTableClick);
    const allowancesTable = document.getElementById('allowancesTable');
    bindOnce(allowancesTable, 'click', handleAllowancesTableClick);
    const advancesTable = document.getElementById('advancesTable');
    bindOnce(advancesTable, 'click', handleAdvancesTableClick);
    const depositsTable = document.getElementById('depositsTable');
    bindOnce(depositsTable, 'click', handleDepositsTableClick);
    const transactionsTable = document.getElementById('transactionsTable');
    bindOnce(transactionsTable, 'click', handleTransactionsTableClick);
    const reversalsTable = document.getElementById('reversalsTable');
    bindOnce(reversalsTable, 'click', handleReversalsTableClick);
    const taskCompletionsBody = document.getElementById('taskCompletionsBody');
    bindOnce(taskCompletionsBody, 'click', handleCompletionsTableClick);

    if (!state.eventsBound.htmx) {
        document.body.addEventListener('htmx:afterSwap', (event) => {
            if (window.htmx && event.target) {
                window.htmx.process(event.target);
            }
            if (window.i18n) {
                window.i18n.applyTranslations(event.target);
            }
            // Restore scroll if we saved it when clicking a nav link to avoid jump
            if (typeof state._savedScroll !== 'undefined') {
                window.scrollTo(0, state._savedScroll);
                delete state._savedScroll;
            }
            if (event.target && event.target.id === 'pageContent') {
                updateThemeLabel(document.documentElement.getAttribute('data-theme'));
                updateActiveMenu();
                updatePageTitle();
                bindEvents();
                refreshAllSections();
                void loadDashboard();
            }

                    // If overview cards were swapped, initialize the stats charts and summary
            if (event.target && event.target.id === 'overviewCards') {
                const periodSelect = document.getElementById('statsPeriod');
                const days = periodSelect ? Number(periodSelect.value) || 30 : 30;

                // show loader while charts load
                showStatsLoader();
                Promise.all([
                    loadTransactionsChart(days),
                    loadBalancesChart(10),
                    loadAllowancesChart(6)
                ]).then(() => {
                    hideStatsLoader();
                }).catch(() => {
                    hideStatsLoader();
                });

                // update summaries
                apiCall('/api/admin/overview').then((res) => {
                    if (res && res.success && res.data) {
                        const pAdv = document.getElementById('pendingAdvancesCount');
                        const pComp = document.getElementById('pendingCompletionsCount');
                        const avg = document.getElementById('averageAllowance');
                        if (pAdv) pAdv.textContent = res.data.pendingAdvances || 0;
                        if (pComp) pComp.textContent = res.data.pendingCompletions || 0;
                        if (avg) avg.textContent = formatCurrency(res.data.averageAllowance || 0);
                    }
                }).catch(() => {});

                if (periodSelect) {
                    periodSelect.addEventListener('change', () => {
                        const d = Number(periodSelect.value) || 30;
                        showStatsLoader();
                        loadTransactionsChart(d).then(() => hideStatsLoader()).catch(() => hideStatsLoader());
                    });
                }
            }
        });

        // Intercept htmx confirm prompts and use the app modal (prevent native confirm)
        document.body.addEventListener('htmx:confirm', (evt) => {
            try {
                const payload = evt.detail || {};
                const question = payload && payload.question ? String(payload.question) : '';


                // If question empty, prevent default behavior (which would call native confirm with empty text)
                if (!question || question.trim() === '') {
                    if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
                    if (payload && typeof payload.issueRequest === 'function') payload.issueRequest(false);
                    return;
                }

                // Prevent default handling and show our modal for non-empty questions
                if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();

                showConfirmModal(question).then((ok) => {
                    if (ok && payload && typeof payload.issueRequest === 'function') {
                        payload.issueRequest(true);
                    } else if (payload && typeof payload.issueRequest === 'function') {
                        payload.issueRequest(false);
                    }
                });
            } catch (err) {
                console.warn('htmx confirm handler failed', err);
            }
        });

        // Intercept htmx prompt requests and use app prompt modal
        document.body.addEventListener('htmx:prompt', (evt) => {
            try {
                const payload = evt.detail || {};
                const question = payload.prompt || '';
                if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();

                // If the question is empty, cancel the prompt to avoid showing an empty modal
                if (!question || String(question).trim() === '') {
                    if (payload && typeof payload.issueRequest === 'function') payload.issueRequest(null);
                    return;
                }

                showPromptModal(question, payload.default || '').then((value) => {
                    // If null, user cancelled
                    if (payload && typeof payload.issueRequest === 'function') {
                        // issueRequest expects the prompt value (or null to cancel)
                        payload.issueRequest(value);
                    }
                });
            } catch (err) {
                console.warn('htmx prompt handler failed', err);
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

            // Delegated handler for generate default tasks button in case binding missed
            const genBtn = event.target.closest && event.target.closest('[data-action="generate-default-tasks"]');
            if (genBtn) {
                event.preventDefault();
                generateDefaultTasks();
            }
        });
        state.eventsBound.documentClick = true;
    }

    // Initialize tabs for tasks page
    initTabs();

    // Load initial data for approvals tab if we're on tasks page
    if (document.getElementById('taskCompletionsBody')) {
        window.htmx.ajax('GET', '/api/tasks/completions/pending/html', { target: '#taskCompletionsBody', swap: 'innerHTML' });
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
    // Populate cooldown if present
    const cooldownEl = document.getElementById('taskCooldown');
    if (cooldownEl) cooldownEl.value = task && (task.cooldown_seconds !== undefined && task.cooldown_seconds !== null) ? String(task.cooldown_seconds) : '';
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

function openDepositRejectModal(depositId) {
    const f = document.getElementById('depositRejectForm');
    if (!f) return;
    f.reset();
    const hid = document.getElementById('depositRejectId');
    if (hid) hid.value = depositId;
    openModal('depositRejectModal');
}

async function handleUserSubmit(event) {
    event.preventDefault();
    const btnId = 'userSaveBtn';
    const userId = document.getElementById('userId').value;
    const username = document.getElementById('userUsername').value.trim();
    const password = document.getElementById('userPassword').value.trim();
    const pin = (document.getElementById('userPin') && document.getElementById('userPin').value) ? document.getElementById('userPin').value.trim() : null;
    const role = document.getElementById('userRole').value;
    const language = document.getElementById('userLanguage').value;

    if (!username) return;

    // Only require password when creating an admin user
    if (!userId && role === 'admin' && !password) {
        showToast(t('messages.passwordRequired'));
        return;
    }

    const payload = { username, role, language };
    if (password) payload.password = password;
    if (pin) payload.pin = pin;

    try {
        showBtnSpinner(btnId);
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
    } finally {
        hideBtnSpinner(btnId);
    }
}

async function handleTaskSubmit(event) {
    event.preventDefault();
    const btnId = 'taskSaveBtn';
    const taskId = document.getElementById('taskId').value;
    const name = document.getElementById('taskName').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const reward = parseFloat(document.getElementById('taskReward').value || 0);
    const cooldownVal = document.getElementById('taskCooldown') ? document.getElementById('taskCooldown').value : '';
    const requiresApproval = document.getElementById('taskApproval').checked;

    if (!name) return;

    const payload = {
        name,
        description,
        reward_amount: reward,
        requires_approval: requiresApproval
    };

    if (cooldownVal !== null && cooldownVal !== undefined && String(cooldownVal).trim() !== '') {
        payload.cooldown_seconds = Number(cooldownVal);
    } else {
        // allow null to clear existing value when editing
        if (document.getElementById('taskId').value) payload.cooldown_seconds = null;
    }

    try {
        showBtnSpinner(btnId);
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
    } finally {
        hideBtnSpinner(btnId);
    }
}

async function generateDefaultTasks() {
    const btn = document.getElementById('taskGenerateBtn');
    const confirmMessage = t('messages.confirmGenerateDefaultTasks');
    const ok = await showConfirmModal(confirmMessage);
    if (!ok) return;

    const language = (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') ? window.i18n.getCurrentLanguage() : 'en';

    try {
        if (btn) showBtnSpinner('taskGenerateBtn');
        showToast(t('messages.generatingTasks'));
        console.log('Generating default tasks (lang=', language, ')');
        const response = await apiCall('/api/tasks/generate-default', {
            method: 'POST',
            body: JSON.stringify({ language })
        });

        if (!response || !response.success) {
            showToast(response && response.error ? response.error : t('messages.networkError'));
            return;
        }

        showToast(response.message || t('messages.tasksGeneratedSuccess'));
        refreshSection('#tasksBody', 'refreshTasks');
    } catch (err) {
        console.error('Error generating default tasks', err);
        showToast(t('messages.networkError'));
    } finally {
        if (btn) hideBtnSpinner('taskGenerateBtn');
    }
}

async function handleAllowanceSubmit(event) {
    event.preventDefault();
    const btnId = 'allowanceSaveBtn';
    const allowanceId = document.getElementById('allowanceId').value;
    const userId = Number(document.getElementById('allowanceUser').value);
    const amount = parseFloat(document.getElementById('allowanceAmount').value || 0);
    const frequency = document.getElementById('allowanceFrequency').value;
    const enabled = document.getElementById('allowanceEnabled').checked;

    const payload = allowanceId
        ? { amount, frequency, enabled }
        : { userId, amount, frequency, enabled };

    try {
        showBtnSpinner(btnId);
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
    } finally {
        hideBtnSpinner(btnId);
    }
}

async function handleTransactionSubmit(event) {
    event.preventDefault();
    const btnId = 'transactionSaveBtn';
    const userId = Number(document.getElementById('transactionUser').value);
    const amount = parseFloat(document.getElementById('transactionAmount').value || 0);
    const type = document.getElementById('transactionType').value.trim();
    const description = document.getElementById('transactionDescription').value.trim();

    const payload = { userId, amount, type, description };
    try {
        showBtnSpinner(btnId);
        const response = await apiCall('/api/transactions', { method: 'POST', body: JSON.stringify(payload) });

        if (!response.success) {
            showToast(response.error || t('messages.networkError'));
            return;
        }

        closeModal('transactionModal');
        showToast(t('messages.saved'));
        await loadTransactions();
        await loadUsers();
    } finally {
        hideBtnSpinner(btnId);
    }
    refreshSection('#transactionsBody', 'refreshTransactions');
    refreshSection('#reversalsBody', 'refreshReversals');
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
        const ok = await showConfirmModal(t('messages.confirmDeleteUser'));
        if (!ok) return;
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
        const ok = await showConfirmModal(t('messages.confirmDeleteTask'));
        if (!ok) return;
        const response = await apiCall(`/api/tasks/${id}`, { method: 'DELETE' });
        if (response.success) {
            showToast(t('messages.deleted'));
            await loadTasks();
            refreshSection('#tasksBody', 'refreshTasks');
        } else {
            showToast(response.error || t('messages.networkError'));
        }
    }
}

async function handleCompletionsTableClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.getAttribute('data-action');
    const id = button.getAttribute('data-id');

    if (action === 'approve-completion') {
        const ok = await showConfirmModal(t('messages.confirmApproveTask'));
        if (!ok) return;
        const response = await apiCall(`/api/tasks/completions/${id}/approve`, {
            method: 'POST',
            body: JSON.stringify({ approved: true, review_notes: '' })
        });
        if (response.success) {
            showToast(t('messages.taskApproved'));
            // Refresh the approvals tab content
            if (window.htmx) {
                window.htmx.ajax('GET', '/api/tasks/completions/pending/html', { target: '#taskCompletionsBody', swap: 'innerHTML' });
            }
        } else {
            showToast(response.error || t('messages.networkError'));
        }
    }

    if (action === 'reject-completion') {
        const ok = await showConfirmModal(t('messages.confirmRejectTask'));
        if (!ok) return;
        const response = await apiCall(`/api/tasks/completions/${id}/approve`, {
            method: 'POST',
            body: JSON.stringify({ approved: false, review_notes: '' })
        });
        if (response.success) {
            showToast(t('messages.taskRejected'));
            // Refresh the approvals tab content
            if (window.htmx) {
                window.htmx.ajax('GET', '/api/tasks/completions/pending/html', { target: '#taskCompletionsBody', swap: 'innerHTML' });
            }
        } else {
            showToast(response.error || t('messages.networkError'));
        }
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
        const ok = await showConfirmModal(t('messages.confirmDeleteAllowance'));
        if (!ok) return;
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

    if (action === 'approve-deposit') {
        const response = await apiCall(`/api/deposits/${id}/approve`, { method: 'POST' });
        if (response.success) {
            showToast(t('messages.saved'));
            await loadDeposits();
            refreshSection('#depositsBody', 'refreshDeposits');
            await loadTransactions();
            await loadUsers();
        } else {
            showToast(response.error || t('messages.networkError'));
        }
    }

    if (action === 'reject-deposit') {
        openDepositRejectModal(id);
    }
}

async function handleDepositsTableClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.getAttribute('data-action');
    const id = button.getAttribute('data-id');

    if (action === 'approve-deposit') {
        const response = await apiCall(`/api/deposits/${id}/approve`, { method: 'POST' });
        if (response.success) {
            showToast(t('messages.saved'));
            await loadDeposits();
            refreshSection('#depositsBody', 'refreshDeposits');
            await loadTransactions();
            await loadUsers();
        } else {
            showToast(response.error || t('messages.networkError'));
        }
    }

    if (action === 'reject-deposit') {
        openDepositRejectModal(id);
    }
}

async function handleTransactionsTableClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.getAttribute('data-action');
    const id = button.getAttribute('data-id');

    if (action === 'reverse-transaction') {
        const ok = await showConfirmModal(t('messages.confirmReverseTransaction'));
        if (!ok) return;
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
        const ok = await showConfirmModal(t('messages.confirmUndoReversal'));
        if (!ok) return;
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

let transactionsChart = null;
let balancesChart = null;
let allowancesChart = null;

function showStatsLoader() {
    const loader = document.getElementById('statsLoader');
    if (!loader) return;
    loader.classList.remove('hidden');
}

function hideStatsLoader() {
    const loader = document.getElementById('statsLoader');
    if (!loader) return;
    loader.classList.add('hidden');
}

async function loadTransactionsChart(days = 30) {
    const canvas = document.getElementById('transactionsChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const res = await apiCall(`/api/admin/overview/transactions/daily?days=${days}`);
    if (!res.success) {
        console.warn('Failed to load daily transactions');
        return;
    }

    const rows = res.data || [];
    const map = {};
    rows.forEach((r) => {
        map[r.day] = { count: Number(r.count || 0), total: Number(r.total || 0) };
    });

    const labels = [];
    const counts = [];
    const totals = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const iso = d.toISOString().slice(0, 10);
        labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        const item = map[iso] || { count: 0, total: 0 };
        counts.push(item.count);
        totals.push(item.total);
    }

    if (!transactionsChart) {
        const ctx = canvas.getContext('2d');
        transactionsChart = new Chart(ctx, {
            data: {
                labels,
                datasets: [
                    {
                        type: 'bar',
                        label: t('dashboard.admin.overview.txCount', 'Transactions'),
                        data: counts,
                        backgroundColor: 'rgba(54,162,235,0.6)',
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: t('dashboard.admin.overview.txAmount', 'Amount'),
                        data: totals,
                        borderColor: 'rgba(255,99,132,1)',
                        backgroundColor: 'rgba(255,99,132,0.2)',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    y: {
                        type: 'linear',
                        position: 'left',
                        title: { display: true, text: t('dashboard.admin.overview.count', 'Count') }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: t('dashboard.admin.overview.amount', 'Amount') }
                    }
                }
            }
        });
    } else {
        transactionsChart.data.labels = labels;
        transactionsChart.data.datasets[0].data = counts;
        transactionsChart.data.datasets[1].data = totals;
        transactionsChart.update();
    }
}

async function loadBalancesChart(limit = 10) {
    const canvas = document.getElementById('balancesChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const res = await apiCall(`/api/admin/overview/balances/top?limit=${limit}`);
    if (!res.success) {
        console.warn('Failed to load balances');
        return;
    }

    const rows = res.data || [];
    const labels = rows.map(r => r.username);
    const data = rows.map(r => Number(r.balance || 0));

    if (!balancesChart) {
        balancesChart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: { labels, datasets: [{ label: t('dashboard.admin.overview.topBalances','Top Balances'), data, backgroundColor: 'rgba(75,192,192,0.6)'}] },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });
    } else {
        balancesChart.data.labels = labels;
        balancesChart.data.datasets[0].data = data;
        balancesChart.update();
    }
}

async function loadAllowancesChart(months = 6) {
    const canvas = document.getElementById('allowancesChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const res = await apiCall(`/api/admin/overview/allowances/monthly?months=${months}`);
    if (!res.success) {
        console.warn('Failed to load allowances');
        return;
    }

    const rows = res.data || [];
    const labels = rows.map(r => r.month);
    const data = rows.map(r => Number(r.total || 0));

    if (!allowancesChart) {
        allowancesChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels, datasets: [{ label: t('dashboard.admin.overview.allowancesMonthly','Allowances'), data, borderColor: 'rgba(153,102,255,1)', backgroundColor: 'rgba(153,102,255,0.2)'}] },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });
    } else {
        allowancesChart.data.labels = labels;
        allowancesChart.data.datasets[0].data = data;
        allowancesChart.update();
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
    // If the overview cards were just loaded, try to draw the chart
    try {
        await loadTransactionsChart(30);
    } catch (err) {
        console.warn('Error loading transactions chart', err);
    }
}

async function init() {
    const me = await ensureAdmin();
    if (!me) return;
    let defaultLang = 'en';
    try {
        const res = await fetch('/api/config');
        if (res.ok) {
            const json = await res.json();
            defaultLang = json.defaultLanguage || defaultLang;
        }
    } catch (err) { /* ignore */ }
    await window.i18n.init(me.language || defaultLang);
    window.i18n.applyTranslations();
    updatePageTitle();
    initTheme();
    updateCurrentUserLabel();
    bindEvents();
    updateActiveMenu();
    await loadDashboard();
}

document.addEventListener('DOMContentLoaded', init);

// Initialize tabs (show/hide sections) for tasks page
function initTabs() {
    const tabs = Array.from(document.querySelectorAll('.tab-btn'));
    if (!tabs.length) return; // not on a tabbed page
    const contents = Array.from(document.querySelectorAll('.tab-content'));
    function activate(name) {
        tabs.forEach(b => {
            const active = b.dataset.tab === name;
            b.classList.toggle('active', active);
            b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        contents.forEach(c => {
            // ensure the active tab content is shown; inline style overrides the .tab-content rule
            if (c.id === ('tab-' + name)) {
                c.style.display = 'block';
            } else {
                c.style.display = 'none';
            }
        });
        const visible = document.getElementById('tab-' + name);
        if (visible && window.i18n && typeof window.i18n.applyTranslations === 'function') window.i18n.applyTranslations(visible);
        // Load data for approvals tab
        if (name === 'approvals') {
            window.htmx.ajax('GET', '/api/tasks/completions/pending/html', { target: '#taskCompletionsBody', swap: 'innerHTML' });
        }
        // Load data for history tab
        if (name === 'history') {
            window.htmx.ajax('GET', '/api/tasks/completions/html', { target: '#taskHistoryBody', swap: 'innerHTML' });
        }
    }
    tabs.forEach(b => b.addEventListener('click', () => activate(b.dataset.tab)));
    // default - only activate approvals if no tab is currently active
    const hasActiveTab = tabs.some(b => b.classList.contains('active'));
    if (tabs.length && !hasActiveTab) {
        activate('approvals');
    }
}

// Re-initialize tabs and update active menu after HTMX navigation
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    updateActiveMenuLink();
});
if (window.htmx) {
    document.addEventListener('htmx:afterSwap', (event) => {
        // Only re-init if we're on a page with tabs
        if (document.querySelectorAll('.tab-btn').length > 0) {
            initTabs();
        }
        // Always update active menu link after navigation
        updateActiveMenuLink();
    });
}