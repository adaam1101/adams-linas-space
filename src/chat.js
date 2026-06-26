// Real-time chat module for Adam & Lina's Space
import { db } from './firebase.js';
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { getCurrentUser, getPartnerKey } from './auth.js';

const MESSAGES_LIMIT = 200;
let messagesUnsubscribe = null;
let typingUnsubscribe = null;
let typingTimeout = null;

export function initChat(onMessage, onTyping) {
  // Listen for messages
  const messagesQuery = query(
    collection(db, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(MESSAGES_LIMIT)
  );

  messagesUnsubscribe = onSnapshot(messagesQuery, (snapshot) => {
    const messages = [];
    snapshot.forEach((doc) => {
      messages.push({ id: doc.id, ...doc.data() });
    });
    onMessage(messages);
  });

  // Listen for typing indicator
  const partnerKey = getPartnerKey();
  if (partnerKey) {
    typingUnsubscribe = onSnapshot(doc(db, 'typing', partnerKey), (snap) => {
      const data = snap.data();
      onTyping(data?.isTyping || false, partnerKey);
    });
  }
}

export async function sendMessage(text) {
  const user = getCurrentUser();
  if (!user || !text.trim()) return;

  await addDoc(collection(db, 'messages'), {
    text: text.trim(),
    sender: user.key,
    senderName: user.name,
    createdAt: serverTimestamp()
  });

  // Clear typing indicator
  await setTyping(false);
}

export async function setTyping(isTyping) {
  const user = getCurrentUser();
  if (!user) return;

  if (typingTimeout) clearTimeout(typingTimeout);

  try {
    if (isTyping) {
      await setDoc(doc(db, 'typing', user.key), { isTyping: true });
      // Auto-clear after 3 seconds
      typingTimeout = setTimeout(() => setTyping(false), 3000);
    } else {
      await deleteDoc(doc(db, 'typing', user.key));
    }
  } catch (e) {
    // Typing indicator is non-critical, ignore errors
  }
}

export function destroyChat() {
  if (messagesUnsubscribe) {
    messagesUnsubscribe();
    messagesUnsubscribe = null;
  }
  if (typingUnsubscribe) {
    typingUnsubscribe();
    typingUnsubscribe = null;
  }
  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }
}

export function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
