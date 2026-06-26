// Firebase configuration and initialization
// You need to replace these with your actual Firebase project credentials
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCzDoJjNFT-eaQfu9xC1d3wXWp3k9mKOT0",
  authDomain: "adam-lina.firebaseapp.com",
  projectId: "adam-lina",
  storageBucket: "adam-lina.firebasestorage.app",
  messagingSenderId: "817319777262",
  appId: "1:817319777262:web:cfd699a2105c0e8ba7b4ff",
  measurementId: "G-3PY59TWJ5E"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
