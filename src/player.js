// Video player & sync module for Adam & Lina's Space
import { db } from './firebase.js';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { storage } from './firebase.js';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getCurrentUser } from './auth.js';

let ytPlayer = null;
let ytReady = false;
let syncUnsubscribe = null;
let ignoreSyncUntil = 0;
let currentSource = 'youtube'; // 'youtube' | 'upload' | 'netflix'

// YouTube IFrame API loader
export function loadYouTubeAPI() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => resolve();
  });
}

// Extract YouTube video ID from various URL formats
export function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Initialize YouTube player
export function initYouTubePlayer(containerId, onStateChange) {
  return new Promise((resolve) => {
    if (ytPlayer) {
      ytPlayer.destroy();
      ytPlayer = null;
    }

    ytPlayer = new window.YT.Player(containerId, {
      height: '100%',
      width: '100%',
      playerVars: {
        autoplay: 0,
        controls: 1,
        modestbranding: 1,
        rel: 0,
        fs: 1
      },
      events: {
        onReady: () => {
          ytReady = true;
          resolve(ytPlayer);
        },
        onStateChange: (event) => {
          if (onStateChange) onStateChange(event);
        }
      }
    });
  });
}

export function loadYouTubeVideo(videoId) {
  if (ytPlayer && ytReady) {
    ytPlayer.loadVideoById(videoId);
  }
}

export function getYTPlayer() {
  return ytPlayer;
}

// Sync video state to Firestore
export async function syncVideoState(state) {
  const user = getCurrentUser();
  if (!user) return;

  ignoreSyncUntil = Date.now() + 2000; // ignore incoming sync for 2s to avoid loops

  try {
    await setDoc(doc(db, 'room', 'videoState'), {
      ...state,
      updatedBy: user.key,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.error('Sync error:', e);
  }
}

// Listen for video state changes from partner
export function watchVideoState(callback) {
  syncUnsubscribe = onSnapshot(doc(db, 'room', 'videoState'), (snap) => {
    const data = snap.data();
    if (!data) return;

    const user = getCurrentUser();
    // Only react to partner's changes
    if (data.updatedBy === user?.key) return;
    // Ignore if we recently made a change (debounce)
    if (Date.now() < ignoreSyncUntil) return;

    callback(data);
  });
}

// Upload video file to Firebase Storage
export async function uploadVideoFile(file, onProgress) {
  const user = getCurrentUser();
  if (!user || !file) return null;

  const storageRef = ref(storage, `videos/${Date.now()}_${file.name}`);

  try {
    const snapshot = await uploadBytes(storageRef, file);
    const url = await getDownloadURL(snapshot.ref);
    return url;
  } catch (e) {
    console.error('Upload error:', e);
    throw new Error('Failed to upload video 😢');
  }
}

// Netflix countdown sync
export async function startNetflixCountdown() {
  const user = getCurrentUser();
  if (!user) return;

  await setDoc(doc(db, 'room', 'netflix'), {
    countdownStart: Date.now() + 500, // Start in 500ms to sync
    startedBy: user.key,
    title: document.getElementById('netflix-title')?.value || 'Something on Netflix'
  });
}

export function watchNetflixCountdown(callback) {
  return onSnapshot(doc(db, 'room', 'netflix'), (snap) => {
    const data = snap.data();
    if (data) callback(data);
  });
}

export function setCurrentSource(source) {
  currentSource = source;
}

export function getCurrentSource() {
  return currentSource;
}

export function destroyPlayer() {
  if (ytPlayer) {
    try { ytPlayer.destroy(); } catch (e) { /* ignore */ }
    ytPlayer = null;
    ytReady = false;
  }
  if (syncUnsubscribe) {
    syncUnsubscribe();
    syncUnsubscribe = null;
  }
}
