// presentation.js

document.addEventListener('DOMContentLoaded', () => {
    // Globale Variablen aus common.js holen
    const { currentSettings, currentExerciseWords } = window.appState;
    const { loadingOverlay, screenSettings, screenExercise, currentSetTitle, wordDisplay, exerciseEndModal } = window.domElements;

    // === DOM-Elemente NUR für die Präsentation ===
    const screenPresentationSelection = document.getElementById('screen-presentation-selection');
    const presentationTypeCards = document.querySelectorAll('[data-presentation-type]');
    const settingRepetitions = document.getElementById('setting-repetitions');
    const settingDelay = document.getElementById('setting-delay');
    const repetitionsInput = document.getElementById('repetitions');
    const delayInput = document.getElementById('delay');
    const btnStartExercise = document.getElementById('btn-start-exercise');
    const btnSettingsBack = document.getElementById('btn-settings-back');
    
    // Übungs-Bildschirm Elemente
    const imageSlider = document.getElementById('image-slider');
    const sliderControls = document.getElementById('slider-controls');
    const autoModeControls = document.getElementById('auto-mode-controls');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const btnPauseResume = document.getElementById('btn-pause-resume');
    
    // End-Modal Buttons
    const btnRestart = document.getElementById('btn-restart-exercise');
    const btnBackToSettings = document.getElementById('btn-back-to-settings');

    // === Zustandsvariablen NUR für die Präsentation ===
    let currentIndex = 0;
    let touchStartX = 0;
    let autoModeInterval = null;
    let isPaused = false;
    
    currentSettings.mode = 'presentation';

    // === Funktionen NUR für die Präsentation ===

    function setupPresentationExercise() {
        currentExerciseWords.length = 0; // Array leeren
        const baseWords = window.shuffleArray([...window.appState.allWords]);
        for (let i = 0; i < currentSettings.repetitions; i++) {
            currentExerciseWords.push(...window.shuffleArray([...baseWords]));
        }

        imageSlider.innerHTML = '';
        currentExerciseWords.forEach(word => {
            const slide = document.createElement('div');
            slide.classList.add('slide');
            const img = document.createElement('img');
            img.src = word.image;
            img.alt = word.word;
            slide.appendChild(img);
            imageSlider.appendChild(slide);
        });

        currentIndex = 0;
        updateSlider();
        window.showScreen('screen-exercise');
        
        if (currentSettings.presentationType === 'auto') {
            startAutoMode();
        }
    }

    function updateSlider(transition = true) {
        if (!transition) {
            imageSlider.style.transition = 'none';
        } else {
            imageSlider.style.transition = 'transform 0.5s ease-in-out';
        }
        
        const offset = -currentIndex * 100;
        imageSlider.style.transform = `translateX(${offset}%)`;

        const currentWord = currentExerciseWords[currentIndex];
        if (currentWord) {
            wordDisplay.textContent = currentWord.word;
            window.playAudio(currentWord.audio);
        }
        
        window.updateProgressBar(currentIndex, currentExerciseWords.length);
    }
    
    function showNext() {
        if (currentIndex < currentExerciseWords.length - 1) {
            currentIndex++;
            updateSlider();
        } else {
            endExercise();
        }
    }

    function showPrev() {
        if (currentIndex > 0) {
            currentIndex--;
            updateSlider();
        }
    }

    function startAutoMode() {
        isPaused = false;
        btnPauseResume.textContent = 'Pause';
        clearInterval(autoModeInterval);
        autoModeInterval = setInterval(() => {
            if (!isPaused) {
                showNext();
            }
        }, currentSettings.delay * 1000);
    }

    function pauseResumeAutoMode() {
        isPaused = !isPaused;
        btnPauseResume.textContent = isPaused ? 'Weiter' : 'Pause';
    }
    
    function endExercise() {
        clearInterval(autoModeInterval);
        exerciseEndModal.classList.remove('hidden');
        document.getElementById('quiz-results').innerHTML = ''; // Keine Ergebnisse hier
    }

    // === Event Listeners NUR für die Präsentation ===

    presentationTypeCards.forEach(card => {
        card.addEventListener('click', () => {
            currentSettings.presentationType = card.dataset.presentationType;
            
            document.getElementById('settings-title').textContent = `Einstellungen: ${card.querySelector('.subtitle').textContent}`;
            
            if (currentSettings.presentationType === 'manual') {
                settingRepetitions.style.display = 'flex';
                settingDelay.style.display = 'none';
                sliderControls.style.display = 'flex';
                autoModeControls.style.display = 'none';
            } else { // auto
                settingRepetitions.style.display = 'flex';
                settingDelay.style.display = 'flex';
                sliderControls.style.display = 'none';
                autoModeControls.style.display = 'flex';
            }
            window.showScreen('screen-settings');
        });
    });

    btnStartExercise.addEventListener('click', async () => {
        currentSettings.repetitions = parseInt(repetitionsInput.value, 10);
        currentSettings.delay = parseInt(delayInput.value, 10);
        
        const wordsLoaded = await window.loadWordsFromSelection();
        if (wordsLoaded) {
            setupPresentationExercise();
        }
    });
    
    btnSettingsBack.addEventListener('click', () => {
        window.showScreen('screen-presentation-selection');
    });

    nextBtn.addEventListener('click', showNext);
    prevBtn.addEventListener('click', showPrev);
    btnPauseResume.addEventListener('click', pauseResumeAutoMode);

    // Touch-Gesten für den Slider
    imageSlider.addEventListener('touchstart', e => {
        touchStartX = e.touches[0].clientX;
    });

    imageSlider.addEventListener('touchend', e => {
        const touchEndX = e.changedTouches[0].clientX;
        if (touchStartX - touchEndX > 50) { // Swipe left
            showNext();
        } else if (touchStartX - touchEndX < -50) { // Swipe right
            showPrev();
        }
    });

    btnRestart.addEventListener('click', () => {
        exerciseEndModal.classList.add('hidden');
        setupPresentationExercise();
    });

    btnBackToSettings.addEventListener('click', () => {
        exerciseEndModal.classList.add('hidden');
        window.showScreen('screen-settings');
    });

    // Initialer Zustand
    window.showScreen('screen-presentation-selection');
});