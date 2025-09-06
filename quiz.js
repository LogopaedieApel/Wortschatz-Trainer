// quiz.js

document.addEventListener('DOMContentLoaded', () => {
    // Globale Variablen aus common.js holen
    const { currentSettings, currentExerciseWords } = window.appState;
    const { loadingOverlay, screenSettings, screenExercise, currentSetTitle, wordDisplay, exerciseEndModal } = window.domElements;

    // === DOM-Elemente NUR für das Quiz ===
    const btnStartExercise = document.getElementById('btn-start-exercise');
    const quizOptionsContainer = document.getElementById('quiz-options-container');
    const quizResults = document.getElementById('quiz-results');
    
    // End-Modal Buttons
    const btnRestart = document.getElementById('btn-restart-exercise');
    const btnBackToSettings = document.getElementById('btn-back-to-settings');

    // === Zustandsvariablen NUR für das Quiz ===
    let quizRound = 0;
    let correctAnswers = 0;
    
    currentSettings.mode = 'quiz';

    // === Funktionen NUR für das Quiz ===

    function setupQuizExercise() {
        currentExerciseWords.length = 0;
        currentExerciseWords.push(...window.shuffleArray([...window.appState.allWords]));
        quizRound = 0;
        correctAnswers = 0;
        
        window.showScreen('screen-exercise');
        setupQuizRound();
    }
    
    function setupQuizRound() {
        if (quizRound >= currentExerciseWords.length) {
            endExercise();
            return;
        }

        window.updateProgressBar(quizRound, currentExerciseWords.length);
        const currentWord = currentExerciseWords[quizRound];
        wordDisplay.textContent = currentWord.word;
        window.playAudio(currentWord.audio);

        // Antwortmöglichkeiten erstellen
        const options = createQuizOptions(currentWord);
        quizOptionsContainer.innerHTML = '';
        
        options.forEach(option => {
            const img = document.createElement('img');
            img.src = option.image;
            img.alt = option.word;
            img.classList.add('quiz-option');
            img.addEventListener('click', () => handleQuizAnswer(option.word === currentWord.word, img));
            quizOptionsContainer.appendChild(img);
        });
    }

    function createQuizOptions(correctWord) {
        let options = [correctWord];
        let distractors = window.appState.allWords.filter(w => w.word !== correctWord.word);
        distractors = window.shuffleArray(distractors);

        for (let i = 0; i < 3 && i < distractors.length; i++) {
            options.push(distractors[i]);
        }
        
        return window.shuffleArray(options);
    }
    
    function handleQuizAnswer(isCorrect, selectedImage) {
        // Visuelles Feedback
        if (isCorrect) {
            correctAnswers++;
            selectedImage.classList.add('correct');
        } else {
            selectedImage.classList.add('incorrect');
            // Zeige die richtige Antwort
            const correctImg = quizOptionsContainer.querySelector(`[src="${currentExerciseWords[quizRound].image}"]`);
            if(correctImg) correctImg.classList.add('correct');
        }

        // Kurze Pause, dann zur nächsten Runde
        setTimeout(() => {
            quizRound++;
            setupQuizRound();
        }, 1500);
    }

    function endExercise() {
        quizResults.innerHTML = `<h3>Ergebnis</h3><p>Du hast ${correctAnswers} von ${currentExerciseWords.length} Fragen richtig beantwortet.</p>`;
        exerciseEndModal.classList.remove('hidden');
    }

    // === Event Listeners NUR für das Quiz ===

    btnStartExercise.addEventListener('click', async () => {
        const wordsLoaded = await window.loadWordsFromSelection();
        if (wordsLoaded) {
            setupQuizExercise();
        }
    });

    btnRestart.addEventListener('click', () => {
        exerciseEndModal.classList.add('hidden');
        setupQuizExercise();
    });

    btnBackToSettings.addEventListener('click', () => {
        exerciseEndModal.classList.add('hidden');
        window.showScreen('screen-settings');
    });
    
    // Initialer Zustand
    window.showScreen('screen-settings');
});