// i18n.js - Simple frontend internationalization

(function () {
    const STORAGE_KEY = 'bankly_language';
    const I18N = {
        lang: 'en',
        messages: {}
    };

    function getValue(obj, path) {
        return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
    }

    async function loadLanguage(lang) {
        const response = await fetch(`/i18n/${lang}.json`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Failed to load language file: ${lang}`);
        }
        I18N.messages = await response.json();
        I18N.lang = lang;
        localStorage.setItem(STORAGE_KEY, lang);
        document.documentElement.lang = lang;
    }

    function t(key, fallback = '') {
        const value = getValue(I18N.messages, key);
        if (value === undefined || value === null) return fallback || key;
        return value;
    }

    function applyTranslations(root = document) {
        const elements = root.querySelectorAll('[data-i18n]');
        elements.forEach((el) => {
            const key = el.getAttribute('data-i18n');
            const value = t(key);
            if (value) el.textContent = value;
        });

        const placeholders = root.querySelectorAll('[data-i18n-placeholder]');
        placeholders.forEach((el) => {
            const key = el.getAttribute('data-i18n-placeholder');
            const value = t(key);
            if (value) el.setAttribute('placeholder', value);
        });

        const titles = root.querySelectorAll('[data-i18n-title]');
        titles.forEach((el) => {
            const key = el.getAttribute('data-i18n-title');
            const value = t(key);
            if (value) el.setAttribute('title', value);
        });
    }

    async function init(preferredLang) {
        const stored = localStorage.getItem(STORAGE_KEY);
        const browserLang = navigator.language && navigator.language.startsWith('fr') ? 'fr' : 'en';
        const lang = preferredLang || stored || browserLang || 'en';
        await loadLanguage(lang);
        applyTranslations();
        const select = document.getElementById('languageSelect');
        if (select) select.value = I18N.lang;
    }

    async function setLanguage(lang) {
        if (!lang || lang === I18N.lang) return;
        await loadLanguage(lang);
        applyTranslations();
    }

    window.i18n = {
        t,
        init,
        setLanguage,
        applyTranslations,
        getCurrentLanguage: () => I18N.lang
    };
})();
