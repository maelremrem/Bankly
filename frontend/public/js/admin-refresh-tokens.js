// admin-refresh-tokens.js - Manage refresh tokens in admin UI

document.addEventListener('DOMContentLoaded', async () => {
    // Ensure user is admin and init
    try {
        await ensureAdmin();
    } catch (err) {
        console.warn('Not admin, redirecting', err);
        return;
    }

    const reloadBtn = document.getElementById('refreshTokensReload');
    if (reloadBtn) reloadBtn.addEventListener('click', loadTokens);

    await loadTokens();
});

async function loadTokens() {
    const body = document.getElementById('tokensBody');
    if (!body) return;
    body.innerHTML = `<tr><td colspan="5">${t('common.loading')}</td></tr>`;

    const res = await apiCall('/api/admin/refresh-tokens');
    if (!res || !res.success) {
        body.innerHTML = `<tr><td colspan="5">${t('messages.loadFailed')}</td></tr>`;
        showToast(res ? res.error : t('messages.loadFailed'));
        return;
    }

    const tokens = res.data || [];
    if (!tokens.length) {
        body.innerHTML = `<tr><td colspan="5">${t('common.noData')}</td></tr>`;
        return;
    }

    body.innerHTML = tokens.map(token => `
        <tr data-id="${token.id}">
            <td>${escapeHtml(token.id)}</td>
            <td>${escapeHtml(token.username || token.user_id)} <button class="small" data-action="revoke-user" data-userid="${token.user_id}">${t('dashboard.admin.refreshTokens.revokeAllForUser')}</button></td>
            <td>${escapeHtml(token.created_at || '')}</td>
            <td>${escapeHtml(token.expires_at || '-')}</td>
            <td>
                <button class="danger" data-action="revoke" data-id="${token.id}">${t('dashboard.admin.refreshTokens.revoke')}</button>
            </td>
        </tr>
    `).join('');

    // Attach delegated click handler
    body.removeEventListener('click', onTokensClick);
    body.addEventListener('click', onTokensClick);
}

async function onTokensClick(evt) {
    const btn = evt.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'revoke') {
        const id = Number(btn.dataset.id);
        if (!id) return;
        const ok = await showConfirmModal(t('dashboard.admin.refreshTokens.confirmRevoke'));
        if (!ok) return;
        const res = await apiCall(`/api/admin/refresh-tokens/${id}/revoke`, { method: 'POST' });
        if (res && res.success) {
            showToast(t('dashboard.admin.refreshTokens.revokedSuccess'));
            await loadTokens();
        } else {
            showToast(res ? res.error : t('messages.serverError'));
        }
    } else if (action === 'revoke-user') {
        const userId = Number(btn.dataset.userid);
        if (!userId) return;
        const ok = await showConfirmModal(t('dashboard.admin.refreshTokens.confirmRevokeAll'));
        if (!ok) return;
        const res = await apiCall('/api/admin/refresh-tokens/revoke', { method: 'POST', body: JSON.stringify({ userId }) });
        if (res && res.success) {
            showToast(t('dashboard.admin.refreshTokens.revokedAllSuccess'));
            await loadTokens();
        } else {
            showToast(res ? res.error : t('messages.serverError'));
        }
    }
}