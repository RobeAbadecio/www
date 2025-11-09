document.addEventListener('DOMContentLoaded', function() {
    // Sidebar toggle functionality
    const toggler = document.querySelector('.toggler');
    const sidebar = document.querySelector('.sidebar');
    const chevronIcon = toggler.querySelector('.material-symbols-rounded');

    toggler.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');

        // Rotate chevron icon
        if (sidebar.classList.contains('collapsed')) {
            chevronIcon.style.transform = 'rotate(180deg)';
        } else {
            chevronIcon.style.transform = 'rotate(0deg)';
        }
    });

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

    noteCancelBtn.addEventListener('click', () => closeNoteModal());
    noteModal.querySelector('.modal-overlay').addEventListener('click', () => closeNoteModal());
    noteSaveBtn.addEventListener('click', () => {
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
        autoSaveCurrentSong();
    });
    // Initialize all existing tab sections on page load
    document.querySelectorAll('.tab-section').forEach(section => {
        initializeSingleTabSection(section);
    }); // Function to initialize a single tab section
    // Render saved song buttons in sidebar
    renderSavedSongs();

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
        deleteBtn.addEventListener('click', () => {
            if (document.querySelectorAll('.tab-section').length <= 1) {
                alert('Cannot delete the last section');
                return;
            }
            if (confirm('Delete this section?')) {
                section.remove();
                autoSaveCurrentSong(); // Save after deleting
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

                // Right click to remove note
                dashSpan.addEventListener('contextmenu', function(e) {
                    e.preventDefault();
                    dashSpan.textContent = '-';
                    dashSpan.classList.remove('tab-note');
                    delete dashSpan.dataset.delay;
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
    addTabButton.addEventListener('click', () => {
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
        autoSaveCurrentSong();
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
                updatePlayButtonState();
                return;
            }

            // Start new playback
            playbackState.playing = true;
            playbackState.paused = false;
            playbackState.stopped = false;
            updatePlayButtonState();
            await playAllSections();
            playbackState.playing = false;
            playbackState.paused = false;
            updatePlayButtonState();
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            playbackState.stopped = true;
            playbackState.paused = false;
            playbackState.playing = false;

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

    // --- Save / Load functionality (localStorage) ---
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
        return { sections };
    }

    function listSavedSongs() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('guitar_tabs_')) keys.push(k.replace('guitar_tabs_', ''));
        }
        return keys;
    }

    // Render saved songs into the top song list (preload)
    function renderSavedSongs() {
        const saved = listSavedSongs();
        saved.forEach(name => {
            createSongListButton(name, { saved: true, active: false });
        });
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
    function autoSaveCurrentSong() {
        const name = getActiveSongName();
        if (!name) return;
        const data = serializeSong();
        try {
            localStorage.setItem('guitar_tabs_' + name, JSON.stringify(data));
            // mark UI as saved for this song
            const container = document.querySelector('#song-list [data-name="' + CSS.escape(name) + '"]');
            if (container) {
                const btn = container.querySelector('.song-button');
                if (btn) btn.dataset.saved = '1';
            }
        } catch (err) {
            console.error('Auto-save failed for', name, err);
        }
    }

    // Perform rename: move storage key and update UI
    function performRename(oldName, newName, container, btn) {
        if (!oldName || !newName) return false;
        const list = document.getElementById('song-list');
        const existing = list.querySelector('[data-name="' + CSS.escape(newName) + '"]');
        if (existing && existing !== container) {
            if (!confirm('A song named "' + newName + '" already exists. Overwrite it?')) return false;
            try { localStorage.removeItem('guitar_tabs_' + newName); } catch (err) { console.error(err); }
            existing.remove();
        }

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
            } else if (opts.saved || localStorage.getItem('guitar_tabs_' + curName)) {
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
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            const curName = container.dataset.name;
            if (!confirm('Delete song "' + curName + '"? This cannot be undone.')) return;
            try {
                localStorage.removeItem('guitar_tabs_' + curName);
            } catch (err) {
                console.error('Failed to remove song from localStorage', err);
            }
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

    // Load by name (no prompt) and reuse existing logic
    function loadSongByName(name) {
        if (!name) return;
        const raw = localStorage.getItem('guitar_tabs_' + name);
        if (!raw) { alert('No saved song with that name'); return; }
        const data = JSON.parse(raw);

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
    }

    // Save the current song by name (no prompt). If name is not provided, use the active song name or generate one.
    function saveSong(name) {
        const songName = name || getActiveSongName() || generateUntitledName();
        const data = serializeSong();
        try {
            localStorage.setItem('guitar_tabs_' + songName, JSON.stringify(data));
            // ensure the song has a UI entry and mark as saved
            createSongListButton(songName, { saved: true, active: true });
        } catch (err) {
            console.error('Failed to save:', err);
        }
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
});