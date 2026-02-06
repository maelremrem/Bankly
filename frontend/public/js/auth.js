// auth.js - Authentication script for Bankly frontend

const API_BASE = 'http://localhost:3000'; // Adjust for production

let selectedUser = null;
let pin = '';

document.addEventListener('DOMContentLoaded', () => {
    // Only attempt to load user selection if the element exists on the page
    if (document.getElementById('userSelection')) {
        loadUsers();
        setupKeypad();
    }

    // Attach submit handler for username/password login form if present
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (evt) => {
            evt.preventDefault();
            const username = document.getElementById('username') ? document.getElementById('username').value : '';
            const password = document.getElementById('password') ? document.getElementById('password').value : '';
            if (!username || !password) {
                showError(window.i18n ? window.i18n.t('login.enterCredentials') : 'Please enter username and password');
                return;
            }

            const submitBtnId = 'loginSubmitBtn';
            showLoginSpinner(submitBtnId);
            try {
                const res = await fetch('/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ username, password })
                });

                let data = {};
                try { data = await res.json(); } catch (e) { /* ignore */ }

                if (res.ok && data && data.success) {
                    // Redirect according to role or next param
                    const role = data.data ? data.data.role : null;
                    const params = new URLSearchParams(window.location.search);
                    const next = params.get('next');
                    if (next) {
                        window.location.href = next; return;
                    }
                    if (role === 'admin') window.location.href = '/admin/dashboard.html';
                    else window.location.href = '/user/dashboard.html';
                } else {
                    const errMsg = (data && data.error) ? data.error : (window.i18n ? window.i18n.t('login.error') : 'Login failed');
                    showError(errMsg);
                }
            } catch (err) {
                console.error('Login failed', err);
                showError(window.i18n ? window.i18n.t('messages.networkError') : 'Network error. Please try again.');
            } finally {
                hideLoginSpinner(submitBtnId);
            }
        });
    }
});

// Utility: show error message in pages that have #errorMessage
function showError(msg, timeout = 4000) {
    try {
        const el = document.getElementById('errorMessage');
        if (!el) {
            console.warn('showError: no #errorMessage element present');
            return;
        }
        el.textContent = msg;
        el.style.color = 'red';
        el.style.display = '';
        if (timeout > 0) {
            setTimeout(() => { el.style.display = 'none'; }, timeout);
        }
    } catch (err) {
        console.warn('showError failed', err);
    }
}

function showInfo(msg, timeout = 3000) {
    try {
        const el = document.getElementById('errorMessage');
        if (!el) {
            console.warn('showInfo: no #errorMessage element present');
            return;
        }
        el.textContent = msg;
        el.style.color = 'green';
        el.style.display = '';
        if (timeout > 0) {
            setTimeout(() => { el.style.display = 'none'; }, timeout);
        }
    } catch (err) {
        console.warn('showInfo failed', err);
    }
}

// Spinner helpers for login buttons (id of button element)
function showLoginSpinner(btnId) {
    try {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.disabled = true;
        const spinner = btn.querySelector('.btn-spinner');
        const text = btn.querySelector('.btn-text');
        if (spinner) spinner.classList.remove('hidden');
        if (text) text.classList.add('hidden');
    } catch (err) {
        console.warn('showLoginSpinner failed', err);
    }
}

function hideLoginSpinner(btnId) {
    try {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.disabled = false;
        const spinner = btn.querySelector('.btn-spinner');
        const text = btn.querySelector('.btn-text');
        if (spinner) spinner.classList.add('hidden');
        if (text) text.classList.remove('hidden');
    } catch (err) {
        console.warn('hideLoginSpinner failed', err);
    }
}

async function loadUsers() {
    try {
        const response = await fetch('/auth/users-public');
        const data = await response.json();
        if (data.success) {
            displayUsers(data.data);
        } else {
                showError(window.i18n ? window.i18n.t('messages.loadFailed') : 'Failed to load users');
        }
    } catch (error) {
        console.error('Error loading users:', error);
            showError(window.i18n ? window.i18n.t('messages.networkError') : 'Network error');
    }
}

function displayUsers(users) {
    const container = document.getElementById('userSelection');
    if (!container) {
        console.warn('displayUsers: no #userSelection element');
        return;
    }
    container.innerHTML = '';
    users.forEach(user => {
        const card = document.createElement('div');
        card.className = 'user-card';
        card.textContent = user.username;
        card.addEventListener('click', (evt) => selectUser(user, evt));
        container.appendChild(card);
    });
}

function selectUser(user, evt) {
    selectedUser = user;
    document.querySelectorAll('.user-card').forEach(card => card.classList.remove('selected'));
    const target = (evt && (evt.currentTarget || evt.target)) || null;
    if (target && target.classList) target.classList.add('selected');
    const sel = document.getElementById('selectedUser');
    if (sel) sel.textContent = `${window.i18n ? window.i18n.t('login.selectedPrefix','Selected:') : 'Selected:'} ${user.username}`;
    const us = document.getElementById('userSelection');
    if (us) us.style.display = 'none';
    const ps = document.getElementById('pinSection');
    if (ps) ps.style.display = 'block';
    pin = '';
    updatePinDisplay();
}

function setupKeypad() {
    const buttons = document.querySelectorAll('.keypad button');
    if (buttons && buttons.length) {
        buttons.forEach(button => {
            if (!button) return;
            button.addEventListener('click', () => {
                const key = button.dataset.key;
                if (key === 'clear') {
                    pin = pin.slice(0, -1);
                } else if (key && pin.length < 6) {
                    pin += key;
                }
                updatePinDisplay();
            });
        });
    }

    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.addEventListener('click', loginWithPin);
    const backBtn = document.getElementById('backBtn');
    if (backBtn) backBtn.addEventListener('click', backToSelection);
}

function updatePinDisplay() {
    const display = document.getElementById('pinDisplay');
    if (!display) return;
    display.textContent = pin.length ? '*'.repeat(pin.length) : (window.i18n ? window.i18n.t('login.enterPin','Enter PIN') : 'Enter PIN');
}

async function loginWithPin() {
    if (!selectedUser || pin.length === 0) {
        showError(window.i18n ? window.i18n.t('login.selectUserEnterPin') : 'Please select a user and enter PIN');
        return;
    }

    const pinBtnId = 'loginBtn';
    showLoginSpinner(pinBtnId);
    try {
        const response = await fetch('/auth/pin-login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify({ username: selectedUser.username, pin }),
        });

        const data = await response.json();

        if (data.success) {
            // If server created the PIN now, show a brief confirmation so user knows
            if (data.data && data.data.pinCreated) {
                showInfo(window.i18n ? window.i18n.t('login.pinCreated') : 'PIN created successfully');
                // small delay so user sees message
                await new Promise(r => setTimeout(r, 700));
            }

            // After server sets cookie, fetch user info to get role
            const meRes = await fetch('/auth/me', { credentials: 'same-origin' });
            const meData = await meRes.json();
            const role = meData.success ? meData.data.role : null;

            // Redirect to next param if present
            const params = new URLSearchParams(window.location.search);
            const next = params.get('next');
            if (next) {
                window.location.href = next;
                return;
            }

            // Default redirect
            if (role === 'admin') {
                window.location.href = 'admin/dashboard.html';
            } else {
                window.location.href = 'user/dashboard.html';
            }
        } else {
            showError(data.error || (window.i18n ? window.i18n.t('login.error') : 'Login failed'));
            pin = '';
            updatePinDisplay();
        }
    } catch (error) {
        console.error('Login error:', error);
        showError(window.i18n ? window.i18n.t('messages.networkError') : 'Network error. Please try again.');
        pin = '';
        updatePinDisplay();
    } finally {
        hideLoginSpinner(pinBtnId);
    }
}

function backToSelection() {
    selectedUser = null;
    pin = '';
    document.getElementById('userSelection').style.display = 'grid';
    document.getElementById('pinSection').style.display = 'none';
    document.querySelectorAll('.user-card').forEach(card => card.classList.remove('selected'));
}