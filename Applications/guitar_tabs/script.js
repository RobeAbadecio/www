document.addEventListener('DOMContentLoaded', async function() {
    // --- API Configuration (must be at top before any API calls) ---
    const API_BASE = '/api/guitar-tabs/songs.php';

    async function apiListSongs() {
        try {
            console.log('[API] Fetching songs list from:', API_BASE);
            // Add cache-busting timestamp to prevent browser caching
            const url = API_BASE + '?_=' + Date.now();
            const res = await fetch(url, {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache' }
            });
            console.log('[API] Response status:', res.status, res.statusText);
            const text = await res.text();
            console.log('[API] Response body:', text.substring(0, 200));
            const json = JSON.parse(text);
            console.log('[API] Server response:', json);
            if (!res.ok || !json.success) {
                throw new Error(json.message || 'List failed');
            }
            const names = (json.songs || []).map(s => s.name).filter(Boolean);
            console.log('[API] Found', names.length, 'songs:', names);
            return names;
        } catch (e) {
            console.error('[API] List songs failed:', e);
            alert('Error loading songs from server: ' + e.message + '\n\nPlease check the debug page for details.');
            return null; // signal fallback
        }
    }

    async function apiLoadSong(name) {
        const url = API_BASE + '?name=' + encodeURIComponent(name) + '&_=' + Date.now();
        console.log('[API] Loading song:', name, 'from', url);
        const res = await fetch(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
        const json = await res.json();
        console.log('[API] Load response:', json);
        if (!res.ok || !json.success || !json.song || !json.song.data) throw new Error(json.message || 'Load failed');
        // Return full object so we can access updated_at for live sync
        return json.song; // { name, data, updated_at, created_at }
    }

    async function apiSaveSong(name, data) {
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, data })
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'Save failed');
        return true;
    }

    async function apiDeleteSong(name) {
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', name })
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'Delete failed');
        return true;
    }

    async function apiRenameSong(oldName, newName) {
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'rename', oldName, newName })
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'Rename failed');
        return true;
    }

    // --- End of API functions ---

    // Live sync state
    let isDirty = false; // true while we have unsaved local edits
    let lastLocalSaveAt = 0; // timestamp of last local save
    const lastLoadedVersion = {}; // map: songName -> updated_at seen

    // Backing audio state
    let currentAudio = null;
    let currentAudioMeta = { url: null, volume: 1.0, name: '' };

    // Sidebar toggle functionality (defensive guards)
    const toggler = document.querySelector('.toggler');
    const sidebar = document.querySelector('.sidebar');
    const chevronIcon = toggler ? toggler.querySelector('.material-symbols-rounded') : null;
    if (toggler && sidebar && chevronIcon) {
        toggler.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');

            // Rotate chevron icon
            if (sidebar.classList.contains('collapsed')) {
                chevronIcon.style.transform = 'rotate(180deg)';
            } else {
                chevronIcon.style.transform = 'rotate(0deg)';
            }
        });
    }

    // Guitar tab interaction
    // Modal elements for editing notes
    const noteModal = document.getElementById('note-modal');
    const noteValueInput = document.getElementById('note-value');
    const noteDelayInput = document.getElementById('note-delay');
    const noteSaveBtn = document.getElementById('note-save');
    const noteCancelBtn = document.getElementById('note-cancel');
    let activeDash = null;

    // Playback state
    const playbackState = { playing: false, paused: false, stopped: false, currentStep: 0, totalSteps: 0 };

    function openNoteModal(dashSpan) {
        activeDash = dashSpan;
        noteValueInput.value = dashSpan.textContent === '-' ? '' : dashSpan.textContent;
        noteDelayInput.value = dashSpan.dataset.delay || 500;
        noteModal.setAttribute('aria-hidden', 'false');
    }

    function closeNoteModal() {
        activeDash = null;
        noteModal.setAttribute('aria-hidden', 'true');
    }

    if (noteCancelBtn) noteCancelBtn.addEventListener('click', () => closeNoteModal());
    if (noteModal) {
        const overlayEl = noteModal.querySelector('.modal-overlay');
        if (overlayEl) overlayEl.addEventListener('click', () => closeNoteModal());
    }
    if (noteSaveBtn) noteSaveBtn.addEventListener('click', async() => {
        if (!activeDash) return closeNoteModal();
        const val = noteValueInput.value.trim();
        const delay = parseInt(noteDelayInput.value) || 500;

        // Save delay first (allow custom delay on any symbol including dashes)
        if (delay !== 500) {
            activeDash.dataset.delay = delay;
        } else {
            delete activeDash.dataset.delay; // remove default delay
        }

        // Then handle the value
        if (val === '') {
            activeDash.textContent = '-';
            activeDash.classList.remove('tab-note');
        } else {
            const validInput = /^([0-9]{1,2}|[hpbr\/\\~])$/.test(val);
            if (!validInput) { alert('Invalid value'); return; }
            activeDash.textContent = val;
            activeDash.classList.add('tab-note');
        }
        closeNoteModal();
        // auto-save after editing a note
        isDirty = true;
        await autoSaveCurrentSong();
        lastLocalSaveAt = Date.now();
        isDirty = false;
    });
    // Initialize all existing tab sections on page load
    document.querySelectorAll('.tab-section').forEach(section => {
        initializeSingleTabSection(section);
    }); // Function to initialize a single tab section
    // Render saved song buttons in sidebar from server (fallback to localStorage)
    await renderSavedSongs();
    // If nothing is active, auto-select and load the first saved song
    (function autoSelectFirstSaved() {
        const hasActive = !!document.querySelector('.sidebar .song-button.active');
        if (hasActive) return;
        const firstEntry = document.querySelector('#song-list .song-entry');
        if (!firstEntry) return;
        const btn = firstEntry.querySelector('.song-button');
        if (!btn) return;
        btn.classList.add('active');
        const name = firstEntry.dataset.name || btn.dataset.name;
        if (name && name !== 'First Song') {
            loadSongByName(name);
        }
    })();

    // Wire up the existing First Song button to load an empty First Song
    const firstSongBtn = document.querySelector('#song-list [data-name="First Song"]');
    if (firstSongBtn) {
        firstSongBtn.addEventListener('click', () => {
            // mark active
            document.querySelectorAll('.sidebar .song-button').forEach(b => b.classList.remove('active'));
            firstSongBtn.classList.add('active');
            loadFirstSong();
        });
    }

    function initializeSingleTabSection(section) {
        const tabContent = section.querySelector('.tab-content');
        const lines = tabContent.textContent.split('\n');
        const tabLines = lines.map(line => line.trim()).filter(line => line);

        // Add delete section button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-section-button';
        deleteBtn.innerHTML = '<span class="material-symbols-rounded">close</span>';
        deleteBtn.title = 'Delete section';
        deleteBtn.addEventListener('click', async() => {
            if (document.querySelectorAll('.tab-section').length <= 1) {
                alert('Cannot delete the last section');
                return;
            }
            if (confirm('Delete this section?')) {
                section.remove();
                isDirty = true;
                await autoSaveCurrentSong(); // Save after deleting
                lastLocalSaveAt = Date.now();
                isDirty = false;
            }
        });
        section.appendChild(deleteBtn);

        // Create interactive tab display
        const interactiveTab = document.createElement('div');
        interactiveTab.className = 'interactive-tab';

        tabLines.forEach((line, stringIndex) => {
            const tabLine = document.createElement('div');
            tabLine.className = 'tab-line';
            const [stringName, ...dashes] = line.split('|');

            // Add string name
            const stringLabel = document.createElement('span');
            stringLabel.className = 'string-name';
            stringLabel.textContent = stringName;
            tabLine.appendChild(stringLabel);

            // Add separator
            tabLine.appendChild(document.createTextNode('|'));

            // Add interactive dashes
            const dashesContainer = document.createElement('div');
            dashesContainer.className = 'dashes-container';

            // Create exactly 80 dashes for each string
            Array(80).fill('-').forEach(() => {
                const dashSpan = document.createElement('span');
                dashSpan.className = 'tab-dash';
                dashSpan.textContent = '-';

                // Left click opens modal to edit value/delay
                dashSpan.addEventListener('click', function(e) {
                    openNoteModal(dashSpan);
                });

                // Right click to remove note (autosaves immediately)
                dashSpan.addEventListener('contextmenu', async function(e) {
                    e.preventDefault();
                    dashSpan.textContent = '-';
                    dashSpan.classList.remove('tab-note');
                    delete dashSpan.dataset.delay;
                    try {
                        isDirty = true;
                        await autoSaveCurrentSong();
                        lastLocalSaveAt = Date.now();
                    } catch (_) { /* ignore */ } finally { isDirty = false; }
                });

                dashesContainer.appendChild(dashSpan);
            });
            tabLine.appendChild(dashesContainer);

            // Add ending separator
            tabLine.appendChild(document.createTextNode('|'));

            interactiveTab.appendChild(tabLine);
        });

        // Replace original tab content with interactive version
        tabContent.style.display = 'none';
        section.appendChild(interactiveTab);
    }

    // Handle "Add New Tab Section" button
    const addTabButton = document.querySelector('.add-tab-button');
    if (addTabButton) addTabButton.addEventListener('click', async() => {
        const tabContainer = document.querySelector('.tab-container');
        const newSection = document.createElement('div');
        newSection.className = 'tab-section';
        newSection.innerHTML = `
            <pre class="tab-content">e|--------------------------------------------------------------------------------
B|--------------------------------------------------------------------------------
G|--------------------------------------------------------------------------------
D|--------------------------------------------------------------------------------
A|--------------------------------------------------------------------------------
E|--------------------------------------------------------------------------------|</pre>
        `;

        // Insert new section before the add button
        tabContainer.insertBefore(newSection, addTabButton);

        // Initialize only the new section
        initializeSingleTabSection(newSection);
        // auto-save after adding a tab section
        isDirty = true;
        await autoSaveCurrentSong();
        lastLocalSaveAt = Date.now();
        isDirty = false;
    });

    // helper: sleep with pause/stop awareness
    function waitFor(ms) {
        return new Promise(resolve => {
            let elapsed = 0;
            const step = 50;

            function tick() {
                if (playbackState.stopped) return resolve('stopped');
                if (playbackState.paused) { setTimeout(tick, step); return; }
                elapsed += step;
                if (elapsed >= ms) return resolve();
                setTimeout(tick, step);
            }
            setTimeout(tick, step);
        });
    }

    // Play a single section column-by-column (left-to-right across strings)
    async function playSection(section, progressOffset = 0, progressTotal = 0, progressCallback = null) {
        const lines = section.querySelectorAll('.interactive-tab .tab-line');
        if (!lines.length) return;

        // Find the last column with a note in this section
        let lastNoteCol = -1;
        lines.forEach(line => {
            const dashes = Array.from(line.querySelectorAll('.dashes-container .tab-dash'));
            for (let i = dashes.length - 1; i >= 0; i--) {
                if (dashes[i].classList.contains('tab-note')) {
                    lastNoteCol = Math.max(lastNoteCol, i);
                    break;
                }
            }
        });

        // Play up to the last note (plus one to include it)
        for (let c = 0; c <= lastNoteCol; c++) {
            if (playbackState.stopped) break;
            // Get all dashes in this column and any notes
            const notes = [];
            const allDashesInColumn = [];
            const techniquesToHighlight = new Map(); // Map of stringIndex -> {type, targetCol}

            lines.forEach((line, stringIndex) => {
                const span = line.querySelectorAll('.dashes-container .tab-dash')[c];
                if (span) {
                    allDashesInColumn.push(span);
                    if (span.classList.contains('tab-note')) {
                        notes.push(span);
                        // Check for techniques that need to highlight to next note
                        if (['b', 'h', '/'].includes(span.textContent)) {
                            let nextCol = c + 1;
                            const dashesInLine = line.querySelectorAll('.dashes-container .tab-dash');
                            while (nextCol < dashesInLine.length) {
                                const nextSpan = dashesInLine[nextCol];
                                if (nextSpan.classList.contains('tab-note')) {
                                    notes.push(nextSpan); // Include target note in delay calculation
                                    techniquesToHighlight.set(stringIndex, {
                                        type: span.textContent,
                                        targetCol: nextCol,
                                        startCol: c
                                    });
                                    break;
                                }
                                nextCol++;
                            }
                        }
                    }
                }
            });

            // Clear any existing highlights first
            section.querySelectorAll('.highlight').forEach(h => {
                h.classList.remove('highlight');
                delete h.dataset.techniqueTarget;
                delete h.dataset.techniqueType;
            });

            // Highlight entire current column
            allDashesInColumn.forEach(dash => dash.classList.add('highlight'));

            // For strings with techniques, highlight up to the next note
            techniquesToHighlight.forEach((info, stringIndex) => {
                const line = lines[stringIndex];
                const dashesInLine = line.querySelectorAll('.dashes-container .tab-dash');
                let nextCol = c + 1;
                while (nextCol <= info.targetCol) {
                    const nextSpan = dashesInLine[nextCol];
                    // Mark cells as technique targets
                    nextSpan.classList.add('highlight');
                    nextSpan.dataset.techniqueTarget = 'true';
                    nextSpan.dataset.techniqueType = info.type;
                    nextCol++;
                }
            });

            // use custom delay if set, otherwise default
            const delays = notes.map(n => parseInt(n.dataset.delay) || 500);
            const delay = delays.length ? Math.max(...delays) : 0;
            const res = await waitFor(delay);

            // remove highlight from all notes and clean up bend targets
            section.querySelectorAll('.highlight').forEach(h => {
                h.classList.remove('highlight');
                delete h.dataset.bendTarget;
            });
            // update progress
            if (progressCallback && progressTotal > 0) {
                progressOffset++;
                progressCallback(progressOffset / progressTotal * 100);
            }
            if (res === 'stopped') break;
        }
        return;
    }

    // Play all sections top-to-bottom, each section column-wise
    async function playAllSections() {
        // Clear any existing state
        playbackState.stopped = false;
        playbackState.paused = false;
        // Find the last column with a non-dash symbol across all sections
        const sections = Array.from(document.querySelectorAll('.tab-section'));

        // Get the last non-dash position for each section
        const sectionEndCols = sections.map(section => {
            let lastCol = -1;
            const lines = section.querySelectorAll('.interactive-tab .tab-line');
            lines.forEach(line => {
                const dashes = Array.from(line.querySelectorAll('.dashes-container .tab-dash'));
                for (let i = dashes.length - 1; i >= 0; i--) {
                    if (dashes[i].classList.contains('tab-note')) {
                        lastCol = Math.max(lastCol, i);
                        break;
                    }
                }
            });
            return lastCol + 1; // +1 since we want to include the last note
        }).filter(col => col > 0); // Only include sections that have notes

        // Calculate total steps (sum of all sections' playable columns)
        const totalSteps = sectionEndCols.reduce((sum, cols) => sum + cols, 0);
        playbackState.currentStep = 0;
        playbackState.totalSteps = totalSteps;

        const progressFill = document.querySelector('.progress-fill');
        let currentProgress = 0;

        // Play each section up to its last non-dash column
        for (let i = 0; i < sections.length; i++) {
            if (playbackState.stopped) break;

            // Skip empty sections
            if (!sectionEndCols[i]) continue;

            // Play this section up to its last note
            await playSection(sections[i], currentProgress, totalSteps, pct => {
                if (progressFill) progressFill.style.width = pct + '%';
            });

            currentProgress += sectionEndCols[i];
            if (progressFill) {
                progressFill.style.width = (currentProgress / totalSteps * 100) + '%';
            }
        }

        // Reset state when done
        if (document.querySelector('.progress-fill')) {
            document.querySelector('.progress-fill').style.width = '0%';
        }
        playbackState.playing = false;
        playbackState.paused = false;
        playbackState.stopped = false;
    }

    // Wire up global controls
    const playAllBtn = document.querySelector('.play-all-button');
    const stopBtn = document.querySelector('.stop-button');

    function updatePlayButtonState() {
        if (!playAllBtn) return;
        const icon = playAllBtn.querySelector('.material-symbols-rounded');
        const text = playAllBtn.querySelector('.button-text');

        if (playbackState.paused) {
            playAllBtn.classList.add('paused');
            icon.textContent = 'pause';
            text.textContent = 'Paus';
        } else {
            playAllBtn.classList.remove('paused');
            icon.textContent = 'play_arrow';
            text.textContent = 'Play';
        }
    }

    if (playAllBtn) {
        playAllBtn.addEventListener('click', async() => {
            if (playbackState.playing) {
                // If already playing, toggle pause state
                playbackState.paused = !playbackState.paused;
                // Sync backing audio with pause/resume
                if (currentAudio) {
                    try {
                        if (playbackState.paused) {
                            currentAudio.pause();
                        } else {
                            await currentAudio.play();
                        }
                    } catch (e) { /* ignore */ }
                }
                updatePlayButtonState();
                return;
            }

            // Start new playback
            playbackState.playing = true;
            playbackState.paused = false;
            playbackState.stopped = false;
            // Start backing audio if attached
            if (currentAudio && currentAudioMeta.url) {
                try {
                    currentAudio.currentTime = 0;
                    currentAudio.volume = Number((currentAudioMeta.volume != null) ? currentAudioMeta.volume : 1.0);
                    await currentAudio.play();
                } catch (e) { /* ignore */ }
            }
            updatePlayButtonState();
            await playAllSections();
            playbackState.playing = false;
            playbackState.paused = false;
            // Stop backing audio when done
            if (currentAudio) {
                try {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                } catch (e) { /* ignore */ }
            }
            updatePlayButtonState();
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            playbackState.stopped = true;
            playbackState.paused = false;
            playbackState.playing = false;
            // Stop audio immediately
            if (currentAudio) {
                try {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                } catch (e) { /* ignore */ }
            }

            // Clear any remaining highlights
            document.querySelectorAll('.highlight').forEach(h => {
                h.classList.remove('highlight');
                delete h.dataset.techniqueTarget;
                delete h.dataset.techniqueType;
            });

            // Reset progress bar
            const progressFill = document.querySelector('.progress-fill');
            if (progressFill) progressFill.style.width = '0%';

            // Reset play button state
            updatePlayButtonState();
        });
    }

    // --- Save / Load functionality (Server-backed repository with localStorage fallback) ---

    function serializeSong() {
        const sections = [];
        document.querySelectorAll('.tab-section').forEach(section => {
            const sectionData = { strings: [] };
            const lines = section.querySelectorAll('.interactive-tab .tab-line');
            lines.forEach(line => {
                const dashes = [];
                line.querySelectorAll('.dashes-container .tab-dash').forEach(dashSpan => {
                    dashes.push({
                        value: dashSpan.textContent,
                        delay: dashSpan.dataset.delay ? parseInt(dashSpan.dataset.delay) : null
                    });
                });
                sectionData.strings.push(dashes);
            });
            sections.push(sectionData);
        });
        return { sections, audio: currentAudioMeta };
    }

    function listSavedSongsLocal() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('guitar_tabs_')) keys.push(k.replace('guitar_tabs_', ''));
        }
        return keys;
    }

    // Render saved songs into the top song list (preload)
    async function renderSavedSongs() {
        console.log('[Render] Loading saved songs...');
        const loadingMsg = document.getElementById('loading-songs');

        // Try server first
        const serverList = await apiListSongs();
        let names = [];
        if (serverList !== null && serverList.length > 0) {
            console.log('[Render] Using server songs:', serverList);
            names = serverList;
        } else {
            console.log('[Render] Server empty or failed, checking localStorage...');
            const localNames = listSavedSongsLocal();
            console.log('[Render] Found', localNames.length, 'songs in localStorage');
            names = localNames;
        }
        console.log('[Render] Creating buttons for', names.length, 'songs');

        // Remove loading message
        if (loadingMsg) {
            loadingMsg.remove();
            console.log('[Render] Loading message removed');
        }

        // Show message if no songs found
        if (names.length === 0) {
            console.log('[Render] No songs found, showing message');
            const noSongsMsg = document.createElement('div');
            noSongsMsg.id = 'no-songs-msg';
            noSongsMsg.style.cssText = 'padding: 10px; color: #999; font-size: 14px; text-align: center;';
            noSongsMsg.textContent = 'No saved songs. Click "Add New Song" to start.';
            const songList = document.getElementById('song-list');
            if (songList) {
                songList.insertBefore(noSongsMsg, songList.firstChild);
                console.log('[Render] No songs message added to DOM');
            } else {
                console.error('[Render] Could not find #song-list element!');
            }
        } else {
            console.log('[Render] Found', names.length, 'songs, creating buttons...');
        }

        names.forEach((name, index) => {
            console.log(`[Render] Creating button ${index + 1}/${names.length}: "${name}"`);
            const result = createSongListButton(name, { saved: true, active: false });
            console.log(`[Render] Button created for "${name}":`, result ? 'success' : 'failed');
        });

        console.log('[Render] Finished rendering songs');

        // Verify buttons were added
        const buttonCount = document.querySelectorAll('#song-list .song-entry').length;
        console.log(`[Render] Total song buttons in DOM: ${buttonCount}`);
    }

    // Return the currently active song name (or null)
    function getActiveSongName() {
        const activeBtn = document.querySelector('.sidebar .song-button.active');
        if (activeBtn && activeBtn.dataset.name) return activeBtn.dataset.name;
        // fallback to first song-entry container
        const first = document.querySelector('#song-list .song-entry');
        if (first) return first.dataset.name || (first.querySelector('.song-button') ? first.querySelector('.song-button').dataset.name : null);
        return null;
    }

    // Auto-save the currently active song to localStorage using its name
    async function autoSaveCurrentSong() {
        const name = getActiveSongName();
        if (!name) return;
        const data = serializeSong();
        // Try to save on server; if that fails, fallback to localStorage
        let savedServer = false;
        try {
            await apiSaveSong(name, data);
            savedServer = true;
        } catch (e) { savedServer = false; }
        if (!savedServer) {
            try { localStorage.setItem('guitar_tabs_' + name, JSON.stringify(data)); } catch (err) { /* ignore */ }
        }
        // mark UI as saved for this song
        const container = document.querySelector('#song-list [data-name="' + CSS.escape(name) + '"]');
        if (container) {
            const btn = container.querySelector('.song-button');
            if (btn) btn.dataset.saved = '1';
        }
    }

    // Perform rename: move storage key and update UI
    async function performRename(oldName, newName, container, btn) {
        if (!oldName || !newName) return false;
        const list = document.getElementById('song-list');
        const existing = list.querySelector('[data-name="' + CSS.escape(newName) + '"]');
        if (existing && existing !== container) {
            if (!confirm('A song named "' + newName + '" already exists. Overwrite it?')) return false;
            try { await apiDeleteSong(newName); } catch (err) { try { localStorage.removeItem('guitar_tabs_' + newName); } catch (e) {} }
            existing.remove();
        }
        // Try server rename; fallback to localStorage move
        let renamed = false;
        try {
            await apiRenameSong(oldName, newName);
            renamed = true;
        } catch (e) { renamed = false; }
        if (!renamed) {
            try {
                const oldKey = 'guitar_tabs_' + oldName;
                const newKey = 'guitar_tabs_' + newName;
                let payload = localStorage.getItem(oldKey);
                if (!payload) payload = JSON.stringify(serializeSong());
                localStorage.setItem(newKey, payload);
                try { localStorage.removeItem(oldKey); } catch (err) { /* ignore */ }
            } catch (err) {
                console.error('Rename failed (storage):', err);
                alert('Failed to rename song: ' + err.message);
                return false;
            }
        }

        // update UI container and button
        container.dataset.name = newName;
        if (btn) {
            btn.dataset.name = newName;
            btn.textContent = newName;
        }
        return true;
    }

    // Create or return a song button in the top song-list
    function createSongListButton(name, opts = {}) {
        const list = document.getElementById('song-list');
        if (!list) return null;
        // check existing
        let existing = list.querySelector('[data-name="' + CSS.escape(name) + '"]');
        if (existing) {
            if (opts.active) {
                list.querySelectorAll('.song-button').forEach(b => b.classList.remove('active'));
                const existingBtn = existing.querySelector('.song-button');
                if (existingBtn) existingBtn.classList.add('active');
            }
            return existing;
        }

        // container holds the song button and a delete control
        const container = document.createElement('div');
        container.className = 'song-entry';
        container.dataset.name = name;

        const btn = document.createElement('button');
        btn.className = 'song-button';
        btn.textContent = name;
        btn.dataset.name = name;
        if (opts.saved) btn.dataset.saved = '1';

        btn.addEventListener('click', () => {
            // make active in both lists
            document.querySelectorAll('.sidebar .song-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const curName = container.dataset.name;
            // load song
            if (curName === 'First Song') {
                loadFirstSong();
            } else if (opts.saved) {
                loadSongByName(curName);
            } else {
                loadEmptySong(curName);
            }
        });

        // double-click on the song name starts inline rename
        btn.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const curName = container.dataset.name;
            // create inline input
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'rename-input';
            input.value = curName;
            // hide existing controls while renaming
            btn.style.display = 'none';
            ren.style.display = 'none';
            del.style.display = 'none';
            container.insertBefore(input, del);
            input.focus();
            input.select();

            function finishCommit() {
                const newName = input.value.trim();
                if (newName && newName !== curName) {
                    const ok = performRename(curName, newName, container, btn);
                    if (!ok) {
                        // abort, show controls again
                        btn.style.display = '';
                        ren.style.display = '';
                        del.style.display = '';
                        input.remove();
                        return;
                    }
                }
                // cleanup
                btn.style.display = '';
                ren.style.display = '';
                del.style.display = '';
                input.remove();
            }

            function cancelRename() {
                btn.style.display = '';
                ren.style.display = '';
                del.style.display = '';
                input.remove();
            }

            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { finishCommit(); }
                if (ev.key === 'Escape') { cancelRename(); }
            });
            input.addEventListener('blur', () => finishCommit());
        });

        const del = document.createElement('button');
        del.className = 'delete-song-button';
        del.title = 'Delete song';
        del.innerHTML = '<span class="material-symbols-rounded">delete</span>';
        del.addEventListener('click', async(e) => {
            e.stopPropagation();
            const curName = container.dataset.name;
            if (!confirm('Delete song "' + curName + '"? This cannot be undone.')) return;
            // Try server delete; fallback to localStorage
            try { await apiDeleteSong(curName); } catch (err) { try { localStorage.removeItem('guitar_tabs_' + curName); } catch (e2) {} }
            // remove from UI
            container.remove();
        });

        // rename button
        const ren = document.createElement('button');
        ren.className = 'rename-song-button';
        ren.title = 'Rename song';
        ren.innerHTML = '<span class="material-symbols-rounded">edit</span>';
        ren.addEventListener('click', (e) => {
            e.stopPropagation();
            const curName = container.dataset.name;
            const newNameRaw = prompt('Enter new name for song:', curName);
            if (!newNameRaw) return; // cancelled or empty
            const newName = newNameRaw.trim();
            if (!newName || newName === curName) return;
            performRename(curName, newName, container, btn);
        });

        container.appendChild(btn);
        container.appendChild(ren);
        container.appendChild(del);
        list.appendChild(container);

        // mark active if requested
        if (opts.active) {
            list.querySelectorAll('.song-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }

        return container;
    }

    function loadFirstSong() {
        // clear and create one empty section
        const tabContainer = document.querySelector('.tab-container');
        const addBtn = document.querySelector('.add-tab-button');
        tabContainer.querySelectorAll('.tab-section').forEach(s => s.remove());
        const firstSection = document.createElement('div');
        firstSection.className = 'tab-section';
        firstSection.innerHTML = `\
            <pre class="tab-content">e|${'-'.repeat(80)}\nB|${'-'.repeat(80)}\nG|${'-'.repeat(80)}\nD|${'-'.repeat(80)}\nA|${'-'.repeat(80)}\nE|${'-'.repeat(80)}|</pre>\
        `;
        tabContainer.insertBefore(firstSection, addBtn);
        initializeSingleTabSection(firstSection);
    }

    function loadEmptySong(name) {
        const tabContainer = document.querySelector('.tab-container');
        const addBtn = document.querySelector('.add-tab-button');
        tabContainer.querySelectorAll('.tab-section').forEach(s => s.remove());
        const newSection = document.createElement('div');
        newSection.className = 'tab-section';
        newSection.innerHTML = `\
            <pre class="tab-content">e|${'-'.repeat(80)}\nB|${'-'.repeat(80)}\nG|${'-'.repeat(80)}\nD|${'-'.repeat(80)}\nA|${'-'.repeat(80)}\nE|${'-'.repeat(80)}|</pre>\
        `;
        tabContainer.insertBefore(newSection, addBtn);
        initializeSingleTabSection(newSection);
        // reset audio for new empty song
        const volInput = document.getElementById('audio-volume');
        const nameSpan = document.getElementById('audio-name');
        if (currentAudio) { try { currentAudio.pause(); } catch (e) {} }
        currentAudio = null;
        currentAudioMeta = { url: null, volume: (volInput ? Number(volInput.value || 1.0) : 1.0), name: '' };
        if (nameSpan) nameSpan.textContent = '';
    }

    // Add new song (creates song button and loads empty content)
    const addSongBtn = document.querySelector('.add-song');

    function generateUntitledName() {
        const base = 'Untitled';
        let i = 1;
        const existing = new Set(Array.from(document.querySelectorAll('[data-name]')).map(b => b.dataset.name));
        while (existing.has(base + ' ' + i)) i++;
        return base + ' ' + i;
    }
    if (addSongBtn) {
        addSongBtn.addEventListener('click', () => {
            // auto-generate a name and create the song without prompting
            const name = generateUntitledName();
            createSongListButton(name, { saved: false, active: true });
            loadEmptySong(name);
            // immediately auto-save the new song
            autoSaveCurrentSong();
        });
    }

    // Auto-refresh song list every 5 seconds to keep all devices in sync
    let lastSongList = [];
    async function autoRefreshSongs() {
        try {
            const serverList = await apiListSongs();
            if (serverList && serverList.length > 0) {
                // Check if song list has changed
                const listChanged = JSON.stringify(serverList.sort()) !== JSON.stringify(lastSongList.sort());
                if (listChanged) {
                    console.log('[Auto-Refresh] Song list changed, updating UI');
                    lastSongList = [...serverList];

                    // Get currently active song before refresh
                    const activeSongName = getActiveSongName();

                    // Remove existing song entries (except add button)
                    document.querySelectorAll('#song-list .song-entry').forEach(entry => entry.remove());
                    const _noMsg = document.getElementById('no-songs-msg');
                    if (_noMsg) _noMsg.remove();

                    // Re-render songs
                    serverList.forEach(name => {
                        createSongListButton(name, {
                            saved: true,
                            active: name === activeSongName
                        });
                    });

                    console.log('[Auto-Refresh] UI updated with', serverList.length, 'songs');
                }
            }
        } catch (e) {
            console.error('[Auto-Refresh] Failed:', e);
        }
    }

    // Start auto-refresh loop (fallback; SSE handles near real-time)
    setInterval(autoRefreshSongs, 10000);
    console.log('[Auto-Refresh] Started - fallback every 10 seconds');

    // Live-sync: poll active song content and reload if server version changed (fallback)
    async function pollActiveSongContent() {
        try {
            const name = getActiveSongName();
            if (!name || name === 'First Song') return;
            // avoid clobbering local edits or immediate post-save
            if (isDirty) return;
            if (Date.now() - lastLocalSaveAt < 1000) return;

            // Load lightweight info by fetching full song (small JSON); API already supports cache-busting
            const songObj = await apiLoadSong(name);
            const serverVer = songObj.updated_at || null;
            const lastVer = lastLoadedVersion[name] || null;
            if (serverVer && lastVer && serverVer === lastVer) return; // no change

            // If changed on server, reload UI from server
            if (serverVer && serverVer !== lastVer) {
                console.log('[Live-Sync] Detected update for', name, '-> reloading');
                await loadSongByName(name);
                lastLoadedVersion[name] = serverVer;
            } else if (!lastVer && serverVer) {
                // first time tracking this song's version
                lastLoadedVersion[name] = serverVer;
            }
        } catch (e) {
            // Silently ignore; device may be offline or song removed
        }
    }
    // Poll every 10 seconds as a fallback; SSE will push immediate updates
    setInterval(pollActiveSongContent, 10000);
    console.log('[Live-Sync] Started - fallback polling active song every 10s');

    // Prefer SSE for real-time updates
    function connectLiveUpdates() {
        if (!('EventSource' in window)) {
            console.warn('[Live-Sync] EventSource not supported; using polling');
            return;
        }
        try {
            const es = new EventSource('/api/guitar-tabs/changes.php');
            es.addEventListener('update', (ev) => {
                try {
                    const payload = JSON.parse(ev.data || '{}');
                    const names = Array.isArray(payload.names) ? payload.names : [];
                    const updatedMap = payload.updatedMap || {};

                    // Update song list if changed
                    const listChanged = JSON.stringify([...names].sort()) !== JSON.stringify([...lastSongList].sort());
                    if (listChanged) {
                        const active = getActiveSongName();
                        lastSongList = [...names];
                        document.querySelectorAll('#song-list .song-entry').forEach(e => e.remove());
                        const _noMsg = document.getElementById('no-songs-msg');
                        if (_noMsg) _noMsg.remove();
                        names.forEach(n => createSongListButton(n, { saved: true, active: n === active }));
                        console.log('[SSE] Updated song list via server push');
                    }

                    // If active song changed on server, reload it (unless we just saved/are editing)
                    const activeName = getActiveSongName();
                    if (activeName) {
                        const serverVer = updatedMap[activeName];
                        const lastVer = lastLoadedVersion[activeName];
                        if (serverVer && serverVer !== lastVer && !isDirty && (Date.now() - lastLocalSaveAt >= 300)) {
                            loadSongByName(activeName).then(() => { lastLoadedVersion[activeName] = serverVer; });
                        }
                    }
                } catch (e) { /* ignore parse errors */ }
            });
            es.onerror = () => {
                console.warn('[SSE] Connection error; browser will retry automatically');
            };
        } catch (e) {
            console.warn('[SSE] Failed to connect; falling back to polling');
        }
    }
    connectLiveUpdates();

    // Load by name (no prompt) and reuse existing logic
    async function loadSongByName(name) {
        if (!name) return;
        let songObj = null;
        try { songObj = await apiLoadSong(name); } catch (e) {
            const raw = localStorage.getItem('guitar_tabs_' + name);
            if (!raw) { alert('No saved song with that name'); return; }
            songObj = { name, data: JSON.parse(raw), updated_at: null };
        }
        const data = songObj.data;

        const tabContainer = document.querySelector('.tab-container');
        const addBtn = document.querySelector('.add-tab-button');
        // Remove existing sections
        tabContainer.querySelectorAll('.tab-section').forEach(s => s.remove());

        // Recreate sections
        data.sections.forEach(sectionData => {
            const newSection = document.createElement('div');
            newSection.className = 'tab-section';
            newSection.innerHTML = `
                <pre class="tab-content">e|${'-'.repeat(80)}
B|${'-'.repeat(80)}
G|${'-'.repeat(80)}
D|${'-'.repeat(80)}
A|${'-'.repeat(80)}
E|${'-'.repeat(80)}|</pre>
            `;
            tabContainer.insertBefore(newSection, addBtn);
            initializeSingleTabSection(newSection);

            // restore notes
            const lines = newSection.querySelectorAll('.interactive-tab .tab-line');
            sectionData.strings.forEach((stringArr, stringIndex) => {
                const line = lines[stringIndex];
                const dashSpans = line.querySelectorAll('.dashes-container .tab-dash');
                stringArr.forEach((cell, idx) => {
                    if (cell && cell.value && cell.value !== '-') {
                        const span = dashSpans[idx];
                        span.textContent = cell.value;
                        if (cell.delay) span.dataset.delay = cell.delay;
                        span.classList.add('tab-note');
                    }
                });
            });
        });

        // Record loaded version for live-sync comparisons
        if (songObj.updated_at) {
            lastLoadedVersion[name] = songObj.updated_at;
        }

        // Restore backing audio from song data
        const volInput = document.getElementById('audio-volume');
        const nameSpan = document.getElementById('audio-name');
        const audioMeta = Object.assign({ url: null, volume: 1.0, name: '' }, (data && data.audio) || {});
        currentAudioMeta = audioMeta;
        if (volInput) volInput.value = Number((audioMeta.volume != null) ? audioMeta.volume : 1.0);
        if (nameSpan) nameSpan.textContent = audioMeta.name ? ('\u2022 ' + audioMeta.name) : '';
        if (currentAudio) { try { currentAudio.pause(); } catch (e) {} }
        currentAudio = null;
        if (audioMeta.url) {
            currentAudio = new Audio(audioMeta.url);
            currentAudio.volume = Number((audioMeta.volume != null) ? audioMeta.volume : 1.0);
        }
    }

    // Save the current song by name (no prompt). If name is not provided, use the active song name or generate one.
    async function saveSong(name) {
        const songName = name || getActiveSongName() || generateUntitledName();
        const data = serializeSong();
        try { await apiSaveSong(songName, data); } catch (e) { try { localStorage.setItem('guitar_tabs_' + songName, JSON.stringify(data)); } catch (e2) {} }
        // ensure the song has a UI entry and mark as saved
        createSongListButton(songName, { saved: true, active: true });
    }

    function loadSong() {
        const saved = listSavedSongs();
        if (saved.length === 0) {
            alert('No saved songs found.');
            return;
        }
        const name = prompt('Saved songs:\n' + saved.join('\n') + '\n\nEnter the name to load:');
        if (!name) return;
        loadSongByName(name);
    }

    // (Old simple Play All removed — using column-wise playAllSections + controls above)
    // Backing audio: UI wiring
    const attachBtn = document.getElementById('attach-audio');
    const fileInput = document.getElementById('audio-file-input');
    const volumeInput = document.getElementById('audio-volume');
    const audioNameSpan = document.getElementById('audio-name');

    if (attachBtn && fileInput) {
        attachBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async() => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            const fd = new FormData();
            fd.append('file', file);
            try {
                const res = await fetch('/api/guitar-tabs/upload.php', { method: 'POST', body: fd });
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.message || 'Upload failed');
                currentAudioMeta.url = json.url;
                currentAudioMeta.name = file.name;
                if (volumeInput) currentAudioMeta.volume = Number(volumeInput.value || 1.0);
                if (currentAudio) { try { currentAudio.pause(); } catch (e) {} }
                currentAudio = new Audio(currentAudioMeta.url);
                currentAudio.volume = Number(currentAudioMeta.volume || 1.0);
                if (audioNameSpan) audioNameSpan.textContent = '\u2022 ' + (file.name || 'audio');
                // Save updated audio metadata
                isDirty = true;
                await autoSaveCurrentSong();
                lastLocalSaveAt = Date.now();
            } catch (e) {
                alert('Audio upload failed: ' + e.message);
            } finally {
                isDirty = false;
                fileInput.value = '';
            }
        });
    }

    if (volumeInput) {
        volumeInput.addEventListener('input', async() => {
            const v = Number(volumeInput.value || 1.0);
            currentAudioMeta.volume = v;
            if (currentAudio) currentAudio.volume = v;
            try {
                isDirty = true;
                await autoSaveCurrentSong();
                lastLocalSaveAt = Date.now();
            } catch (_) {} finally { isDirty = false; }
        });
    }
});