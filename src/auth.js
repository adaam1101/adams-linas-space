// Authentication module for Adam & Lina's Space
import { auth, db } from './firebase.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import {
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';

// User mapping — simple fixed accounts
const USERS = {
  adam: {
    email: 'adam.ameyoud@ensb.dz',
    displayName: 'Adam',
    emoji: '🧑‍💻',
    color: 'adam'
  },
  lina: {
    email: 'linalina@gmail.com',
    displayName: 'Lina',
    emoji: '👩‍🎨',
    color: 'lina'
  }
};

let currentUser = null;
let partnerUnsubscribe = null;

export function getCurrentUser() {
  return currentUser;
}

export function getPartnerName() {
  if (!currentUser) return null;
  return currentUser.name === 'Adam' ? 'Lina' : 'Adam';
}

export function getPartnerKey() {
  if (!currentUser) return null;
  return currentUser.key === 'adam' ? 'lina' : 'adam';
}

export async function login(userKey, password) {
  const userData = USERS[userKey];
  if (!userData) throw new Error('Unknown user');

  try {
    const cred = await signInWithEmailAndPassword(auth, userData.email, password);
    currentUser = {
      uid: cred.user.uid,
      key: userKey,
      name: userData.displayName,
      emoji: userData.emoji,
      color: userData.color
    };

    // Set online status
    await setDoc(doc(db, 'presence', userKey), {
      online: true,
      lastSeen: serverTimestamp()
    }, { merge: true });

    return currentUser;
  } catch (err) {
    console.error('Login error:', err.code, err.message);
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-password') {
      throw new Error('Wrong password! Try again ✨');
    }
    if (err.code === 'auth/user-not-found') {
      throw new Error('Account not found. Create it in Firebase Auth Console.');
    }
    if (err.code === 'auth/too-many-requests') {
      throw new Error('Too many attempts! Wait a minute and try again 🕐');
    }
    throw new Error(`Login error: ${err.code || err.message}`);
  }
}

export async function logout() {
  if (currentUser) {
    try {
      await setDoc(doc(db, 'presence', currentUser.key), {
        online: false,
        lastSeen: serverTimestamp()
      }, { merge: true });
    } catch (e) { /* ignore */ }
  }
  if (partnerUnsubscribe) {
    partnerUnsubscribe();
    partnerUnsubscribe = null;
  }
  currentUser = null;
  await signOut(auth);
}

export function watchPartnerPresence(callback) {
  const partnerKey = getPartnerKey();
  if (!partnerKey) return;

  partnerUnsubscribe = onSnapshot(doc(db, 'presence', partnerKey), (snap) => {
    const data = snap.data();
    callback(data?.online || false);
  });
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      // Determine which user this is
      for (const [key, data] of Object.entries(USERS)) {
        if (data.email === user.email) {
          currentUser = {
            uid: user.uid,
            key,
            name: data.displayName,
            emoji: data.emoji,
            color: data.color
          };
          break;
        }
      }
    } else {
      currentUser = null;
    }
    callback(currentUser);
  });
}
