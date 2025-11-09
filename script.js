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
    const drop = document.getElementById('project-drop');
    const folderInput = document.getElementById('folder-input');

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
            if (idx !== -1) { apps[idx].title = newTitle;
                saveApps(apps); }
            cleanup();
        }

        function onKey(e) { if (e.key === 'Enter') { e.preventDefault();
                titleEl.blur(); } if (e.key === 'Escape') { e.preventDefault();
                titleEl.blur(); } }

        function cleanup() { titleEl.removeEventListener('blur', finish);
            document.removeEventListener('keydown', onKey); }

        titleEl.addEventListener('blur', finish);
        document.addEventListener('keydown', onKey);
    }

    function createAppCard(app) {
        const art = document.createElement('article');
        art.className = 'grid-item';
        art.dataset.appId = app.id;
        const link = document.createElement('a');
        link.className = 'app-link';
        if (app.link) { link.href = app.link;
            link.target = '_blank';
            link.rel = 'noopener'; } else { link.href = '#';
            link.addEventListener('click', function(e) { if (!app.link) { e.preventDefault();
                    alert('This project is stored locally in your browser. To open it from the server, place the project inside your WAMP www folder and refresh.'); } }); }

        const title = document.createElement('h3');
        title.className = 'app-title';
        title.textContent = app.title || 'Untitled project';
        title.title = 'Double-click to rename';
        title.tabIndex = 0;
        title.addEventListener('dblclick', (ev) => { ev.stopPropagation();
            enableEditing(title, app.id); });
        title.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault();
                title.blur(); } if (ev.key === 'Escape') { ev.preventDefault();
                title.blur(); } });

        const meta = document.createElement('div');
        meta.className = 'card-meta muted';
        meta.textContent = app.meta || '';
        link.appendChild(title);
        link.appendChild(meta);
        art.appendChild(link);
        grid.appendChild(art);
        return art;
    }

    function renderSavedApps() { const apps = loadApps();
        apps.forEach(app => createAppCard(app)); }

    function handleDropItems(items) {
        const apps = loadApps();
        const promises = [];
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it.kind === 'file' && typeof it.webkitGetAsEntry === 'function') {
                const entry = it.webkitGetAsEntry();
                if (entry && entry.isDirectory) { promises.push(traverseDirectory(entry)); }
            }
        }
        Promise.all(promises).then(results => {
            results.forEach(res => { const id = genId(); const a = { id, title: res.name, meta: `${res.fileCount} files` };
                apps.push(a);
                createAppCard(a); });
            saveApps(apps);
        });
    }

    function traverseDirectory(directoryEntry) {
        return new Promise((resolve) => {
            const reader = directoryEntry.createReader();
            let entries = [];

            function read() {
                reader.readEntries(function(results) {
                    if (!results.length) { const fileCount = entries.filter(e => !e.isDirectory).length;
                        resolve({ name: directoryEntry.name, fileCount }); } else { entries = entries.concat(Array.from(results));
                        read(); }
                }, () => resolve({ name: directoryEntry.name, fileCount: 0 }));
            }
            read();
        });
    }

    // Fallback: handle folder input (webkitdirectory)
    folderInput.addEventListener('change', function(e) {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const first = files[0];
        const rel = first.webkitRelativePath || first.name;
        const folder = rel.split('/')[0];
        const id = genId();
        const apps = loadApps();
        const a = { id, title: folder, meta: `${files.length} files` };
        apps.push(a);
        createAppCard(a);
        saveApps(apps);
        folderInput.value = '';
    });

    // Drop UI events
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, function(e) { e.preventDefault();
        drop.classList.add('dragover'); }));
    ['dragleave', 'drop', 'dragend'].forEach(ev => drop.addEventListener(ev, function(e) { if (ev === 'drop') e.preventDefault();
        drop.classList.remove('dragover'); }));

    drop.addEventListener('drop', function(e) { e.preventDefault();
        drop.classList.remove('dragover'); const items = e.dataTransfer && e.dataTransfer.items ? e.dataTransfer.items : []; if (items && items.length) { handleDropItems(items); } });
    drop.addEventListener('click', () => folderInput.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault();
            folderInput.click(); } });

    // Initialize
    renderSavedApps();

    // Add rename capability to any existing .app-title elements in markup (static ones)
    document.querySelectorAll('.app-title').forEach(titleEl => {
        const art = titleEl.closest('article');
        if (!art) return;
        const id = art.dataset.appId || ('static:' + (Math.random().toString(36).slice(2, 8)));
        art.dataset.appId = id;
        titleEl.addEventListener('dblclick', (ev) => { ev.stopPropagation();
            enableEditing(titleEl, id); });
        const apps = loadApps();
        const saved = apps.find(a => a.id === id);
        if (saved && saved.title) titleEl.textContent = saved.title;
    });

})();