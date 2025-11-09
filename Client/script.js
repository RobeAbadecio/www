// Theme toggle with localStorage
document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('theme-toggle');
    const body = document.body;
    const saved = localStorage.getItem('site-theme') || 'light';
    body.setAttribute('data-theme', saved);
    btn.textContent = saved === 'dark' ? 'Light' : 'Dark';

    btn.addEventListener('click', function() {
        const isDark = body.getAttribute('data-theme') === 'dark';
        const next = isDark ? 'light' : 'dark';
        body.setAttribute('data-theme', next);
        localStorage.setItem('site-theme', next);
        btn.textContent = next === 'dark' ? 'Light' : 'Dark';
    });
});

// --- Dashboard apps: drag/drop folders and inline rename support ---
(function() {
    const GRID_KEY = 'dashboard-apps-v1';
    const grid = document.getElementById('apps-grid');

    function loadApps() {
        const raw = localStorage.getItem(GRID_KEY);
        if (!raw) return [];
        try { return JSON.parse(raw); } catch (e) { return []; }
    }

    function saveApps(list) { localStorage.setItem(GRID_KEY, JSON.stringify(list)); }

    function genId() { return 'app-' + Math.random().toString(36).slice(2, 9); }

    function enableEditing(titleEl, id) {
        titleEl.contentEditable = 'true';
        titleEl.focus();
        const range = document.createRange();
        range.selectNodeContents(titleEl);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        function finish() {
            titleEl.contentEditable = 'false';
            const newTitle = titleEl.textContent.trim() || 'Untitled project';
            titleEl.textContent = newTitle;
            const apps = loadApps();
            const idx = apps.findIndex(a => a.id === id);
            if (idx !== -1) {
                apps[idx].title = newTitle;
                saveApps(apps);
            }
            cleanup();
        }

        function onKey(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                titleEl.blur();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                titleEl.blur();
            }
        }

        function cleanup() {
            titleEl.removeEventListener('blur', finish);
            document.removeEventListener('keydown', onKey);
        }

        titleEl.addEventListener('blur', finish);
        document.addEventListener('keydown', onKey);
    }

    function createAppCard(app) {
        const art = document.createElement('article');
        art.className = 'grid-item';
        art.dataset.appId = app.id;
        const link = document.createElement('a');
        link.className = 'app-link';
        if (app.link) {
            link.href = app.link;
            link.target = '_blank';
            link.rel = 'noopener';
        } else {
            link.href = '#';
            link.addEventListener('click', function(e) {
                if (!app.link) {
                    e.preventDefault();
                    alert('This project is stored locally in your browser. To open it from the server, place the project inside your WAMP www folder and refresh.');
                }
            });
        }

        const title = document.createElement('h3');
        title.className = 'app-title';
        title.textContent = app.title || 'Untitled project';
        title.title = 'Double-click to rename';
        title.tabIndex = 0;
        title.addEventListener('dblclick', (ev) => {
            ev.stopPropagation();
            enableEditing(title, app.id);
        });
        title.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                title.blur();
            }
            if (ev.key === 'Escape') {
                ev.preventDefault();
                title.blur();
            }
        });

        const meta = document.createElement('div');
        meta.className = 'card-meta muted';
        meta.textContent = app.meta || '';
        link.appendChild(title);
        link.appendChild(meta);
        art.appendChild(link);
        grid.appendChild(art);
        return art;
    }

    function renderSavedApps() {
        const apps = loadApps();
        apps.forEach(app => createAppCard(app));

        // Fetch server-managed apps from apps.json (served by WAMP root)
        fetch('/apps.json').then(resp => {
            if (!resp.ok) return [];
            return resp.json();
        }).then(serverApps => {
            (serverApps || []).forEach(sa => {
                // do not duplicate cards if the same link already exists
                if (grid.querySelector(`a[href="${sa.link}"]`)) return;
                createAppCard(sa);
            });
        }).catch(() => {
            // ignore fetch errors (file may not exist)
        });
    }

    // drag/drop features removed per request (uploader removed from HTML)

    // Initialize
    renderSavedApps();

    // Add rename capability to any existing .app-title elements in markup (static ones)
    document.querySelectorAll('.app-title').forEach(titleEl => {
        const art = titleEl.closest('article');
        if (!art) return;
        const id = art.dataset.appId || ('static:' + (Math.random().toString(36).slice(2, 8)));
        art.dataset.appId = id;
        titleEl.addEventListener('dblclick', (ev) => {
            ev.stopPropagation();
            enableEditing(titleEl, id);
        });
        const apps = loadApps();
        const saved = apps.find(a => a.id === id);
        if (saved && saved.title) titleEl.textContent = saved.title;
    });

})();