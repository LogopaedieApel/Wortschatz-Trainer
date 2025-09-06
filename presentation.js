// presentation.js (FINALE VERSION)

document.addEventListener('DOMContentLoaded', () => {
    const { currentSettings, currentExerciseWords } = window.appState;
    const { wordDisplay, exerciseEndModal } = window.domElements;

    // === DOM-Elemente ===
    const screenPresentationSelection = document.getElementById('screen-presentation-selection');
    const presentationTypeCards = document.querySelectorAll('[data-presentation-type]');
    const settingRepetitions = document.getElementById('setting-repetitions');
    const settingDelay = document.getElementById('setting-delay');
    const repetitionsInput = document.getElementById('repetitions');
    const delayInput = document.getElementById('delay');
    const btnStartExercise = document.getElementById('btn-start-exercise');
    const btnSettingsBack = document.getElementById('btn-settings-back');
    const imageSlider = document.getElementById('image-slider');
    const progressDotsContainer = document.getElementById('progress-dots-container');
    const bottomControlsContainer = document.getElementById('bottom-controls-container');
    const autoModeControls = document.getElementById('auto-mode-controls');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const btnPauseResume = document.getElementById('btn-pause-resume');
    const btnRestart = document.getElementById('btn-restart-exercise');
    const btnBackToSettings = document.getElementById('btn-back-to-settings');

    // === Zustand ===
    let currentIndex = 0;
    let touchStartX = 0;
    let autoModeInterval = null;
    let isPaused = false;
    currentSettings.mode = 'presentation';

    // === Funktionen ===
    const createProgressDots = () => {
        progressDotsContainer.innerHTML = '';
        currentExerciseWords.forEach((_, i) => {
            const dot = document.createElement('div');
            dot.className = 'progress-dot';
            dot.dataset.index = i;
            progressDotsContainer.appendChild(dot);
        });
    };

    const updateProgressDots = () => {
        const dots = progressDotsContainer.querySelectorAll('.progress-dot');
        dots.forEach((dot, index) => dot.classList.toggle('active', index === currentIndex));
    };
    
    // NEUE SLIDER-LOGIK: Steuert Klassen statt Transform
    const updateSlider = () => {
        const slides = imageSlider.querySelectorAll('.slide');
        slides.forEach((slide, index) => {
            slide.classList.remove('active', 'prev', 'next');
            if (index === currentIndex) {
                slide.classList.add('active');
            } else if (index === currentIndex - 1) {
                slide.classList.add('prev');
            } else if (index === currentIndex + 1) {
                slide.classList.add('next');
            }
        });

        const currentWord = currentExerciseWords[currentIndex];
        if (currentWord) {
            wordDisplay.textContent = currentWord.word;
            window.playAudio(currentWord.audio);
        }
        updateProgressDots();
    };

    const setupPresentationExercise = () => {
        currentExerciseWords.length = 0;
        const baseWords = window.shuffleArray([...window.appState.allWords]);
        for (let i = 0; i < currentSettings.repetitions; i++) {
            currentExerciseWords.push(...window.shuffleArray([...baseWords]));
        }

        imageSlider.innerHTML = '';
        currentExerciseWords.forEach(word => {
            const slide = document.createElement('div');
            slide.className = 'slide';
            const img = document.createElement('img');
            img.src = word.image;
            img.alt = word.word;
            slide.appendChild(img);
            imageSlider.appendChild(slide);
        });

        createProgressDots();
        currentIndex = 0;
        // Kurze Verzögerung, damit die CSS-Transition beim ersten Laden greift
        setTimeout(() => {
            updateSlider();
            window.showScreen('screen-exercise');
            if (currentSettings.presentationType === 'auto') startAutoMode();
        }, 100);
    };

    const showNext = () => {
        if (currentIndex < currentExerciseWords.length - 1) {
            currentIndex++;
            updateSlider();
        } else {
            endExercise();
        }
    };

    const showPrev = () => {
        if (currentIndex > 0) {
            currentIndex--;
            updateSlider();
        }
    };

    const startAutoMode = () => {
        isPaused = false;
        btnPauseResume.textContent = 'Pause';
        clearInterval(autoModeInterval);
        autoModeInterval = setInterval(() => !isPaused && showNext(), currentSettings.delay * 1000);
    };

    const pauseResumeAutoMode = () => {
        isPaused = !isPaused;
        btnPauseResume.textContent = isPaused ? 'Weiter' : 'Pause';
    };
    
    const endExercise = () => {
        clearInterval(autoModeInterval);
        exerciseEndModal.classList.remove('hidden');
        document.getElementById('quiz-results').innerHTML = '';
    };

    // === Event Listeners ===
    presentationTypeCards.forEach(card => {
        card.addEventListener('click', () => {
            currentSettings.presentationType = card.dataset.presentationType;
            document.getElementById('settings-title').textContent = `Einstellungen: ${card.querySelector('.subtitle').textContent}`;
            const isManual = currentSettings.presentationType === 'manual';
            
            settingDelay.style.display = isManual ? 'none' : 'block';
            bottomControlsContainer.classList.toggle('hidden', !isManual);
            autoModeControls.classList.toggle('hidden', isManual);
            
            window.showScreen('screen-settings');
        });
    });

    btnStartExercise.addEventListener('click', async () => {
        currentSettings.repetitions = parseInt(repetitionsInput.value, 10);
        currentSettings.delay = parseInt(delayInput.value, 10);
        if (await window.loadWordsFromSelection()) setupPresentationExercise();
    });
    
    btnSettingsBack.addEventListener('click', () => window.showScreen('screen-presentation-selection'));
    nextBtn.addEventListener('click', showNext);
    prevBtn.addEventListener('click', showPrev);
    btnPauseResume.addEventListener('click', pauseResumeAutoMode);
    imageSlider.addEventListener('touchstart', e => touchStartX = e.touches[0].clientX);
    imageSlider.addEventListener('touchend', e => {
        const touchEndX = e.changedTouches[0].clientX;
        if (touchStartX - touchEndX > 50) showNext(); 
        else if (touchStartX - touchEndX < -50) showPrev();
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