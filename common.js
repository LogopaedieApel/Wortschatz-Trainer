// common.js (Vollständig & Korrigiert)

document.addEventListener('DOMContentLoaded', () => {
    // === Globale Zustandsvariablen ===
    let allSets = [];
    let allWords = [];
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
    
    // Modals
    const anleitungModal = document.getElementById('anleitung-modal');
    const exerciseEndModal = document.getElementById('exercise-end-modal');
    const closeButtons = document.querySelectorAll('.close-button');

    // === Kernfunktionen (global verfügbar machen) ===
    
    // Funktion zum Anzeigen eines bestimmten Bildschirms
    window.showScreen = function(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });
        const screenToShow = document.getElementById(screenId);
        if (screenToShow) {
            screenToShow.classList.remove('hidden');
        }
    };

    // Fisher-Yates Shuffle Algorithmus
    window.shuffleArray = function(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    };

    // --- NEUE, KORRIGIERTE FUNKTIONEN ---

    // Funktion zum Laden der Wort-Sets aus sets.json
    async function loadSetsManifest() {
        try {
            // Lade die korrekte Datei aus dem Hauptverzeichnis
            const response = await fetch('sets.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const categories = await response.json();

            // Wandle das verschachtelte Objekt in eine flache Liste um
            const flattenedSets = [];
            for (const categoryKey in categories) {
                const category = categories[categoryKey];
                for (const setKey in category) {
                    // Überspringe Metadaten wie 'displayName' auf Kategorie-Ebene
                    if (typeof category[setKey] === 'object' && category[setKey].path) {
                        const set = category[setKey];
                        flattenedSets.push({
                            id: `${categoryKey}_${setKey}`, // Eindeutige ID, z.B. "Artikulation_b_initial"
                            name: set.displayName,
                            file: set.path
                        });
                    }
                }
            }
            allSets = flattenedSets;
            populateSetSelection();

        } catch (error) {
            console.error("Fehler beim Laden der sets.json:", error);
            setSelectionContainer.innerHTML = '<p class="error">Wort-Sets konnten nicht geladen werden.</p>';
        }
    }

    // Füllt die Checkboxen für die Wort-Sets (angepasst für Kategorien)
    function populateSetSelection() {
        if (!setSelectionContainer) return;
        setSelectionContainer.innerHTML = '<h2>Wort-Sets auswählen:</h2>';

        // Hol die Kategorienamen aus den IDs, um Gruppen zu erstellen
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

    // --- ENDE DER NEUEN FUNKTIONEN ---

    // Lädt die Wörter aus den ausgewählten JSON-Dateien
    window.loadWordsFromSelection = async function() {
        loadingOverlay.classList.remove('hidden');
        const selectedFiles = Array.from(setSelectionContainer.querySelectorAll('input:checked')).map(cb => cb.value);
        
        if (selectedFiles.length === 0) {
            alert("Bitte wähle mindestens ein Wort-Set aus.");
            loadingOverlay.classList.add('hidden');
            return false;
        }

        currentSettings.selectedSets = Array.from(setSelectionContainer.querySelectorAll('input:checked')).map(cb => cb.dataset.setName);
        allWords = [];
        try {
            for (const file of selectedFiles) {
                const response = await fetch(file);
                const data = await response.json();
                allWords.push(...data.words);
            }
        } catch (error) {
            console.error("Fehler beim Laden der Wortdateien:", error);
            alert("Ein Fehler ist aufgetreten. Bitte versuche es erneut.");
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
    
    // Hamburger-Menü
    hamburgerIcon.addEventListener('click', () => {
        menuContent.classList.toggle('show');
    });

    // Modals
    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            button.closest('.modal').classList.add('hidden');
        });
    });

    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.classList.add('hidden');
        }
    });
    
    document.getElementById('menu-anleitung')?.addEventListener('click', (e) => {
        e.preventDefault();
        anleitungModal.classList.remove('hidden');
        menuContent.classList.remove('show');
    });

    // Audio-Button
    audioButton.addEventListener('click', () => {
       audioPlayer.play().catch(e => console.error("Audio-Abspielfehler:", e));
    });

    // Initialisierung
    loadSetsManifest();
    
    // === Globale Variablen für die spezifischen Skripte verfügbar machen ===
    window.appState = {
        allWords,
        currentExerciseWords,
        currentSettings
    };
    window.domElements = {
        loadingOverlay,
        screenSettings,
        screenExercise,
        currentSetTitle,
        wordDisplay,
        exerciseEndModal
    };
});