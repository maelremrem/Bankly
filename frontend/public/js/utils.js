// utils.js - Shared helpers

(function () {
    function getLocale() {
        if (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') {
            return window.i18n.getCurrentLanguage();
        }
        return navigator.language || 'en';
    }

    function formatCurrency(amount, currency = 'EUR') {
        const locale = getLocale();
        const formatter = new Intl.NumberFormat(locale, {
            style: 'currency',
            currency
        });
        return formatter.format(Number(amount || 0));
    }

    function formatDate(dateInput) {
        if (!dateInput) return '';
        const locale = getLocale();
        const date = new Date(dateInput);
        return new Intl.DateTimeFormat(locale).format(date);
    }

    function formatDateTime(dateInput) {
        if (!dateInput) return '';
        const locale = getLocale();
        const date = new Date(dateInput);
        return new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(date);
    }

    window.utils = {
        formatCurrency,
        formatDate,
        formatDateTime
    };
})();

// HTMX-friendly skeleton/loading helpers
(function () {
    if (!window.htmx) return;

    function makeTableSkeleton(el) {
        const rows = 3;
        const colspan = el.closest('table') ? el.closest('table').querySelectorAll('th').length || 6 : 6;
        let html = '';
        for (let i = 0; i < rows; i++) {
            html += `<tr class="skeleton-table-row"><td colspan="${colspan}"><div class="skeleton"><div class="skeleton-line" style="height:14px;width:80%"></div></div></td></tr>`;
        }
        return html;
    }

    function makeGridSkeleton(el) {
        const cards = 3;
        let html = '';
        for (let i = 0; i < cards; i++) {
            html += `<div class="skeleton-card"><div class="skeleton"><div class="skeleton-line" style="height:18px;width:60%"></div><div class="skeleton-line" style="height:14px;width:40%"></div></div></div>`;
        }
        return html;
    }

    function makeGenericSkeleton() {
        return `<div class="skeleton"><div class="skeleton-line" style="height:16px;width:90%"></div><div class="skeleton-line" style="height:16px;width:70%"></div><div class="skeleton-line" style="height:16px;width:50%"></div></div>`;
    }

    function generateSkeleton(el) {
        try {
            if (!el) return '';
            const tag = el.tagName && el.tagName.toLowerCase();
            if (tag === 'tbody' || (tag === 'div' && el.closest('table'))) return makeTableSkeleton(el);
            if (el.classList && el.classList.contains('overview-grid')) return makeGridSkeleton(el);
            if (el.classList && el.classList.contains('table-scroll')) {
                const tb = el.querySelector('tbody');
                if (tb) return makeTableSkeleton(tb);
            }
            return makeGenericSkeleton();
        } catch (e) {
            return makeGenericSkeleton();
        }
    }

    htmx.on('htmx:beforeRequest', function (evt) {
        const target = evt.detail && (evt.detail.target || evt.detail.elt || evt.target);
        if (!target) return;
        // don't override if already active
        if (target.dataset && target.dataset.skeletonActive) return;
        try {
            target.dataset.skeletonActive = '1';
            // save previous content in case of error
            target.dataset.prevInner = target.innerHTML;
            target.classList.add('loading-skeleton');
            target.innerHTML = generateSkeleton(target);
            // show global spinner for network activity
            if (window.utils && typeof window.utils.showGlobalSpinner === 'function') {
                window.utils.showGlobalSpinner();
            }
        } catch (e) {
            // ignore
        }
    });

    htmx.on('htmx:afterSwap', function (evt) {
        const target = evt.detail && (evt.detail.target || evt.detail.elt || evt.target);
        if (!target) return;
        try {
            if (target.dataset && target.dataset.skeletonActive) {
                delete target.dataset.skeletonActive;
            }
            if (target.classList) target.classList.remove('loading-skeleton');
            if (target.dataset && target.dataset.prevInner) delete target.dataset.prevInner;
            if (window.utils && typeof window.utils.hideGlobalSpinner === 'function') {
                window.utils.hideGlobalSpinner();
            }
        } catch (e) {}
    });

    htmx.on('htmx:responseError', function (evt) {
        const target = evt.detail && (evt.detail.target || evt.detail.elt || evt.target);
        if (!target) return;
        try {
            if (target.dataset && target.dataset.prevInner !== undefined) {
                target.innerHTML = target.dataset.prevInner;
                delete target.dataset.prevInner;
            }
            if (target.dataset && target.dataset.skeletonActive) delete target.dataset.skeletonActive;
            if (target.classList) target.classList.remove('loading-skeleton');
            if (window.utils && typeof window.utils.hideGlobalSpinner === 'function') {
                window.utils.hideGlobalSpinner();
            }
        } catch (e) {}
    });

    // Ensure spinner is hidden after any completed request (fallback)
    htmx.on('htmx:afterRequest', function (evt) {
        if (window.utils && typeof window.utils.hideGlobalSpinner === 'function') {
            try { window.utils.hideGlobalSpinner(); } catch (e) {}
        }
    });

    // Also handle aborts/timeouts explicitly
    htmx.on('htmx:abort', function (evt) {
        if (window.utils && typeof window.utils.hideGlobalSpinner === 'function') {
            try { window.utils.hideGlobalSpinner(); } catch (e) {}
        }
    });
    htmx.on('htmx:timeout', function (evt) {
        if (window.utils && typeof window.utils.hideGlobalSpinner === 'function') {
            try { window.utils.hideGlobalSpinner(); } catch (e) {}
        }
    });

    // On initial load, add skeletons for any hx-get regions that are empty
    document.addEventListener('DOMContentLoaded', function () {
        const hxTargets = document.querySelectorAll('[hx-get], [hx-post]');
        hxTargets.forEach((el) => {
            // if element empty, show skeleton until HTMX swaps content
            if (!el.innerHTML.trim()) {
                try {
                    el.dataset.skeletonActive = '1';
                    el.dataset.prevInner = '';
                    el.classList.add('loading-skeleton');
                    el.innerHTML = generateSkeleton(el);
                } catch (e) {}
            }
        });
        // ensure a global spinner element exists in the topbar for visibility
        try {
            if (!document.getElementById('globalNetworkSpinner')) {
                const appBrand = document.querySelector('.topbar .app-brand');
                if (appBrand && appBrand.parentNode) {
                    const li = document.createElement('li');
                    li.id = 'globalNetworkSpinner';
                    li.className = 'global-spinner hidden';
                    li.setAttribute('aria-hidden', 'true');
                    li.innerHTML = '<div class="spinner" aria-hidden="true"></div>';
                    appBrand.parentNode.insertBefore(li, appBrand.nextSibling);
                } else {
                    const top = document.querySelector('.topbar .container');
                    if (top) {
                        const wrapper = document.createElement('div');
                        wrapper.id = 'globalNetworkSpinner';
                        wrapper.className = 'global-spinner hidden';
                        wrapper.setAttribute('aria-hidden', 'true');
                        wrapper.innerHTML = '<div class="spinner" aria-hidden="true"></div>';
                        top.appendChild(wrapper);
                    }
                }
            }
        } catch (e) {}
    });
})();

// Expose global spinner control via window.utils
(function () {
    // Spinner control with delay and reference counting to avoid flicker
    const spinnerDelay = 150; // ms before showing spinner
    let spinnerCount = 0;
    let spinnerTimer = null;
    let spinnerVisible = false;
    let lastActivity = 0;
    const watchdogIntervalMs = 5000;
    const watchdogTimeoutMs = 15000; // force-reset after 15s of inactivity

    function _doShow() {
        try {
            const el = document.getElementById('globalNetworkSpinner');
            if (!el) return;
            el.classList.remove('hidden');
            el.setAttribute('aria-hidden', 'false');
            // ensure visible even if CSS is overridden
            el.style.display = '';
            spinnerVisible = true;
            lastActivity = Date.now();
        } catch (e) {}
    }

    function _doHide() {
        try {
            const el = document.getElementById('globalNetworkSpinner');
            if (!el) return;
            el.classList.add('hidden');
            el.setAttribute('aria-hidden', 'true');
            // force-hide at style level as last resort
            el.style.display = 'none';
            spinnerVisible = false;
        } catch (e) {}
    }

    function showGlobalSpinner() {
        try {
            spinnerCount = Math.max(0, spinnerCount) + 1;
            lastActivity = Date.now();
            // if already visible or timer set, do nothing
            if (spinnerVisible || spinnerTimer) return;
            // set timer to show after delay
            spinnerTimer = setTimeout(() => {
                spinnerTimer = null;
                if (spinnerCount > 0) _doShow();
            }, spinnerDelay);
        } catch (e) {}
    }

    function hideGlobalSpinner() {
        try {
            spinnerCount = Math.max(0, spinnerCount - 1);
            lastActivity = Date.now();
            if (spinnerCount > 0) return; // still active requests
            // no more requests: clear pending timer and hide immediately
            if (spinnerTimer) {
                clearTimeout(spinnerTimer);
                spinnerTimer = null;
            }
            if (spinnerVisible) {
                _doHide();
            }
        } catch (e) {}
    }

    function resetSpinner() {
        try {
            spinnerCount = 0;
            if (spinnerTimer) { clearTimeout(spinnerTimer); spinnerTimer = null; }
            // always attempt to hide the DOM element even if internal flag differs
            _doHide();
            lastActivity = 0;
        } catch (e) {}
    }

    function _dumpSpinner() {
        try {
            const el = document.getElementById('globalNetworkSpinner');
            return {
                spinnerCount,
                spinnerVisible,
                spinnerTimerSet: !!spinnerTimer,
                lastActivity,
                elementExists: !!el,
                elementClasses: el ? Array.from(el.classList) : null,
                elementStyleDisplay: el ? (el.style && el.style.display) : null
            };
        } catch (e) { return { error: String(e) }; }
    }

    function forceHideSpinner() {
        try {
            const el = document.getElementById('globalNetworkSpinner');
            if (el) {
                el.classList.add('hidden');
                el.setAttribute('aria-hidden', 'true');
                el.style.display = 'none';
            }
            spinnerCount = 0;
            spinnerTimer = null;
            spinnerVisible = false;
            lastActivity = 0;
        } catch (e) {}
    }

    // watchdog to recover spinner if it gets stuck
    try {
        setInterval(() => {
            try {
                if (spinnerVisible) {
                    const age = Date.now() - (lastActivity || 0);
                    if (age > watchdogTimeoutMs) {
                        resetSpinner();
                    }
                }
            } catch (e) {}
        }, watchdogIntervalMs);
    } catch (e) {}

    // attach to utils namespace if present
    if (window.utils) {
        window.utils.showGlobalSpinner = showGlobalSpinner;
        window.utils.hideGlobalSpinner = hideGlobalSpinner;
        window.utils.resetSpinner = resetSpinner;
        window.utils._dumpSpinner = _dumpSpinner;
        window.utils.forceHideSpinner = forceHideSpinner;
        window.utils._spinnerDelay = spinnerDelay;
    } else {
        window.utils = { showGlobalSpinner, hideGlobalSpinner, resetSpinner, _dumpSpinner, forceHideSpinner, _spinnerDelay: spinnerDelay };
    }
})();
