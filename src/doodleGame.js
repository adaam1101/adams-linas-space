// Pictionary Game State & Logic Manager
import { db } from './firebase.js';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';

const WORD_POOL = [
  "cat", "rainbow", "sunset", "heart", "moon", "star", "flower", "ice cream",
  "pizza", "coffee", "cupcake", "donut", "home", "tree", "butterfly", "balloon",
  "teddy bear", "gift", "cloud", "sun", "strawberry", "smile", "cookie", "rose",
  "key", "ring", "music", "guitar", "book", "umbrella", "fish", "dog", "bird",
  "rocket", "crown", "sparkles", "glasses", "lightbulb", "clock", "mirror",
  "hat", "envelope", "cherry", "camera", "diamond", "fire", "ship", "duck", "cup",
  "burger", "pencil", "apple", "banana", "ghost", "frog", "airplane", "car"
];

let gameUnsubscribe = null;

// Initialize game state synchronization
export function initDoodleGame(onStateUpdate) {
  if (gameUnsubscribe) {
    gameUnsubscribe();
  }

  const stateDocRef = doc(db, 'doodleGame', 'state');
  
  gameUnsubscribe = onSnapshot(stateDocRef, (snap) => {
    if (snap.exists()) {
      onStateUpdate(snap.data());
    } else {
      // First-time initialize state in db
      initializeGameDb();
    }
  });

  return () => {
    if (gameUnsubscribe) {
      gameUnsubscribe();
      gameUnsubscribe = null;
    }
  };
}

// Generate the initial game state structure in the db
async function initializeGameDb() {
  const stateDocRef = doc(db, 'doodleGame', 'state');
  const initialWord = getRandomWord();
  try {
    await setDoc(stateDocRef, {
      drawer: 'adam',
      guesser: 'lina',
      word: initialWord,
      status: 'drawing',
      score: { adam: 0, lina: 0 },
      wrongGuesses: 0,
      version: Date.now()
    });
  } catch (err) {
    console.error('Error initializing game state:', err);
  }
}

// Helper to choose a random word from pool
function getRandomWord(excludeWord = '') {
  const filtered = WORD_POOL.filter(w => w !== excludeWord);
  const randomIndex = Math.floor(Math.random() * filtered.length);
  return filtered[randomIndex];
}

// Start next round, swapping roles and picking a new word
export async function startNewGameRound(currentState) {
  const stateDocRef = doc(db, 'doodleGame', 'state');
  
  const oldDrawer = currentState?.drawer || 'adam';
  const oldGuesser = currentState?.guesser || 'lina';
  
  // Swap drawer and guesser roles
  const nextDrawer = oldGuesser;
  const nextGuesser = oldDrawer;
  
  const nextWord = getRandomWord(currentState?.word);
  
  try {
    await setDoc(stateDocRef, {
      drawer: nextDrawer,
      guesser: nextGuesser,
      word: nextWord,
      status: 'drawing',
      score: currentState?.score || { adam: 0, lina: 0 },
      wrongGuesses: 0,
      version: Date.now() // increment version to clear canvas
    });
  } catch (err) {
    console.error('Error starting new game round:', err);
  }
}

// Complete the drawing phase and notify guesser
export async function submitDrawing() {
  const stateDocRef = doc(db, 'doodleGame', 'state');
  try {
    await updateDoc(stateDocRef, {
      status: 'guessing'
    });
  } catch (err) {
    console.error('Error submitting drawing:', err);
  }
}

// Submit a word guess, returns true if correct, false if not
export async function submitGuess(guess, currentState) {
  if (!guess || !currentState) return false;
  
  const clean = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanedGuess = clean(guess);
  const cleanedWord = clean(currentState.word);
  
  const stateDocRef = doc(db, 'doodleGame', 'state');
  
  if (cleanedGuess === cleanedWord) {
    // Award 1 point to the guesser
    const guesser = currentState.guesser;
    const newScore = { ...currentState.score };
    newScore[guesser] = (newScore[guesser] || 0) + 1;
    
    try {
      await updateDoc(stateDocRef, {
        status: 'correct',
        score: newScore
      });
      return true;
    } catch (err) {
      console.error('Error updating state to correct guess:', err);
      return false;
    }
  } else {
    // Guess is incorrect
    const nextWrong = (currentState.wrongGuesses || 0) + 1;
    try {
      if (nextWrong >= 2) {
        // Turn ends in failure!
        await updateDoc(stateDocRef, {
          status: 'failed',
          wrongGuesses: nextWrong
        });
      } else {
        // Increment wrong guess count
        await updateDoc(stateDocRef, {
          wrongGuesses: nextWrong
        });
      }
    } catch (err) {
      console.error('Error updating wrong guess count:', err);
    }
    return false;
  }
}

// Reset game scores back to 0
export async function resetGameScores(currentState) {
  const stateDocRef = doc(db, 'doodleGame', 'state');
  try {
    await updateDoc(stateDocRef, {
      score: { adam: 0, lina: 0 }
    });
  } catch (err) {
    console.error('Error resetting game scores:', err);
  }
}

// Reset the entire game state (scores to 0, status to drawing, selects a new word)
export async function resetWholeGame() {
  const stateDocRef = doc(db, 'doodleGame', 'state');
  const initialWord = getRandomWord();
  try {
    await setDoc(stateDocRef, {
      drawer: 'adam',
      guesser: 'lina',
      word: initialWord,
      status: 'drawing',
      score: { adam: 0, lina: 0 },
      wrongGuesses: 0,
      version: Date.now()
    });
  } catch (err) {
    console.error('Error resetting whole game:', err);
  }
}
