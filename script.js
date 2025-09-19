document.addEventListener('DOMContentLoaded', () => {
    // --- VARIABLEN ---
    let currentMode = null,
        currentMaterialType = 'woerter', // 'woerter' oder 'saetze'
        availableItemSets = {}, 
        masterItemsWoerter = null,
        masterItemsSaetze = null,
        masterItems = null; // Wird dynamisch gesetzt
        
    let currentItemSetData = [],
        currentShuffledItems = [],
        currentItemIndex = 0;
    let currentSettings = {
        displayType: 'image_only',
        displayDuration: 3,
        order: 'chaotic',
        soundOn: true,
        soundDelay: 0,
        autoplaySoundManual: false
    };
    let soundTimeoutId = null,
        autoNextTimeoutId = null,
        isNavigating = false;
    let progressDotElements = [];
    let currentAudioEndHandler = null;
    let touchStartX = 0,
        touchStartY = 0,
        currentTranslate = 0;
    let isRestartingExercise = false;
    let uiLocked = false; // Wird durch URL-Parameter uiLock=1 aktiviert
    let patientName = null; // Optionaler Patientenname aus URL

    // Quiz-spezifische Variablen
    let correctQuizItem = null;
    let quizPool = []; 

    // --- DOM ELEMENTE ---
    const screens = {
        modeSelection: document.getElementById('screen-mode-selection'),
        presentationSelection: document.getElementById('screen-presentation-selection'), // NEU
        settings: document.getElementById('screen-settings'),
        exercise: document.getElementById('screen-exercise')
    };
    const slides = [document.getElementById('slide-1'), document.getElementById('slide-2'), document.getElementById('slide-3')];
    let prevSlide = slides[0], currentSlide = slides[1], nextSlide = slides[2];
    const slidesWrapper = document.querySelector('.slides-wrapper');
    const hamburgerIcon = document.getElementById('hamburger-icon'),
        menuContent = document.getElementById('menu-content');
    const anleitungModal = document.getElementById('anleitung-modal'),
        exerciseEndModal = document.getElementById('exercise-end-modal'),
        modalCloseButtons = document.querySelectorAll('.modal-close-button');
    const settingsTitle = document.getElementById('settings-title');
    
    const materialSelect = document.getElementById('material-select');
    const categorySelect = document.getElementById('category-select');
    const listSelectionArea = document.getElementById('list-selection-area');
    const listSelectionContainer = document.getElementById('list-selection-container');
    const btnAddList = document.getElementById('btn-add-list');

    const settingGroups = {
        displayType: document.getElementById('setting-display-type-group'),
        order: document.getElementById('setting-order-group'),
        displayDuration: document.getElementById('setting-display-duration-group'),
        soundOnOff: document.getElementById('setting-sound-on-off-group'),
        soundDelay: document.getElementById('setting-sound-delay-group'),
        autoplaySoundManual: document.getElementById('setting-autoplay-sound-manual-group')
    };

    const displayTypeButtons = document.querySelectorAll('#display-type-buttons button');
    const orderButtons = document.querySelectorAll('#order-buttons button');
    const displayDurationSelect = document.getElementById('display-duration-select');
    const soundOnOffButtons = document.querySelectorAll('#sound-on-off-buttons button');
    const soundDelaySelect = document.getElementById('sound-delay-select');
    const autoplaySoundManualButtons = document.querySelectorAll('#autoplay-sound-manual-buttons button');

    const btnSettingsBack = document.getElementById('btn-settings-back'),
        btnStartExercise = document.getElementById('btn-start-exercise'),
        audioPlayer = document.getElementById('audio-player');
    const btnReshuffle = document.getElementById('btn-reshuffle'),
        btnNewSelection = document.getElementById('btn-new-selection');
    const progressDotsContainer = document.getElementById('progress-dots-container');
    const navArrowsLeft = document.querySelectorAll('.nav-arrow-left'),
        navArrowsRight = document.querySelectorAll('.nav-arrow-right');
    const bottomControlsContainer = document.getElementById('bottom-controls-container');
    const soundButton = bottomControlsContainer.querySelector('.sound-button');
    const btnStopAutoMode = document.getElementById('btn-stop-auto-mode');
    const wordDisplayArea = document.getElementById('word-display-area');

    // Quiz DOM Elemente
    const quizArea = document.getElementById('quiz-area');
    const quizSoundButton = document.getElementById('quiz-sound-button');
    const quizOptionsContainer = document.getElementById('quiz-options-container');

    // NEUE DOM ELEMENTE
    const btnPresentationBack = document.getElementById('btn-presentation-back');

    // --- FUNKTIONEN (unverändert) ---
    function showScreen(screenIdToShow) { Object.values(screens).forEach(screen => { const isTarget = screen.id === screenIdToShow; screen.classList.toggle('hidden', !isTarget); screen.classList.toggle('zoom-out', !isTarget); screen.classList.toggle('zoom-in', isTarget); }); document.body.style.overflow = (screenIdToShow === 'screen-exercise') ? 'hidden' : 'auto'; window.scrollTo(0, 0); }
    function showModal(modalId) { const modal = document.getElementById(modalId); if (modal) modal.classList.add('show'); }
    function closeModal(modalId) { const modal = document.getElementById(modalId); if (modal) modal.classList.remove('show'); }
    function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[array[i], array[j]] = [array[j], array[i]]; } return array; }
    // Ermittelt den Basis-Pfad der App (z. B. '' lokal oder '/Wortschatz-Trainer' auf GitHub Pages)
    function getBasePath() {
        try {
            const baseEl = document.querySelector('base');
            if (baseEl && baseEl.href) {
                const u = new URL(baseEl.href, window.location.href);
                return u.pathname.replace(/\/$/, '');
            }
            const p = window.location.pathname || '/';
            if (p.endsWith('/')) return p.replace(/\/$/, '');
            const idx = p.lastIndexOf('/');
            return idx >= 0 ? p.substring(0, idx) : '';
        } catch {
            return '';
        }
    }
    const __BASE_PATH__ = getBasePath();
    function getAssetUrl(p) { return toAbsUrl(p); }

    // Liefert Pfad-Varianten für Unicode-Normalisierung: [NFC (original), NFD]
    function buildUnicodePathVariants(p) {
        try {
            const original = String(p || '');
            const nfd = original.normalize('NFD');
            if (nfd !== original) return [original, nfd];
            return [original];
        } catch { return [p || '']; }
    }

    async function fetchWithUnicodeFallback(p, { query = '' } = {}) {
        const variants = buildUnicodePathVariants(p);
        let lastErr = null;
        for (let i = 0; i < variants.length; i++) {
            const url = getAssetUrl(variants[i]) + query;
            try {
                const res = await fetch(url);
                if (res.ok) return res;
                lastErr = new Error(`HTTP ${res.status}`);
            } catch (e) {
                lastErr = e;
            }
        }
        throw lastErr || new Error('Fetch failed');
    }
    function toAbsUrl(p) {
        try {
            if (!p) return '';
            if (/^https?:\/\//i.test(p)) return p;
            const cleaned = String(p).replace(/^\/+/, '').replace(/\\+/g, '/');
            return (__BASE_PATH__ ? __BASE_PATH__ : '') + '/' + cleaned;
        } catch { return p || ''; }
    }
    function preloadAssets(items) { const promises = []; const loadedAssets = new Set(); items.forEach(item => {
        if (item.image && !loadedAssets.has(item.image)) {
            promises.push(new Promise((resolve) => {
                const variants = buildUnicodePathVariants(item.image);
                let idx = 0;
                const img = new Image();
                img.onload = resolve;
                img.onerror = () => {
                    idx += 1;
                    if (idx < variants.length) {
                        img.src = getAssetUrl(variants[idx]) + '?t=' + new Date().getTime();
                    } else {
                        resolve(); // Ignore failure in preload
                    }
                };
                img.src = getAssetUrl(variants[idx]) + '?t=' + new Date().getTime();
            }));
            loadedAssets.add(item.image);
        }
        if (item.sound && !loadedAssets.has(item.sound)) {
            const q = '?t=' + new Date().getTime();
            const variants = buildUnicodePathVariants(item.sound);
            // Try HEAD/GET to warm cache; ignore failures
            promises.push(
                (async () => {
                    for (let i = 0; i < variants.length; i++) {
                        try {
                            const res = await fetch(getAssetUrl(variants[i]) + q, { method: 'GET' });
                            if (res.ok) return;
                        } catch {}
                    }
                })()
            );
            loadedAssets.add(item.sound);
        }
    }); return Promise.all(promises); }
    
    async function loadSetsManifest() {
        const setsFile = currentMaterialType === 'saetze' ? 'data/sets_saetze.json' : 'data/sets.json';
        try {
            const response = await fetchWithUnicodeFallback(setsFile, { query: `?t=${new Date().getTime()}` });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            availableItemSets = await response.json();
            
            // Reset and populate category dropdown
            categorySelect.innerHTML = '<option value="">Bitte wählen...</option>';
            for (const key in availableItemSets) {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = availableItemSets[key].displayName;
                categorySelect.appendChild(option);
            }
            
            // Reset list selection
            listSelectionContainer.innerHTML = '';
            listSelectionArea.style.display = 'none';
            btnAddList.classList.add('hidden');
            
            checkIfStartIsPossible();
        } catch (e) {
            console.error(`Fehler beim Laden von ${setsFile}:`, e);
            categorySelect.innerHTML = '<option value="">Fehler beim Laden</option>';
            btnStartExercise.disabled = true;
        }
    }

    async function loadItemSet(path) { if (!path || !masterItems) return []; try { const response = await fetchWithUnicodeFallback(path, { query: '?t=' + new Date().getTime() }); if (!response.ok) throw new Error(`Set-Datei nicht gefunden: ${path}`); const data = await response.json(); if (data && Array.isArray(data.items)) { return data.items; } else if (Array.isArray(data)) { return data; } else { console.error("Set-Datei hat kein 'items'-Array:", path); return []; } } catch (e) { console.error(`Fehler beim Laden oder Verarbeiten des Sets ${path}:`, e); return []; } }
    function generateProgressDots() { progressDotsContainer.innerHTML = ''; progressDotElements = []; for (let i = 0; i < currentShuffledItems.length; i++) { if(currentShuffledItems[i].type === 'end') continue; const dot = document.createElement('div'); dot.className = 'progress-dot'; progressDotsContainer.appendChild(dot); progressDotElements.push(dot); } }
    function updateProgressDots() { progressDotElements.forEach((dot, index) => { dot.classList.toggle('active', index === currentItemIndex); }); }
    function playItemSound(item, delay = 0) { clearTimeout(soundTimeoutId); if (!item || !item.sound) { return; } const buttonToDisable = currentMode === 'quiz' ? quizSoundButton : soundButton; soundTimeoutId = setTimeout(() => { audioPlayer.pause(); audioPlayer.currentTime = 0; if (buttonToDisable) buttonToDisable.disabled = true; const enableButton = () => { if (buttonToDisable) buttonToDisable.disabled = false; audioPlayer.removeEventListener('ended', enableButton); audioPlayer.removeEventListener('error', tryFallback); audioPlayer.removeEventListener('error', enableButton); }; let triedFallback = false; const tryFallback = () => {
                if (triedFallback) { enableButton(); return; }
                triedFallback = true;
                try {
                    const variants = buildUnicodePathVariants(item.sound);
                    if (variants.length > 1) {
                        audioPlayer.src = getAssetUrl(variants[1]) + '?t=' + new Date().getTime();
                        audioPlayer.play().catch(() => {});
                        return;
                    }
                } catch {}
                enableButton();
            };
            audioPlayer.addEventListener('canplay', () => audioPlayer.play().catch(e => console.error("Sound-Abspielfehler:", e)), { once: true });
            audioPlayer.addEventListener('ended', enableButton, { once: true });
            audioPlayer.addEventListener('error', tryFallback);
            audioPlayer.addEventListener('error', enableButton, { once: true });
            audioPlayer.src = getAssetUrl(item.sound) + '?t=' + new Date().getTime(); }, delay * 1000); }
    function stopAllAutomation() { clearTimeout(soundTimeoutId); clearTimeout(autoNextTimeoutId); audioPlayer.pause(); if (currentAudioEndHandler) { audioPlayer.removeEventListener('ended', currentAudioEndHandler); audioPlayer.removeEventListener('error', currentAudioEndHandler); currentAudioEndHandler = null; } if (currentMode === 'manual' || currentMode === 'quiz') { soundButton.disabled = false; quizSoundButton.disabled = false; audioPlayer.src = ''; } }
    function exitCurrentExercise() { stopAllAutomation(); }
    function populateSlide(slideElement, itemIndex) { const item = currentShuffledItems[itemIndex]; slideElement.innerHTML = ''; if (!item || item.type === 'end' || currentSettings.displayType === 'word_only') { return; } const imagePath = item.image ? item.image.trim() : ""; if (imagePath) { const img = document.createElement('img'); const variants = buildUnicodePathVariants(imagePath); let idx = 0; img.src = getAssetUrl(variants[idx]) + '?t=' + new Date().getTime(); img.onerror = () => { idx += 1; if (idx < variants.length) { img.src = getAssetUrl(variants[idx]) + '?t=' + new Date().getTime(); } else { /* give up */ } }; img.alt = item.name || ""; if (currentMode === 'manual') { img.addEventListener('click', () => moveSlider(-1)); } slideElement.appendChild(img); } }
    function setSlidePositions(animated = true) { slides.forEach(s => s.classList.toggle('no-transition', !animated)); const prevIndex = (currentItemIndex - 1 + currentShuffledItems.length) % currentShuffledItems.length; const nextIndex = (currentItemIndex + 1) % currentShuffledItems.length; populateSlide(prevSlide, prevIndex); populateSlide(currentSlide, currentItemIndex); populateSlide(nextSlide, nextIndex); prevSlide.style.transform = `translateX(-100%)`; currentSlide.style.transform = `translateX(0)`; nextSlide.style.transform = `translateX(100%)`; if (!animated) { setTimeout(() => slides.forEach(s => s.classList.remove('no-transition')), 20); } }
    function updateExerciseUIForMode() { const isManual = currentMode === 'manual'; const isAuto = currentMode === 'auto'; const isQuiz = currentMode === 'quiz'; slidesWrapper.classList.toggle('hidden', !isManual && !isAuto); bottomControlsContainer.classList.toggle('hidden', isQuiz); wordDisplayArea.classList.toggle('hidden', isQuiz); quizArea.classList.toggle('hidden', !isQuiz); if (isManual) {
        soundButton.classList.remove('hidden');
        btnStopAutoMode.classList.add('hidden');
        document.getElementById('arrow-group-left').classList.remove('hidden');
        document.getElementById('arrow-group-right').classList.remove('hidden');
    } else if (isAuto) {
        soundButton.classList.add('hidden');
        btnStopAutoMode.classList.remove('hidden');
        document.getElementById('arrow-group-left').classList.add('hidden');
        document.getElementById('arrow-group-right').classList.add('hidden');
    } 
    }
    function setupInitialState() { isNavigating = false; updateExerciseUIForMode(); if (currentMode === 'quiz') { setupQuizRound(); } else { setSlidePositions(false); updateUiForCurrentItem(); } }
    function handleTransitionEnd(direction) { const prevIndex = (currentItemIndex - 1 + currentShuffledItems.length) % currentShuffledItems.length; const nextIndex = (currentItemIndex + 1) % currentShuffledItems.length; const slideToReset = direction === -1 ? nextSlide : prevSlide; const indexToPopulate = direction === -1 ? nextIndex : prevIndex; const positionToSet = direction === -1 ? '100%' : '-100%'; slideToReset.classList.add('no-transition'); populateSlide(slideToReset, indexToPopulate); slideToReset.style.transform = `translateX(${positionToSet})`; setTimeout(() => { slideToReset.classList.remove('no-transition'); isNavigating = false; }, 20); }
    function runAutoModeStep() { stopAllAutomation(); const item = currentShuffledItems[currentItemIndex]; const hasSound = item && item.sound && currentSettings.soundOn; let displayDurationFinished = false; let soundPlaybackFinished = !hasSound; const tryProceedToNext = () => { if (displayDurationFinished && soundPlaybackFinished) { moveSlider(-1); } }; autoNextTimeoutId = setTimeout(() => { displayDurationFinished = true; tryProceedToNext(); }, currentSettings.displayDuration * 1000); if (hasSound) { playItemSound(item, currentSettings.soundDelay); currentAudioEndHandler = () => { soundPlaybackFinished = true; tryProceedToNext(); }; audioPlayer.addEventListener('ended', currentAudioEndHandler, { once: true }); audioPlayer.addEventListener('error', currentAudioEndHandler, { once: true }); } }
    function updateUiForCurrentItem() {
        updateProgressDots();
        const item = currentShuffledItems[currentItemIndex];
        
        if (!item || item.type === 'end') {
            wordDisplayArea.classList.add('hidden');
            if (currentMode === 'manual') {
                soundButton.classList.add('invisible');
            }
            return;
        }

        if (currentMode === 'manual') {
            const hasSound = item && item.sound;
            soundButton.classList.toggle('invisible', !hasSound);
        }
        
        let showWord = currentSettings.displayType === 'word_only' || currentSettings.displayType === 'image_word';
        let showImage = currentSettings.displayType === 'image_only' || currentSettings.displayType === 'image_word';
        
        if (showImage && !item.image) {
            showWord = true;
            showImage = false;
        }
        
        if (showWord) {
            wordDisplayArea.textContent = item.name || "";
            wordDisplayArea.classList.remove('hidden');
        } else {
            wordDisplayArea.textContent = "";
            wordDisplayArea.classList.add('hidden');
        }
        
        slidesWrapper.classList.toggle('invisible', !showImage);
        
        if (currentMode === 'manual' && currentSettings.autoplaySoundManual) {
            playItemSound(item, 0);
        }
        if (currentMode === 'auto') {
            runAutoModeStep();
        }
    }
    function touchStart(event) { if (isNavigating || currentMode !== 'manual') return; touchStartX = event.type.includes('mouse') ? event.pageX : event.touches[0].clientX; touchStartY = event.type.includes('mouse') ? event.pageY : event.touches[0].clientY; slides.forEach(s => s.classList.add('is-grabbing')); slidesWrapper.addEventListener('touchmove', touchMove); slidesWrapper.addEventListener('touchend', touchEnd); }
    function touchMove(event) { if (isNavigating || currentMode !== 'manual') return; const currentX = event.type.includes('mouse') ? event.pageX : event.touches[0].clientX; const currentY = event.type.includes('mouse') ? event.pageY : event.touches[0].clientY; const deltaX = currentX - touchStartX; const deltaY = Math.abs(currentY - touchStartY); if (Math.abs(deltaX) < deltaY && !currentTranslate) return; currentTranslate = deltaX; prevSlide.style.transform = `translateX(calc(-100% + ${deltaX}px))`; currentSlide.style.transform = `translateX(${deltaX}px)`; nextSlide.style.transform = `translateX(calc(100% + ${deltaX}px))`; }
    function touchEnd() { if (currentMode !== 'manual') return; slidesWrapper.removeEventListener('touchmove', touchMove); slidesWrapper.removeEventListener('touchend', touchEnd); slides.forEach(s => s.classList.remove('is-grabbing')); const threshold = slidesWrapper.clientWidth / 4; let direction = 0; if (Math.abs(currentTranslate) > threshold) { direction = currentTranslate < 0 ? -1 : 1; } moveSlider(direction); currentTranslate = 0; }
    function moveSlider(direction) { if (isNavigating || direction === 0) { if (direction === 0) setSlidePositions(); return; } if (currentMode === 'manual') { stopAllAutomation(); } isNavigating = true; let newIndex = currentItemIndex - direction; if (newIndex >= currentShuffledItems.length || (currentShuffledItems[newIndex] && currentShuffledItems[newIndex].type === 'end')) { exitCurrentExercise(); const isAutoOrdered = currentMode === 'auto' && currentSettings.order === 'ordered'; btnReshuffle.textContent = isAutoOrdered ? 'Neu starten' : 'Neu mischen'; document.getElementById('exercise-end-message').textContent = "Alle Items bearbeitet."; showModal('exercise-end-modal'); isNavigating = false; return; } if (newIndex < 0) { newIndex = currentShuffledItems.length - 1; } currentItemIndex = newIndex; currentSlide.style.transform = `translateX(${direction * 100}%)`; let tempSlide; if (direction === -1) { nextSlide.style.transform = `translateX(0)`; tempSlide = prevSlide; prevSlide = currentSlide; currentSlide = nextSlide; nextSlide = tempSlide; } else { prevSlide.style.transform = `translateX(0)`; tempSlide = nextSlide; nextSlide = currentSlide; currentSlide = prevSlide; prevSlide = tempSlide; } currentSlide.addEventListener('transitionend', () => handleTransitionEnd(direction), { once: true }); updateUiForCurrentItem(); }
    function populateDisplayDurationSelect() { if (displayDurationSelect) { displayDurationSelect.innerHTML = ''; for (let i = 1; i <= 10; i++) { const option = document.createElement('option'); option.value = i; option.textContent = i === 1 ? '1 Sekunde' : `${i} Sekunden`; displayDurationSelect.appendChild(option); } displayDurationSelect.value = currentSettings.displayDuration; } }
    function populateSoundDelaySelect() { if (soundDelaySelect) { soundDelaySelect.innerHTML = ''; for (let i = 0; i <= 5; i += 0.5) { const option = document.createElement('option'); option.value = i; option.textContent = i === 0 ? '0 Sek (sofort)' : `${i.toFixed(1)} Sek`; soundDelaySelect.appendChild(option); } } }
    function configureSettingsScreen() { const modeMap = { manual: 'Manuell', auto: 'Automatisch', quiz: 'Quiz' }; if (settingsTitle) { settingsTitle.textContent = `Einstellungen für: ${modeMap[currentMode] || ''}`; } const isAutoMode = currentMode === 'auto'; const isManualMode = currentMode === 'manual'; const isQuizMode = currentMode === 'quiz'; Object.values(settingGroups).forEach(group => group.classList.add('hidden')); if(isManualMode || isAutoMode) settingGroups.displayType.classList.remove('hidden'); if(isAutoMode) settingGroups.order.classList.remove('hidden'); if(isAutoMode) settingGroups.displayDuration.classList.remove('hidden'); if(isAutoMode) settingGroups.soundOnOff.classList.remove('hidden'); if(isAutoMode && currentSettings.soundOn) settingGroups.soundDelay.classList.remove('hidden'); if(isManualMode) settingGroups.autoplaySoundManual.classList.remove('hidden'); }
    function setupQuizRound() { if (currentItemIndex >= currentShuffledItems.length - 1) { exitCurrentExercise(); btnReshuffle.textContent = 'Neu mischen'; document.getElementById('exercise-end-message').textContent = "Alle Items bearbeitet."; showModal('exercise-end-modal'); return; } updateProgressDots(); correctQuizItem = currentShuffledItems[currentItemIndex]; const incorrectItems = shuffleArray(quizPool.filter(item => item.id !== correctQuizItem.id)).slice(0, 3); if (incorrectItems.length < 3) { console.error("Kritischer Fehler: Nicht genügend Items für eine Quiz-Runde gefunden."); document.getElementById('exercise-end-message').textContent = "Ein interner Fehler ist aufgetreten. Nicht genügend unterschiedliche Bilder für diese Runde vorhanden."; showModal('exercise-end-modal'); return; } const options = shuffleArray([correctQuizItem, ...incorrectItems]); const optionElements = quizOptionsContainer.querySelectorAll('.quiz-option'); optionElements.forEach((div, index) => { const item = options[index]; const variants = buildUnicodePathVariants(item.image); const url = getAssetUrl(variants[0]) + '?t=' + new Date().getTime(); const fallback = variants[1] ? getAssetUrl(variants[1]) + '?t=' + new Date().getTime() : null; div.innerHTML = `<img src="${url}" alt="Antwortmöglichkeit">`; const img = div.querySelector('img'); if (fallback) { img.onerror = () => { img.onerror = null; img.src = fallback; }; } div.dataset.itemId = item.id; div.className = 'quiz-option'; }); quizOptionsContainer.classList.remove('disabled'); playItemSound(correctQuizItem, 0.5); }
    function handleQuizAnswer(event) { const selectedOption = event.target.closest('.quiz-option'); if (!selectedOption || quizOptionsContainer.classList.contains('disabled')) return; quizOptionsContainer.classList.add('disabled'); const selectedItemId = selectedOption.dataset.itemId; const allOptions = quizOptionsContainer.querySelectorAll('.quiz-option'); allOptions.forEach(opt => { if (opt.dataset.itemId === correctQuizItem.id) { opt.classList.add('correct'); } else if (opt === selectedOption) { opt.classList.add('incorrect'); } else { opt.classList.add('faded'); } }); setTimeout(() => { currentItemIndex++; setupQuizRound(); }, 2000); }
    let availableListsForCategory = []; 
    // Rekursive Variante: sammelt alle Blätter (Objekte mit 'path')
    function flattenLists(categoryData) {
        const lists = [];

        const buildLabel = (parts) => {
            // Halte Labels kurz: nimm die letzten 2 Segmente, wenn es mehr sind
            const maxDepth = 2;
            const reduced = parts.length > maxDepth ? parts.slice(parts.length - maxDepth) : parts;
            if (reduced.length === 0) return '';
            if (reduced.length === 1) return reduced[0];
            // Mehrere Teile: erster Teil unverändert, letzter Teil kleingeschrieben (z. B. "B initial")
            const head = reduced.slice(0, reduced.length - 1).join(' ');
            const tail = (reduced[reduced.length - 1] || '').toLowerCase();
            return head ? `${head} ${tail}` : tail;
        };

        const traverse = (node, nameParts = []) => {
            for (const key in node) {
                if (key === 'displayName' || key === 'unterkategorieName') continue;
                const child = node[key];
                if (!child || typeof child !== 'object') continue;

                if (child.path && child.displayName) {
                    const parts = nameParts.length ? [...nameParts, child.displayName] : [child.displayName];
                    const text = buildLabel(parts);
                    lists.push({ text, value: child.path });
                } else {
                    // Nur kurze Ebenen (z. B. Buchstaben) in die Beschriftung aufnehmen
                    const nextParts = (child.displayName && child.displayName.length <= 5)
                        ? [...nameParts, child.displayName]
                        : nameParts;
                    traverse(child, nextParts);
                }
            }
        };

        traverse(categoryData, []);
        lists.sort((a, b) => a.text.localeCompare(b.text, 'de'));
        return lists; 
    }
    function populateListDropdown(selectElement) { selectElement.innerHTML = '<option value="">Liste auswählen...</option>'; availableListsForCategory.forEach(list => { const option = document.createElement('option'); option.value = list.value; option.textContent = list.text; selectElement.appendChild(option); }); }
    function addListSelectionRow() { const row = document.createElement('div'); row.className = 'list-selection-row'; const select = document.createElement('select'); populateListDropdown(select); const deleteBtn = document.createElement('button'); deleteBtn.className = 'btn-delete-list'; deleteBtn.setAttribute('aria-label', 'Diese Liste entfernen'); deleteBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg>`; row.appendChild(select); row.appendChild(deleteBtn); listSelectionContainer.appendChild(row); checkIfStartIsPossible(); }
    function checkIfStartIsPossible() { if (!btnStartExercise) return; const selectedLists = listSelectionContainer.querySelectorAll('select'); let atLeastOneSelected = false; selectedLists.forEach(select => { if (select.value) { atLeastOneSelected = true; } }); btnStartExercise.disabled = !atLeastOneSelected; }
    
    // Extrahierte Start-Logik: kann vom Button und vom Autostart benutzt werden
    async function performStartExercise(selectedListPaths) {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.classList.remove('hidden');
        try {
            if (!Array.isArray(selectedListPaths) || selectedListPaths.length === 0) {
                alert("Bitte wählen Sie mindestens eine Liste aus.");
                return;
            }

            let allItemIds = [];
            for (const path of selectedListPaths) {
                const ids = await loadItemSet(path);
                allItemIds.push(...ids);
            }
            const uniqueItemIds = [...new Set(allItemIds)];
            currentItemSetData = uniqueItemIds
                .map(id => { const itemData = masterItems[id]; if (!itemData) return null; return { id: id, ...itemData }; })
                .filter(Boolean);

            if (currentItemSetData.length === 0) {
                alert("Die ausgewählten Listen sind leer oder konnten nicht geladen werden.");
                return;
            }

            if (currentMode === 'quiz') {
                quizPool = currentItemSetData.filter(item => item.image && item.sound);
                if (quizPool.length < 4) {
                    alert("Für den Quiz-Modus werden mindestens 4 verschiedene Items mit Bild UND Ton aus den ausgewählten Listen benötigt.");
                    return;
                }
                currentShuffledItems = shuffleArray([...quizPool]);
            } else {
                const baseItems = [...currentItemSetData];
                const shouldShuffle = (currentMode === 'auto' && currentSettings.order === 'chaotic') || (currentMode === 'manual');
                currentShuffledItems = shouldShuffle ? shuffleArray(baseItems) : baseItems;
            }

            await preloadAssets(currentItemSetData);
            if (isRestartingExercise) isRestartingExercise = false;
            currentShuffledItems.push({ type: 'end' });
            currentItemIndex = 0;
            generateProgressDots();
            setupInitialState();
            showScreen('screen-exercise');
        } catch (error) {
            console.error("Fehler beim Starten der Übung:", error);
            alert("Ein oder mehrere Bilder/Töne konnten nicht geladen werden.");
        } finally {
            if (loadingOverlay) loadingOverlay.classList.add('hidden');
        }
    }
    
    // --- EVENT LISTENERS ---

    if (materialSelect) {
        materialSelect.addEventListener('change', (e) => {
            currentMaterialType = e.target.value;
            masterItems = currentMaterialType === 'saetze' ? masterItemsSaetze : masterItemsWoerter;
            loadSetsManifest();
        });
    }

    if (categorySelect) { categorySelect.addEventListener('change', () => { const selectedCategoryKey = categorySelect.value; listSelectionContainer.innerHTML = ''; if (selectedCategoryKey) { const categoryData = availableItemSets[selectedCategoryKey]; availableListsForCategory = flattenLists(categoryData); listSelectionArea.style.display = 'block'; btnAddList.classList.remove('hidden'); addListSelectionRow(); } else { listSelectionArea.style.display = 'none'; btnAddList.classList.add('hidden'); } checkIfStartIsPossible(); }); }
    if (btnAddList) btnAddList.addEventListener('click', addListSelectionRow);
    if (listSelectionContainer) { listSelectionContainer.addEventListener('click', (e) => { const deleteButton = e.target.closest('.btn-delete-list'); if (deleteButton) { deleteButton.parentElement.remove(); checkIfStartIsPossible(); } }); listSelectionContainer.addEventListener('change', checkIfStartIsPossible); }

    if (btnStartExercise) {
        btnStartExercise.addEventListener('click', async () => {
            const selectedListPaths = [];
            const listSelects = listSelectionContainer.querySelectorAll('select');
            listSelects.forEach(select => { if (select.value) { selectedListPaths.push(select.value); } });
            await performStartExercise(selectedListPaths);
        });
    }

    if (hamburgerIcon) hamburgerIcon.addEventListener('click', (e) => { e.stopPropagation(); menuContent.classList.toggle('show'); if (currentMode === 'auto') { stopAllAutomation(); } });
    document.addEventListener('click', () => { if (menuContent && menuContent.classList.contains('show')) menuContent.classList.remove('show'); });
    window.addEventListener('click', (e) => { if (e.target.classList.contains('modal')) closeModal(e.target.id); });
    const menuAnleitung = document.getElementById('menu-anleitung');
    if (menuAnleitung) menuAnleitung.addEventListener('click', (e) => { e.preventDefault(); showModal('anleitung-modal'); menuContent.classList.remove('show'); });
    const menuModusAuswahl = document.getElementById('menu-modus-auswahl');
    if (menuModusAuswahl) menuModusAuswahl.addEventListener('click', (e) => { e.preventDefault(); exitCurrentExercise(); showScreen('screen-mode-selection'); menuContent.classList.remove('show'); });
    ['manual', 'auto', 'quiz'].forEach(modeKey => {
        const menuLink = document.getElementById(`menu-${modeKey}`);
        if (menuLink) {
            menuLink.addEventListener('click', (e) => {
                e.preventDefault();
                exitCurrentExercise();
                currentMode = modeKey;
                configureSettingsScreen();
                showScreen('screen-settings');
                menuContent.classList.remove('show');
            });
        }
    });
    modalCloseButtons.forEach(b => b.addEventListener('click', () => closeModal(b.dataset.modalId)));
    
    document.querySelectorAll('#screen-mode-selection .mode-card').forEach(card => {
        card.addEventListener('click', () => {
            const mode = card.dataset.mode;
            if (mode === 'presentation') {
                showScreen('screen-presentation-selection');
            } else if (mode === 'quiz') {
                currentMode = 'quiz';
                configureSettingsScreen();
                showScreen('screen-settings');
            }
        });
    });

    document.querySelectorAll('#screen-presentation-selection .mode-card').forEach(card => {
        card.addEventListener('click', () => {
            const mode = card.dataset.mode;
            currentMode = mode;
            configureSettingsScreen();
            showScreen('screen-settings');
        });
    });

    if (btnPresentationBack) {
        btnPresentationBack.addEventListener('click', () => {
            showScreen('screen-mode-selection');
        });
    }
    
    displayTypeButtons.forEach(b => b.addEventListener('click', () => { displayTypeButtons.forEach(btn => btn.classList.remove('selected')); b.classList.add('selected'); currentSettings.displayType = b.dataset.displayType; }));
    orderButtons.forEach(b => b.addEventListener('click', () => { orderButtons.forEach(btn => btn.classList.remove('selected')); b.classList.add('selected'); currentSettings.order = b.dataset.order; }));
    soundOnOffButtons.forEach(b => b.addEventListener('click', () => { soundOnOffButtons.forEach(btn => btn.classList.remove('selected')); b.classList.add('selected'); currentSettings.soundOn = b.dataset.soundOn === 'true'; configureSettingsScreen(); }));
    autoplaySoundManualButtons.forEach(b => b.addEventListener('click', () => { autoplaySoundManualButtons.forEach(btn => btn.classList.remove('selected')); b.classList.add('selected'); currentSettings.autoplaySoundManual = b.dataset.autoplaySound === 'true'; }));
    navArrowsLeft.forEach(arrow => arrow.addEventListener('click', () => moveSlider(1)));
    navArrowsRight.forEach(arrow => arrow.addEventListener('click', () => moveSlider(-1)));
    if (displayDurationSelect) displayDurationSelect.addEventListener('change', (e) => { currentSettings.displayDuration = parseInt(e.target.value); });
    if (soundDelaySelect) soundDelaySelect.addEventListener('change', (e) => { currentSettings.soundDelay = parseFloat(e.target.value); });

    if (btnSettingsBack) {
        btnSettingsBack.addEventListener('click', () => {
            if (currentMode === 'manual' || currentMode === 'auto') {
                showScreen('screen-presentation-selection');
            } else {
                showScreen('screen-mode-selection');
            }
        });
    }
    
    if (btnReshuffle) { btnReshuffle.addEventListener('click', () => { isRestartingExercise = true; closeModal('exercise-end-modal'); if (btnStartExercise) { btnStartExercise.click(); } }); }
    if (btnNewSelection) btnNewSelection.addEventListener('click', () => { closeModal('exercise-end-modal'); exitCurrentExercise(); showScreen('screen-settings'); });
    if (soundButton) soundButton.addEventListener('click', () => playItemSound(currentShuffledItems[currentItemIndex], 0));
    if (quizSoundButton) quizSoundButton.addEventListener('click', () => playItemSound(correctQuizItem, 0));
    if (quizOptionsContainer) quizOptionsContainer.addEventListener('click', handleQuizAnswer);
    if (btnStopAutoMode) btnStopAutoMode.addEventListener('click', () => { exitCurrentExercise(); configureSettingsScreen(); showScreen('screen-settings'); });
    if (slidesWrapper) slidesWrapper.addEventListener('touchstart', touchStart, { passive: true });

    // --- INITIALISIERUNG ---
    async function initializeApp() {
        populateDisplayDurationSelect();
        populateSoundDelaySelect();
        try {
            const [woerterResponse, saetzeResponse] = await Promise.all([
                fetchWithUnicodeFallback('data/items_database.json', { query: '?t=' + new Date().getTime() }),
                fetchWithUnicodeFallback('data/items_database_saetze.json', { query: '?t=' + new Date().getTime() })
            ]);
            if (!woerterResponse.ok) throw new Error('Master-Item-Liste (Wörter) nicht gefunden');
            if (!saetzeResponse.ok) throw new Error('Master-Item-Liste (Sätze) nicht gefunden');
            
            masterItemsWoerter = await woerterResponse.json();
            masterItemsSaetze = await saetzeResponse.json();
            
            // Standardmäßig mit Wörtern starten
            masterItems = masterItemsWoerter;

        } catch (e) {
            console.error("KRITISCHER FEHLER: Datenbanken konnten nicht geladen werden.", e);
            document.body.innerHTML = '<h1>Fehler</h1><p>Eine der Haupt-Datenbanken (Wörter oder Sätze) konnte nicht geladen werden.</p>';
            return;
        }
        await loadSetsManifest();

        // URL-Parameter für Autostart und UI-Lock verarbeiten
        const params = new URLSearchParams(window.location.search || '');
        const getBool = (v) => v === '1' || v === 'true' || v === 'yes';
        const autostart = getBool(params.get('autostart') || '0');
        const urlMode = (params.get('mode') || '').toLowerCase();
        const urlMaterial = (params.get('material') || '').toLowerCase();
        const setPath = params.get('set');
        uiLocked = getBool(params.get('uiLock') || '0');
        patientName = params.get('patient') || null;

        if (uiLocked) {
            if (hamburgerIcon) hamburgerIcon.style.display = 'none';
            if (menuContent) menuContent.style.display = 'none';
            if (btnSettingsBack) btnSettingsBack.style.display = 'none';
        }

        if (autostart && setPath) {
            // Material wählen
            if (urlMaterial === 'saetze') {
                currentMaterialType = 'saetze';
                masterItems = masterItemsSaetze;
            } else {
                currentMaterialType = 'woerter';
                masterItems = masterItemsWoerter;
            }

            // Modus setzen
            if (urlMode === 'manual' || urlMode === 'auto' || urlMode === 'quiz') {
                currentMode = urlMode;
            } else {
                currentMode = 'quiz';
            }
            configureSettingsScreen();
            await performStartExercise([setPath]);
        } else {
            showScreen('screen-mode-selection');
        }
    }
    initializeApp();
});
