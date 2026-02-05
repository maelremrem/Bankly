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
