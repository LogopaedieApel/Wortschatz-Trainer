// common.js (Final - Basierend auf der Editor-Logik)

document.addEventListener('DOMContentLoaded', () => {
    // === Globale Zustandsvariablen ===
    let allSets = []; // Enthält die Struktur der Sets/Kategorien
    let itemsDatabase = {}; // Die zentrale Datenbank aller Wörter (ID -> Wort-Objekt)
    let allWords = []; // Die aktuell für die Übung ausgewählten Wörter
    let currentExerciseWords = [];
    let currentSettings = {
        selectedSets: [],
        repetitions: 1,
        delay: 3,
        mode: '', // 'presentation' oder 'quiz'
        presentationType: '' // 'manual' oder 'auto'
    };

    // === DOM-Elemente, die auf beiden Seiten existieren ===
    const loadingOverlay = document.getElementById('loading-overlay');
    const setSelectionContainer = document.getElementById('set-selection-container');
    const screenSettings = document.getElementById('screen-settings');
    const screenExercise = document.getElementById('screen-exercise');
    const audioPlayer = document.getElementById('audio-player');
    const progressBar = document.getElementById('progress-bar');
    const currentSetTitle = document.getElementById('current-set-title');
    const wordDisplay = document.getElementById('word-display');
    const audioButton = document.getElementById('audio-button');
    const hamburgerIcon = document.getElementById('hamburger-icon');
    const menuContent = document.getElementById('menu-content');
    const anleitungModal = document.getElementById('anleitung-modal');
    const exerciseEndModal = document.getElementById('exercise-end-modal');
    const closeButtons = document.querySelectorAll('.close-button');

    // === Kernfunktionen (global verfügbar machen) ===
    
    window.showScreen = function(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });
        const screenToShow = document.getElementById(screenId);
        if (screenToShow) {
            screenToShow.classList.remove('hidden');
        }
    };

    window.shuffleArray = function(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    };

    // --- LOGIK GRUNDLEGEND ÜBERARBEITET ---

    // NEU: Lädt die zentrale Wort-Datenbank
    async function loadItemsDatabase() {
        const response = await fetch('data/items_database.json');
        if (!response.ok) throw new Error('Items Database (items_database.json) nicht gefunden');
        itemsDatabase = await response.json();
    }

    // Lädt die Set-Struktur, um die Kategorien zu kennen
    async function loadSetsManifest() {
        const response = await fetch('data/sets.json');
        if (!response.ok) throw new Error('Sets Manifest (sets.json) nicht gefunden');
        const categories = await response.json();
        
        const flattenedSets = [];
        for (const categoryKey in categories) {
            const category = categories[categoryKey];
            for (const setKey in category) {
                if (typeof category[setKey] === 'object' && category[setKey].path) {
                    const set = category[setKey];
                    flattenedSets.push({
                        id: `${categoryKey}_${setKey}`,
                        name: set.displayName,
                        file: set.path
                    });
                }
            }
        }
        allSets = flattenedSets;
        populateSetSelection();
    }

    // Füllt die Checkboxen für die Wort-Sets
    function populateSetSelection() {
        if (!setSelectionContainer) return;
        setSelectionContainer.innerHTML = '<h2>Wort-Sets auswählen:</h2>';
        const categories = [...new Set(allSets.map(set => set.id.split('_')[0]))];
        categories.forEach(categoryName => {
            const categoryContainer = document.createElement('div');
            categoryContainer.classList.add('category-container');
            const categoryTitle = document.createElement('h3');
            categoryTitle.textContent = categoryName;
            categoryContainer.appendChild(categoryTitle);
            const setsInCategory = allSets.filter(set => set.id.startsWith(categoryName));
            setsInCategory.forEach(set => {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = set.id;
                checkbox.value = set.file;
                checkbox.dataset.setName = set.name;
                const label = document.createElement('label');
                label.htmlFor = set.id;
                label.textContent = set.name;
                const div = document.createElement('div');
                div.appendChild(checkbox);
                div.appendChild(label);
                categoryContainer.appendChild(div);
            });
            setSelectionContainer.appendChild(categoryContainer);
        });
    }

    // VÖLLIG NEU: Die Funktion zum Laden der Wörter basierend auf der Datenbank
    window.loadWordsFromSelection = async function() {
        loadingOverlay.classList.remove('hidden');
        const selectedSetFiles = Array.from(setSelectionContainer.querySelectorAll('input:checked')).map(cb => cb.value);
        if (selectedSetFiles.length === 0) {
            alert("Bitte wähle mindestens ein Wort-Set aus.");
            loadingOverlay.classList.add('hidden');
            return false;
        }
        currentSettings.selectedSets = Array.from(setSelectionContainer.querySelectorAll('input:checked')).map(cb => cb.dataset.setName);
        window.appState.allWords.length = 0;
        
        try {
            const allItemIds = new Set(); // Set vermeidet doppelte IDs
            for (const file of selectedSetFiles) {
                const response = await fetch(file);
                const idList = await response.json(); // z.B. ["becher", "broetchen"]
                idList.forEach(id => allItemIds.add(id));
            }

            allItemIds.forEach(id => {
                if (itemsDatabase[id]) {
                    const item = itemsDatabase[id];
                    const wordObject = {
                        word: item.name,      // z.B. "Broetchen"
                        image: item.image,    // z.B. "data/images/b/broetchen.jpg"
                        audio: item.sound     // z.B. "data/sounds/b/broetchen.mp3"
                    };
                    window.appState.allWords.push(wordObject);
                } else {
                    console.warn(`Wort-ID "${id}" wurde im Set gefunden, aber nicht in der Datenbank.`);
                }
            });

        } catch (error) {
            console.error("Fehler beim Laden der Wort-Listen:", error);
            alert("Ein Fehler ist aufgetreten.");
            loadingOverlay.classList.add('hidden');
            return false;
        }
        
        loadingOverlay.classList.add('hidden');
        return true;
    };
    
    // Spielt den Ton für ein Wort ab
    window.playAudio = function(audioSrc) {
        if (audioSrc) {
            audioPlayer.src = audioSrc;
            audioPlayer.play().catch(e => console.error("Audio-Abspielfehler:", e));
        }
    };
    
    // Aktualisiert die Fortschrittsanzeige
    window.updateProgressBar = function(currentIndex, total) {
        const percentage = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;
        progressBar.style.width = `${percentage}%`;
    };

    // === Event Listeners für gemeinsame Elemente ===
    hamburgerIcon.addEventListener('click', () => { menuContent.classList.toggle('show'); });
    closeButtons.forEach(button => { button.addEventListener('click', () => { button.closest('.modal').classList.add('hidden'); }); });
    window.addEventListener('click', (event) => { if (event.target.classList.contains('modal')) { event.target.classList.add('hidden'); } });
    document.getElementById('menu-anleitung')?.addEventListener('click', (e) => { e.preventDefault(); anleitungModal.classList.remove('hidden'); menuContent.classList.remove('show'); });
    audioButton.addEventListener('click', () => { audioPlayer.play().catch(e => console.error("Audio-Abspielfehler:", e)); });

    // --- NEUE INITIALISIERUNG ---
    async function initializeApp() {
        try {
            await Promise.all([ loadItemsDatabase(), loadSetsManifest() ]);
        } catch (error) {
            console.error("Kritischer Fehler bei der Initialisierung:", error);
            setSelectionContainer.innerHTML = `<p class="error">Anwendung konnte nicht geladen werden. (${error.message})</p>`;
        }
    }

    initializeApp();
    
    // === Globale Variablen für die spezifischen Skripte verfügbar machen ===
    window.appState = { allWords, currentExerciseWords, currentSettings };
    window.domElements = { loadingOverlay, screenSettings, screenExercise, currentSetTitle, wordDisplay, exerciseEndModal };
});