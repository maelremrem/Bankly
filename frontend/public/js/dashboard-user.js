// dashboard-user.js - User dashboard functionality

const API_BASE = '';

function t(key, fallback = '') {
    if (window.i18n && typeof window.i18n.t === 'function') return window.i18n.t(key, fallback);
    return fallback || key;
}

function formatErrorMessage(prefix, errorObj, fallbackKey) {
    const prefixText = t(prefix);
    if (errorObj && errorObj.error) return `${prefixText} ${errorObj.error}`;
    return `${prefixText} ${t(fallbackKey)}`;
}

function getCurrency() {
    try {
        if (window.BANKLY_CONFIG && window.BANKLY_CONFIG.currency) return String(window.BANKLY_CONFIG.currency);
    } catch (e) {}
    return '$';
}

function formatCurrency(amount) {
    const currency = getCurrency();
    const n = Number(amount || 0).toFixed(2);
    try {
        const pattern = (window.BANKLY_CONFIG && window.BANKLY_CONFIG.currencyPattern) ? String(window.BANKLY_CONFIG.currencyPattern) : null;
        if (pattern && (pattern.includes('%v') || pattern.includes('%c'))) {
            return pattern.replace('%v', n).replace('%c', currency);
        }
    } catch (e) {
        /* ignore and fallback */
    }
    // Fallback heuristic: short currency treated as symbol prefix
    if (String(currency).length <= 2) return `${currency}${n}`;
    return `${n} ${currency}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// Greeting helper state and updater
let _currentUserForGreeting = null;
function updateBalanceGreeting() {
    try {
        const el = document.getElementById('balanceGreeting');
        if (!el) return;
        if (!_currentUserForGreeting) {
            el.textContent = '';
            return;
        }
        function _getTimeGreetingKey() {
            const h = new Date().getHours();
            return (h >= 18 || h < 6) ? 'dashboard.user.greeting.evening' : 'dashboard.user.greeting.morning';
        }
        const greet = t(_getTimeGreetingKey(), 'Hello');
        el.textContent = `${greet}, ${escapeHtml(_currentUserForGreeting.username)}`;
    } catch (err) { /* ignore */ }
}
// Watch for language changes (document.lang) to refresh greeting
const _greetingLangObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'lang') {
            updateBalanceGreeting();
        }
    }
});
_greetingLangObserver.observe(document.documentElement, { attributes: true });

// Helper function for API calls (send cookies)
async function apiCall(endpoint, options = {}) {
    if (window.utils && typeof window.utils.showGlobalSpinner === 'function') {
        try { window.utils.showGlobalSpinner(); } catch (e) {}
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        if (response.status === 401) {
            window.location.href = `/login.html?next=${encodeURIComponent(window.location.pathname)}`;
            return { success: false, error: 'unauthorized' };
        }

        try {
            return await response.json();
        } catch (err) {
            console.error('Invalid JSON response', err);
            return { success: false, error: 'invalid_response' };
        }
    } catch (err) {
        console.error('Network error', err);
        return { success: false, error: 'network_error' };
    } finally {
        if (window.utils && typeof window.utils.hideGlobalSpinner === 'function') {
            try { window.utils.hideGlobalSpinner(); } catch (e) {}
        }
    }
}

// Ensure user is authenticated
(async function ensureAuthed() {
    try {
        const data = await apiCall('/auth/me');
        if (!data || !data.success) {
            window.location.href = `/login.html?next=${encodeURIComponent(window.location.pathname)}`;
            return;
        }
        // proceed to load dashboard
        loadDashboard();
    } catch (err) {
        console.error('Auth check failed', err);
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
})();

// Load user data
async function loadDashboard() {
    try {
        showUserSkeleton();
        // Get current user info (assuming we have userId in token or fetch /auth/me)
        const userResponse = await apiCall('/auth/me');
        if (!userResponse.success) {
            throw new Error('Failed to get user info');
        }
        const me = userResponse.data;
        const userId = me.id;
        // show current user in header
        try {
            const currentUserEl = document.getElementById('currentUser');
            if (currentUserEl) currentUserEl.textContent = `${escapeHtml(me.username)} • ${t('roles.user','User')}`;
        } catch (err) { /* ignore */ }

        // Set current user for greeting updater (auto updates on language change)
        try {
            _currentUserForGreeting = me;
            updateBalanceGreeting();
        } catch (err) { /* ignore */ }

        // Load balance
        const balanceResponse = await apiCall(`/api/users/${userId}/balance`);
        if (balanceResponse.success) {
            const balanceEl = document.getElementById('balanceContent');
            if (balanceEl) balanceEl.textContent = formatCurrency(balanceResponse.data.balance);
        }

        // Load available tasks
        const tasksResponse = await apiCall('/api/tasks/available');
        if (tasksResponse.success) {
            displayTasks(tasksResponse.data);
        }

        // Load user's advance and deposit requests
        try {
            loadUserMoneyRequests();
        } catch (err) { /* ignore */ }

        // Load recent transactions
        const transactionsResponse = await apiCall(`/api/users/${userId}/transactions?limit=10`);
        if (transactionsResponse && transactionsResponse.success) {
            const rows = transactionsResponse.data && Array.isArray(transactionsResponse.data.transactions)
                ? transactionsResponse.data.transactions
                : [];
            displayTransactions(rows);
        } else {
            displayTransactions([]);
        }

    } catch (error) {
        console.error('Error loading dashboard:', error);
        const balanceEl = document.getElementById('balanceContent');
        if (balanceEl) balanceEl.textContent = t('errors.balanceLoadError', 'Error loading balance');
    } finally {
        // Start idle timer after dashboard loaded
        startIdleTimer();
        hideUserSkeleton();
    }
}

function displayTasks(tasks) {
    const tasksList = document.getElementById('tasksList');
    if (!tasksList) return;
    if (!Array.isArray(tasks) || tasks.length === 0) {
        tasksList.innerHTML = '<p data-i18n="common.noData">No tasks available</p>';
        if (window.i18n && typeof window.i18n.applyTranslations === 'function') window.i18n.applyTranslations(tasksList);
        return;
    }

    tasksList.innerHTML = tasks.map(task => {
        const status = task.my_status || null;
        const statusClassMap = { pending: 'warning', approved: 'success', rejected: 'danger' };
        const statusClass = status ? (statusClassMap[status] || 'neutral') : null;
        const statusTag = status ? `<div style="margin-bottom:0.5rem;"><span class="tag ${statusClass}">${t ? t('common.'+status) : status}</span>${task.my_submitted_at ? ` <small style="margin-left:0.5rem;color:var(--muted);">${escapeHtml(new Date(task.my_submitted_at).toLocaleString())}</small>` : ''}</div>` : '';

        // Cooldown handling
        let cooldownNote = '';
        let disableDueToCooldown = false;
        const cooldown = (task.cooldown_seconds !== null && task.cooldown_seconds !== undefined) ? Number(task.cooldown_seconds) : 0;
        if (cooldown > 0 && task.my_submitted_at) {
            if (!task.my_status || task.my_status !== 'rejected') {
                const last = new Date(task.my_submitted_at).getTime();
                const diff = Math.floor((Date.now() - last) / 1000);
                if (diff < cooldown) {
                    const rem = cooldown - diff;
                    const mins = Math.floor(rem / 60);
                    const secs = rem % 60;
                    cooldownNote = ` (${t ? t('dashboard.user.availableIn','Available in') : 'Available in'} ${mins}m ${secs}s)`;
                    disableDueToCooldown = true;
                }
            }
        }

        const disabledAttr = status === 'pending' || status === 'approved' || disableDueToCooldown ? 'disabled' : '';
        const btnText = status === 'pending' ? (t ? t('dashboard.user.pending','Pending approval') : 'Pending approval') : (status === 'approved' ? (t ? t('dashboard.user.completed','Completed') : 'Completed') : (t ? t('dashboard.user.complete','Complete Task') : 'Complete Task'));

        return `
        <article>
            <h3>${escapeHtml(task.name)}</h3>
            ${statusTag}
            <p>${escapeHtml(task.description || '')}</p>
            <p>${t ? t('dashboard.user.reward','Reward') : 'Reward'}: ${formatCurrency(Number(task.reward_amount || 0).toFixed(2))}${cooldownNote}</p>
            <button onclick="completeTask(${task.id})" ${disabledAttr}>${btnText}</button>
        </article>
    `}).join('');
    if (window.i18n && typeof window.i18n.applyTranslations === 'function') window.i18n.applyTranslations(tasksList);
}

function displayTransactions(transactions) {
    const tbody = document.getElementById('transactionsBody');
    if (!tbody) return;
    if (!Array.isArray(transactions) || transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" data-i18n="common.noData">No transactions yet</td></tr>';
        return;
    }

    tbody.innerHTML = transactions.map(tx => `
        <tr>
            <td>${escapeHtml(new Date(tx.created_at).toLocaleDateString())}</td>
            <td>${escapeHtml(tx.type)}</td>
            <td>${escapeHtml(formatCurrency(Number(tx.amount || 0)))}</td>
            <td>${escapeHtml(tx.description || '')}</td>
        </tr>
    `).join('');
    if (window.i18n && typeof window.i18n.applyTranslations === 'function') window.i18n.applyTranslations(tbody);
}

// Simple confirm modal helper for user dashboard
function showConfirmModal(message) {
    return Promise.resolve(window.confirm(message));
}

// Money requests (advances + deposits) for user
async function loadUserMoneyRequests() {
    try {
        const meRes = await apiCall('/auth/me');
        if (!meRes || !meRes.success) return;
        const userId = meRes.data.id;
        const [advRes, depRes] = await Promise.all([
            apiCall(`/api/advances/user/${userId}`),
            apiCall(`/api/deposits/user/${userId}`)
        ]);

        const container = document.getElementById('moneyRequestsList');
        if (!container) return;
        let html = '';
        if (advRes && advRes.success && Array.isArray(advRes.data) && advRes.data.length) {
            html += '<h4 data-i18n="dashboard.user.money.yourAdvances">Your advance requests</h4>';
            html += '<ul>' + advRes.data.map(a => `
                <li>
                    ${escapeHtml(new Date(a.requested_at).toLocaleString())}: ${formatCurrency(Number(a.amount))} - <span class="tag ${a.status==='pending'?'warning':(a.status==='approved'?'success':'danger')}">${escapeHtml(a.status)}</span>
                    ${a.status === 'pending' ? ` <button data-action="cancel-advance" data-id="${a.id}" class="secondary">${t ? t('common.cancel','Cancel') : 'Cancel'}</button>` : ''}
                    ${a.reason ? ` <small>(${escapeHtml(a.reason)})</small>` : ''}
                </li>
            `).join('') + '</ul>';
        }
        if (depRes && depRes.success && Array.isArray(depRes.data) && depRes.data.length) {
            html += '<h4 data-i18n="dashboard.user.money.yourDeposits">Your deposit requests</h4>';
            html += '<ul>' + depRes.data.map(d => `
                <li>
                    ${escapeHtml(new Date(d.requested_at).toLocaleString())}: ${formatCurrency(Number(d.amount))} - <span class="tag ${d.status==='pending'?'warning':(d.status==='approved'?'success':'danger')}">${escapeHtml(d.status)}</span>
                    ${d.status === 'pending' ? ` <button data-action="cancel-deposit" data-id="${d.id}" class="secondary">${t ? t('common.cancel','Cancel') : 'Cancel'}</button>` : ''}
                    ${d.reference?` <small>(${escapeHtml(d.reference)})</small>`:''}
                </li>
            `).join('') + '</ul>';
        }
        if (!html) html = '<p data-i18n="dashboard.user.money.noRequests">No requests yet</p>';
        container.innerHTML = html;
        if (window.i18n && typeof window.i18n.applyTranslations === 'function') window.i18n.applyTranslations(container);
    } catch (err) {
        console.error('Failed to load money requests', err);
    }
}

// Submit advance (user)
document.addEventListener('click', async (e) => {
    if (!e.target) return;
    if (e.target.id === 'advanceSubmit') {
        const amt = parseFloat(document.getElementById('advanceAmount').value);
        const reason = document.getElementById('advanceReason').value;
        if (!amt || amt <= 0) { showMessageModal(t('errors.invalidAmount', 'Invalid amount')); return; }
        try {
            const res = await apiCall('/api/advances', { method: 'POST', body: JSON.stringify({ amount: amt, reason }) });
            if (res && res.success) {
                showMessageModal(t('dashboard.user.money.advanceSubmitted', 'Advance requested'));
                document.getElementById('advanceAmount').value = '';
                document.getElementById('advanceReason').value = '';
                loadUserMoneyRequests();
            } else {
                showMessageModal(formatErrorMessage('errors.errorPrefix', res, 'errors.requestError'));
            }
        } catch (err) { console.error(err); showMessageModal(t('errors.networkError', 'Network error')); }
    }
    if (e.target.id === 'depositSubmit') {
        const amt = parseFloat(document.getElementById('depositAmount').value);
        const ref = document.getElementById('depositReference').value;
        if (!amt || amt <= 0) { showMessageModal(t('errors.invalidAmount', 'Invalid amount')); return; }
        try {
            const res = await apiCall('/api/deposits', { method: 'POST', body: JSON.stringify({ amount: amt, reference: ref }) });
            if (res && res.success) {
                showMessageModal(t('dashboard.user.money.depositSubmitted', 'Deposit requested'));
                document.getElementById('depositAmount').value = '';
                document.getElementById('depositReference').value = '';
                loadUserMoneyRequests();
            } else {
                showMessageModal(formatErrorMessage('errors.errorPrefix', res, 'errors.requestError'));
            }
        } catch (err) { console.error(err); showMessageModal(t('errors.networkError', 'Network error')); }
    }

    // Cancel actions
    const action = e.target && e.target.getAttribute ? e.target.getAttribute('data-action') : null;
    if (action === 'cancel-advance') {
        const id = e.target.getAttribute('data-id');
        const ok = await showConfirmModal(t('messages.confirmCancelRequest', 'Are you sure?'));
        if (!ok) return;
        const res = await apiCall(`/api/advances/${id}/cancel`, { method: 'POST' });
        if (res && res.success) {
            showMessageModal(t('messages.cancelled', 'Cancelled'));
            loadUserMoneyRequests();
        } else {
            showMessageModal(formatErrorMessage('errors.errorPrefix', res, 'errors.requestError'));
        }
    }
    if (action === 'cancel-deposit') {
        const id = e.target.getAttribute('data-id');
        const ok = await showConfirmModal(t('messages.confirmCancelRequest', 'Are you sure?'));
        if (!ok) return;
        const res = await apiCall(`/api/deposits/${id}/cancel`, { method: 'POST' });
        if (res && res.success) {
            showMessageModal(t('messages.cancelled', 'Cancelled'));
            loadUserMoneyRequests();
        } else {
            showMessageModal(formatErrorMessage('errors.errorPrefix', res, 'errors.requestError'));
        }
    }
});

// Modal helpers for user dashboard
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

function showMessageModal(message) {
    const body = document.getElementById('messageModalBody');
    if (body) body.textContent = message;
    openModal('messageModal');
}

// Close modal on click of close buttons or backdrop
document.addEventListener('click', (event) => {
    const target = event.target;
    if (target.matches('[data-action="close"]')) {
        closeModal(target.getAttribute('data-target'));
    }
    if (target.classList.contains('modal')) {
        closeModal(target.id);
    }
});

// Skeleton show/hide helpers
function showUserSkeleton() {
    const balanceSkeleton = document.getElementById('balanceSkeleton');
    const balanceContent = document.getElementById('balanceContent');
    const tasksSkeleton = document.getElementById('tasksSkeleton');
    const tasksContent = document.getElementById('tasksContent');
    const transactionsSkeleton = document.getElementById('transactionsSkeleton');
    const transactionsContent = document.getElementById('transactionsContent');
    if (balanceSkeleton) balanceSkeleton.classList.remove('hidden');
    if (balanceContent) balanceContent.classList.add('hidden');
    if (tasksSkeleton) tasksSkeleton.classList.remove('hidden');
    if (tasksContent) tasksContent.classList.add('hidden');
    if (transactionsSkeleton) transactionsSkeleton.classList.remove('hidden');
    if (transactionsContent) transactionsContent.classList.add('hidden');
}

function hideUserSkeleton() {
    const balanceSkeleton = document.getElementById('balanceSkeleton');
    const balanceContent = document.getElementById('balanceContent');
    const tasksSkeleton = document.getElementById('tasksSkeleton');
    const tasksContent = document.getElementById('tasksContent');
    const transactionsSkeleton = document.getElementById('transactionsSkeleton');
    const transactionsContent = document.getElementById('transactionsContent');
    if (balanceSkeleton) balanceSkeleton.classList.add('hidden');
    if (balanceContent) balanceContent.classList.remove('hidden');
    if (tasksSkeleton) tasksSkeleton.classList.add('hidden');
    if (tasksContent) tasksContent.classList.remove('hidden');
    if (transactionsSkeleton) transactionsSkeleton.classList.add('hidden');
    if (transactionsContent) transactionsContent.classList.remove('hidden');
}

// Prompt modal (input) - returns string or null if cancelled
function showPromptModal(message, defaultValue = '') {
    return new Promise((resolve) => {
        // Do not show empty prompt dialogs
        if (!message || String(message).trim() === '') {
            resolve(null);
            return;
        }

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

// Intercept HTMX prompt events if any
if (window && window.htmx) {
    document.body.addEventListener('htmx:prompt', (evt) => {
        try {
            const payload = evt.detail || {};
            const question = payload.prompt || '';
            if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
            showPromptModal(question, payload.default || '').then((value) => {
                if (payload && typeof payload.issueRequest === 'function') {
                    payload.issueRequest(value);
                }
            });
        } catch (err) {
            console.warn('htmx prompt handler failed', err);
        }
    });
}

async function completeTask(taskId) {
    try {
        const response = await apiCall(`/api/tasks/${taskId}/complete`, {
            method: 'POST'
        });

        if (response.success) {
            showToast(t('messages.taskCompleted', 'Task completed successfully!'));
            loadDashboard(); // Refresh data
        } else {
            showToast(t('messages.taskCompleteError', 'Error completing task: ') + response.error);
        }
    } catch (error) {
        console.error('Error completing task:', error);
        showToast(t('messages.networkError', 'Network error'));
    }
}

// Logout - always redirect to user login
const _logoutBtn = document.getElementById('logout');
if (_logoutBtn) {
    _logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        // Always go to user login page
        window.location.href = '/login.html';
    });
}

// Change PIN form handler
// Change PIN via keypad flow (old PIN -> verify -> new PIN)
let _pinState = {
    mode: 'idle', // 'idle' | 'old' | 'new'
    entry: '',
    oldPin: '',
    username: ''
};

function resetPinState() {
    _pinState = { mode: 'idle', entry: '', oldPin: '', username: _pinState.username };
    const disp = document.getElementById('changePinDisplay'); if (disp) disp.textContent = '';
    const prompt = document.getElementById('changePinPrompt'); if (prompt) prompt.textContent = window.i18n ? window.i18n.t('dashboard.user.oldPin','Enter old PIN') : 'Enter old PIN';
}

function setPinDisplay() {
    const disp = document.getElementById('changePinDisplay');
    if (!disp) return;
    const stars = '*'.repeat(Math.min(8, _pinState.entry.length));
    disp.textContent = stars;
}

function startChangePinFlow(username) {
    _pinState.username = username || _pinState.username;
    _pinState.mode = 'old';
    _pinState.entry = '';
    const prompt = document.getElementById('changePinPrompt'); if (prompt) prompt.textContent = window.i18n ? window.i18n.t('dashboard.user.oldPin','Enter old PIN') : 'Enter old PIN';
    setPinDisplay();
}

// Keypad handling
document.addEventListener('click', async (e) => {
    const key = e.target && e.target.getAttribute && e.target.getAttribute('data-key');
    if (key == null) return;
    // ignore if not in changePin tab
    const changeTab = document.getElementById('tab-changePin');
    if (!changeTab || changeTab.style.display === 'none') return;
    e.preventDefault();
    if (key === 'clear') {
        _pinState.entry = _pinState.entry.slice(0, -1);
        setPinDisplay();
        return;
    }
    // append digit
    if (/^\d$/.test(key)) {
        if (_pinState.entry.length < 8) _pinState.entry += key;
        setPinDisplay();
    }
});

// OK / Cancel buttons
document.addEventListener('click', async (e) => {
    if (!e.target) return;
    if (e.target.id === 'changePinCancel') {
        resetPinState();
        return;
    }
    if (e.target.id === 'changePinOkBtn') {
        e.preventDefault();
        const entry = _pinState.entry;
        if (!entry || !/^\d{4,8}$/.test(entry)) { showMessageModal(t('errors.pinInvalid', 'PIN must be 4-8 digits')); _pinState.entry = ''; setPinDisplay(); return; }
        try {
            if (_pinState.mode === 'old') {
                // verify old PIN; if user has no PIN set, server returns 400->No PIN set
                const res = await apiCall('/auth/verify-pin', { method: 'POST', body: JSON.stringify({ pin: entry }) });
                if (res && res.success) {
                    _pinState.oldPin = entry;
                    _pinState.entry = '';
                    _pinState.mode = 'new';
                    const prompt = document.getElementById('changePinPrompt'); if (prompt) prompt.textContent = window.i18n ? window.i18n.t('dashboard.user.newPin','Enter new PIN') : 'Enter new PIN';
                    setPinDisplay();
                    return;
                }
                // handle special case: server tells us no PIN set (then proceed to new)
                if (res && !res.success && res.error && res.error.toLowerCase().includes('no pin')) {
                    _pinState.oldPin = '';
                    _pinState.entry = '';
                    _pinState.mode = 'new';
                    const prompt = document.getElementById('changePinPrompt'); if (prompt) prompt.textContent = window.i18n ? window.i18n.t('dashboard.user.newPin','Enter new PIN') : 'Enter new PIN';
                    setPinDisplay();
                    return;
                }
                showMessageModal(formatErrorMessage('errors.errorPrefix', res, 'errors.pinInvalid'));
                _pinState.entry = '';
                setPinDisplay();
                return;
            }
            if (_pinState.mode === 'new') {
                // submit change-pin
                const res = await apiCall('/auth/change-pin', { method: 'POST', body: JSON.stringify({ oldPin: _pinState.oldPin, newPin: entry }) });
                if (res && res.success) {
                    showMessageModal(t('dashboard.user.pinChanged', 'PIN changed successfully'));
                    resetPinState();
                    return;
                }
                showMessageModal(formatErrorMessage('errors.errorPrefix', res, 'errors.failedChangePin'));
                _pinState.entry = '';
                setPinDisplay();
                return;
            }
        } catch (err) {
            console.error('PIN keypad error', err);
            showMessageModal(t('errors.networkError', 'Network error'));
            _pinState.entry = '';
            setPinDisplay();
            return;
        }
    }
});

// Start flow when user opens changePin tab (listen for tab activation)
function onTabActivated(name) {
    if (name === 'changePin') {
        // ensure we have username
        (async () => {
            try {
                const me = await apiCall('/auth/me');
                if (me && me.success && me.data && me.data.username) {
                    startChangePinFlow(me.data.username);
                } else {
                    startChangePinFlow('');
                }
            } catch (e) {
                startChangePinFlow('');
            }
        })();
    }

    if (name === 'money') {
        // load money requests when user opens money tab
        (async () => {
            try {
                await loadUserMoneyRequests();
            } catch (e) { /* ignore */ }
        })();
    }
}

// Patch: call onTabActivated from initTabs when switching

// Load dashboard on page load
// Initialize tabs (show/hide sections)
function initTabs() {
    const tabs = Array.from(document.querySelectorAll('.tab-btn'));
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
        if (typeof onTabActivated === 'function') onTabActivated(name);
    }
    tabs.forEach(b => b.addEventListener('click', () => activate(b.dataset.tab)));
    // default - only activate default if no tab is currently active
    const hasActiveTab = tabs.some(b => b.classList.contains('active'));
    if (tabs.length && !hasActiveTab) {
        activate(tabs[0].dataset.tab || 'tasks');
    }
}

// Initialize tabs when DOM is ready and after HTMX navigation
document.addEventListener('DOMContentLoaded', initTabs);
if (window.htmx) {
    document.addEventListener('htmx:afterSwap', (event) => {
        // Only re-init if we're on a page with tabs
        if (document.querySelectorAll('.tab-btn').length > 0) {
            initTabs();
        }
    });
}

initTabs();

// Idle logout: configurable timeout + warning
let IDLE_TIMEOUT_MS = 60 * 1000; // default 1 minute
let IDLE_WARN_MS = 10 * 1000; // default 10s before logout
let _idleTimer = null;
let _warnTimer = null;
function getClientIdleConfig() {
    try {
        if (window.BANKLY_CONFIG) {
            const t = Number(window.BANKLY_CONFIG.clientIdleTimeoutMs);
            const w = Number(window.BANKLY_CONFIG.clientIdleWarnMs);
            IDLE_TIMEOUT_MS = Number.isFinite(t) && t >= 0 ? t : IDLE_TIMEOUT_MS;
            IDLE_WARN_MS = Number.isFinite(w) && w >= 0 ? w : IDLE_WARN_MS;
            // Warn must be less than timeout
            if (IDLE_WARN_MS >= IDLE_TIMEOUT_MS) IDLE_WARN_MS = Math.max(0, IDLE_TIMEOUT_MS - 1000);
        }
    } catch (e) { /* ignore */ }
}

function clearWarnTimer() {
    try { if (_warnTimer) clearTimeout(_warnTimer); } catch (e) { /* ignore */ }
    _warnTimer = null;
}

function resetIdleTimer() {
    try {
        if (_idleTimer) clearTimeout(_idleTimer);
        clearWarnTimer();
        hideIdleToast();
    } catch (e) { /* ignore */ }

    // If timeout disabled (0 or negative) do nothing
    if (!IDLE_TIMEOUT_MS || IDLE_TIMEOUT_MS <= 0) return;

    if (IDLE_WARN_MS && IDLE_WARN_MS > 0) {
        const warnAt = Math.max(0, IDLE_TIMEOUT_MS - IDLE_WARN_MS);
        _warnTimer = setTimeout(onIdleWarn, warnAt);
    }

    _idleTimer = setTimeout(onIdleLogout, IDLE_TIMEOUT_MS);
}

function startIdleTimer() {
    // Read config from server-injected object (client-config.js)
    getClientIdleConfig();

    // Clear any previous
    stopIdleTimer();
    // Events that indicate activity
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach((ev) => {
        document.addEventListener(ev, resetIdleTimer, { passive: true });
    });
    window.addEventListener('focus', resetIdleTimer);
    resetIdleTimer();
}
function stopIdleTimer() {
    try { if (_idleTimer) clearTimeout(_idleTimer); } catch (e) { /* ignore */ }
    try { clearWarnTimer(); } catch (e) { /* ignore */ }
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach((ev) => {
        document.removeEventListener(ev, resetIdleTimer);
    });
    window.removeEventListener('focus', resetIdleTimer);
    _idleTimer = null;
}

let _idleCountdownInterval = null;
let _idleRemainingSeconds = 0;

function clearIdleCountdown() {
    try { if (_idleCountdownInterval) clearInterval(_idleCountdownInterval); } catch (e) { /* ignore */ }
    _idleCountdownInterval = null;
    _idleRemainingSeconds = 0;
}

function showIdleToast(seconds) {
    try {
        const toast = document.getElementById('toast');
        if (!toast) return;

        const stayLabel = escapeHtml(t('messages.stayLoggedIn', 'Stay logged in'));
        const logoutLabel = escapeHtml(t('messages.logoutNow', 'Logout now'));
        const msgText = t('messages.idleWarning', `You will be logged out due to inactivity in %s seconds. Stay logged in?`).replace('%s', seconds);

        toast.innerHTML = `<span class="toast-msg">${escapeHtml(msgText)}</span> <button id="idleStayBtn" class="btn">${stayLabel}</button> <button id="idleLogoutBtn" class="secondary">${logoutLabel}</button>`;
        toast.classList.add('show');

        const stayBtn = document.getElementById('idleStayBtn');
        const logoutBtn = document.getElementById('idleLogoutBtn');

        function onStay() {
            hideIdleToast();
            resetIdleTimer();
        }
        function onLogout() {
            hideIdleToast();
            onIdleLogout();
        }

        if (stayBtn) stayBtn.addEventListener('click', onStay);
        if (logoutBtn) logoutBtn.addEventListener('click', onLogout);

        // Start countdown
        clearIdleCountdown();
        _idleRemainingSeconds = seconds;
        _idleCountdownInterval = setInterval(() => {
            _idleRemainingSeconds -= 1;
            if (_idleRemainingSeconds <= 0) {
                clearIdleCountdown();
                hideIdleToast();
                onIdleLogout();
                return;
            }
            const msgEl = toast.querySelector('.toast-msg');
            if (msgEl) msgEl.textContent = t('messages.idleWarning').replace('%s', _idleRemainingSeconds);
        }, 1000);
    } catch (e) { /* ignore */ }
}

function hideIdleToast() {
    try {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.classList.remove('show');
        toast.innerHTML = '';
    } catch (e) { /* ignore */ }
    clearIdleCountdown();
}

function onIdleWarn() {
    try {
        const secs = Math.ceil(IDLE_WARN_MS / 1000) || 1;
        showIdleToast(secs);
    } catch (e) { /* ignore */ }
}

function onIdleLogout() {
    try {
        stopIdleTimer();
    } catch (e) { /* ignore */ }
    // Redirect to login with reason param so login page can show a message
    const next = '/login.html?reason=inactive';
    window.location.href = next;
}

// Then load data
// Initial load is triggered by ensureAuthed(); avoid double-loading here.