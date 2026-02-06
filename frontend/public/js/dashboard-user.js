// dashboard-user.js - User dashboard functionality

const API_BASE = '';

function t(key, fallback = '') {
    if (window.i18n && typeof window.i18n.t === 'function') return window.i18n.t(key, fallback);
    return fallback || key;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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
        const userId = userResponse.data.id;

        // Load balance
        const balanceResponse = await apiCall(`/api/users/${userId}/balance`);
        if (balanceResponse.success) {
            const balanceEl = document.getElementById('balanceContent');
            if (balanceEl) balanceEl.textContent = `$${balanceResponse.data.balance.toFixed(2)}`;
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
        return;
    }

    tasksList.innerHTML = tasks.map(task => `
        <article>
            <h3>${escapeHtml(task.name)}</h3>
            <p>${escapeHtml(task.description || '')}</p>
            <p>${t ? t('dashboard.user.tasks.reward','Reward') : 'Reward'}: $${Number(task.reward_amount || 0).toFixed(2)}</p>
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
            <td>${escapeHtml(Number(tx.amount || 0).toFixed(2))}</td>
            <td>${escapeHtml(tx.description || '')}</td>
        </tr>
    `).join('');
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

// Load dashboard on page load
loadDashboard();