// dashboard-admin.js - Admin dashboard functionality

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
        // Redirect to login keeping next param
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
    }

    return response.json();
}

// Check auth + role before doing anything
(async function ensureAdmin() {
    try {
        const res = await fetch('/auth/me', { credentials: 'same-origin' });
        if (!res.ok) {
            window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
            return;
        }
        const data = await res.json();
        if (!data.success || data.data.role !== 'admin') {
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

// Load admin dashboard data
async function loadDashboard() {
    try {
        // Load users
        const usersResponse = await apiCall('/api/admin/users');
        if (usersResponse.success) {
            displayUsers(usersResponse.data);
        }

        // Load tasks
        const tasksResponse = await apiCall('/api/tasks');
        if (tasksResponse.success) {
            displayTasks(tasksResponse.data);
        }

        // Load recent transactions
        const transactionsResponse = await apiCall('/api/admin/transactions?limit=20');
        if (transactionsResponse.success) {
            displayTransactions(transactionsResponse.data);
        }

        // Load overview stats
        loadOverview();

    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

async function loadOverview() {
    try {
        const overviewResponse = await apiCall('/api/admin/overview');

        if (overviewResponse.success) {
            const data = overviewResponse.data;
            document.getElementById('overview').innerHTML = `
                <p><strong>Total Users:</strong> ${data.totalUsers}</p>
                <p><strong>Total Transactions:</strong> ${data.totalTransactions}</p>
                <p><strong>Total Balance in System:</strong> $${parseFloat(data.totalBalance).toFixed(2)}</p>
            `;
        }
    } catch (error) {
        console.error('Error loading overview:', error);
    }
}

function displayUsers(users) {
    const tbody = document.getElementById('usersBody');
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.username}</td>
            <td>${user.role}</td>
            <td>$${user.balance.toFixed(2)}</td>
            <td>
                <button onclick="editUser(${user.id})">Edit</button>
                <button onclick="deleteUser(${user.id})" style="background: #e74c3c;">Delete</button>
            </td>
        </tr>
    `).join('');
}

function displayTasks(tasks) {
    const tasksList = document.getElementById('tasksList');
    if (tasks.length === 0) {
        tasksList.innerHTML = '<p>No tasks created yet</p>';
        return;
    }

    tasksList.innerHTML = tasks.map(task => `
        <article>
            <h3>${task.name}</h3>
            <p>${task.description}</p>
            <p>Reward: $${task.reward_amount} | Approval: ${task.requires_approval ? 'Required' : 'Auto'}</p>
            <button onclick="editTask(${task.id})">Edit</button>
            <button onclick="deleteTask(${task.id})" style="background: #e74c3c;">Delete</button>
        </article>
    `).join('');
}

function displayTransactions(transactions) {
    const tbody = document.getElementById('transactionsBody');
    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No transactions yet</td></tr>';
        return;
    }

    tbody.innerHTML = transactions.map(tx => `
        <tr>
            <td>${new Date(tx.created_at).toLocaleDateString()}</td>
            <td>${tx.username || 'Unknown'}</td>
            <td>${tx.type}</td>
            <td>$${tx.amount.toFixed(2)}</td>
            <td>${tx.description || ''}</td>
        </tr>
    `).join('');
}

// User management
function showCreateUserModal() {
    document.getElementById('userModalTitle').textContent = 'Create User';
    document.getElementById('userForm').reset();
    document.getElementById('userModal').style.display = 'block';
}

function editUser(userId) {
    // Would need to fetch user details first
    alert('Edit user functionality to be implemented');
}

async function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user?')) {
        try {
            const response = await apiCall(`/api/users/${userId}`, { method: 'DELETE' });
            if (response.success) {
                loadDashboard();
            } else {
                alert('Error deleting user: ' + response.error);
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            alert('Network error');
        }
    }
}

// Task management
function showCreateTaskModal() {
    document.getElementById('taskModalTitle').textContent = 'Create Task';
    document.getElementById('taskForm').reset();
    document.getElementById('taskModal').style.display = 'block';
}

function editTask(taskId) {
    alert('Edit task functionality to be implemented');
}

async function deleteTask(taskId) {
    if (confirm('Are you sure you want to delete this task?')) {
        try {
            const response = await apiCall(`/api/tasks/${taskId}`, { method: 'DELETE' });
            if (response.success) {
                loadDashboard();
            } else {
                alert('Error deleting task: ' + response.error);
            }
        } catch (error) {
            console.error('Error deleting task:', error);
            alert('Network error');
        }
    }
}

// Form submissions
document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const userData = {
        username: formData.get('userUsername'),
        password: formData.get('userPassword'),
        role: formData.get('userRole')
    };

    try {
        const response = await apiCall('/api/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });

        if (response.success) {
            closeModal('userModal');
            loadDashboard();
        } else {
            alert('Error creating user: ' + response.error);
        }
    } catch (error) {
        console.error('Error creating user:', error);
        alert('Network error');
    }
});

document.getElementById('taskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const taskData = {
        name: formData.get('taskName'),
        description: formData.get('taskDescription'),
        reward_amount: parseFloat(formData.get('taskReward')),
        requires_approval: document.getElementById('taskApproval').checked
    };

    try {
        const response = await apiCall('/api/tasks', {
            method: 'POST',
            body: JSON.stringify(taskData)
        });

        if (response.success) {
            closeModal('taskModal');
            loadDashboard();
        } else {
            alert('Error creating task: ' + response.error);
        }
    } catch (error) {
        console.error('Error creating task:', error);
        alert('Network error');
    }
});

// Modal functions
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Logout
document.getElementById('logout').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    window.location.href = '../index.html';
});

// Load dashboard on page load
loadDashboard();