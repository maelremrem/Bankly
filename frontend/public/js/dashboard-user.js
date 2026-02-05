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
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
    }

    return response.json();
}

// Ensure user is authenticated
(async function ensureAuthed() {
    try {
        const res = await fetch('/auth/me', { credentials: 'same-origin' });
        if (!res.ok) {
            window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
            return;
        }
        const data = await res.json();
        if (!data.success) {
            window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
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

async function completeTask(taskId) {
    try {
        const response = await apiCall(`/api/tasks/${taskId}/complete`, {
            method: 'POST'
        });

        if (response.success) {
            alert('Task completed successfully!');
            loadDashboard(); // Refresh data
        } else {
            alert('Error completing task: ' + response.error);
        }
    } catch (error) {
        console.error('Error completing task:', error);
        alert('Network error');
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