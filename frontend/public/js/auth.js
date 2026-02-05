// auth.js - Authentication script for Monly frontend

const API_BASE = 'http://localhost:3000'; // Adjust for production

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');

    try {
        const response = await fetch(`/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (data.success) {
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
            errorMessage.textContent = data.error || 'Login failed';
            errorMessage.style.display = 'block';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorMessage.textContent = 'Network error. Please try again.';
        errorMessage.style.display = 'block';
    }
});