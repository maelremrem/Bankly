// dashboard-user.js - User dashboard functionality

const API_BASE = '';

function t(key, fallback = '') {
    if (window.i18n && typeof window.i18n.t === 'function') return window.i18n.t(key, fallback);
    return fallback || key;
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
        return;
    }

    return response.json();
}

// Ensure user is authenticated
(async function ensureAuthed() {
    try {
        const res = await fetch('/auth/me', { credentials: 'same-origin' });
        if (!res.ok) {
            window.location.href = `/login.html?next=${encodeURIComponent(window.location.pathname)}`;
            return;
        }
        const data = await res.json();
        if (!data.success) {
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
        if (balanceEl) balanceEl.textContent = 'Error loading balance';
    } finally {
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

    tasksList.innerHTML = tasks.map(task => `
        <article>
            <h3>${escapeHtml(task.name)}</h3>
            <p>${escapeHtml(task.description || '')}</p>
            <p>${t ? t('dashboard.user.tasks.reward','Reward') : 'Reward'}: ${formatCurrency(Number(task.reward_amount || 0).toFixed(2))}</p>
            <button onclick="completeTask(${task.id})">${t ? t('dashboard.user.complete','Complete Task') : 'Complete Task'}</button>
        </article>
    `).join('');
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
            showMessageModal('Task completed successfully!');
            loadDashboard(); // Refresh data
        } else {
            showMessageModal('Error completing task: ' + response.error);
        }
    } catch (error) {
        console.error('Error completing task:', error);
        showMessageModal('Network error');
    }
}

// Logout
document.getElementById('logout').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    window.location.href = '../index.html';
});

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
        if (!entry || !/^\d{4,8}$/.test(entry)) { showMessageModal(window.i18n ? window.i18n.t('errors.pinInvalid') : 'PIN must be 4-8 digits'); _pinState.entry = ''; setPinDisplay(); return; }
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
                showMessageModal('Error: ' + (res && res.error ? res.error : 'Invalid PIN'));
                _pinState.entry = '';
                setPinDisplay();
                return;
            }
            if (_pinState.mode === 'new') {
                // submit change-pin
                const res = await apiCall('/auth/change-pin', { method: 'POST', body: JSON.stringify({ oldPin: _pinState.oldPin, newPin: entry }) });
                if (res && res.success) {
                    showMessageModal(window.i18n ? window.i18n.t('dashboard.user.pinChanged') : 'PIN changed successfully');
                    resetPinState();
                    return;
                }
                showMessageModal('Error: ' + (res && res.error ? res.error : 'Failed to change PIN'));
                _pinState.entry = '';
                setPinDisplay();
                return;
            }
        } catch (err) {
            console.error('PIN keypad error', err);
            showMessageModal('Network error');
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
    // default
    if (tabs.length) activate(tabs[0].dataset.tab || 'tasks');
}

initTabs();

// Then load data
loadDashboard();