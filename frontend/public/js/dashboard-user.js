// dashboard-user.js - User dashboard functionality

const API_BASE = '';

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
        // Get current user info (assuming we have userId in token or fetch /auth/me)
        // For now, assume we need to get user ID from somewhere
        // Let's add a way to get current user
        const userResponse = await apiCall('/auth/me');
        if (!userResponse.success) {
            throw new Error('Failed to get user info');
        }
        const userId = userResponse.data.id;

        // Load balance
        const balanceResponse = await apiCall(`/api/users/${userId}/balance`);
        if (balanceResponse.success) {
            document.getElementById('balance').textContent = `$${balanceResponse.data.balance.toFixed(2)}`;
        }

        // Load available tasks
        const tasksResponse = await apiCall('/api/tasks/available');
        if (tasksResponse.success) {
            displayTasks(tasksResponse.data);
        }

        // Load recent transactions
        const transactionsResponse = await apiCall(`/api/users/${userId}/transactions?limit=10`);
        if (transactionsResponse.success) {
            displayTransactions(transactionsResponse.data);
        }

    } catch (error) {
        console.error('Error loading dashboard:', error);
        document.getElementById('balance').textContent = 'Error loading balance';
    }
}

function displayTasks(tasks) {
    const tasksList = document.getElementById('tasksList');
    if (tasks.length === 0) {
        tasksList.innerHTML = '<p>No tasks available</p>';
        return;
    }

    tasksList.innerHTML = tasks.map(task => `
        <article>
            <h3>${task.name}</h3>
            <p>${task.description}</p>
            <p>Reward: $${task.reward_amount}</p>
            <button onclick="completeTask(${task.id})">Complete Task</button>
        </article>
    `).join('');
}

function displayTransactions(transactions) {
    const tbody = document.getElementById('transactionsBody');
    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">No transactions yet</td></tr>';
        return;
    }

    tbody.innerHTML = transactions.map(tx => `
        <tr>
            <td>${new Date(tx.created_at).toLocaleDateString()}</td>
            <td>${tx.type}</td>
            <td>$${tx.amount.toFixed(2)}</td>
            <td>${tx.description || ''}</td>
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