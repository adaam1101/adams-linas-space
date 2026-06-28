// Main application — Adam & Lina's Space
import './style.css';
import { login, logout, getCurrentUser, watchPartnerPresence, getPartnerName } from './auth.js';
import { initChat, sendMessage, setTyping, destroyChat, formatTime, toggleReaction, sendVoiceMessage } from './chat.js';
import {
  loadYouTubeAPI,
  extractYouTubeId,
  initYouTubePlayer,
  loadYouTubeVideo,
  getYTPlayer,
  syncVideoState,
  watchVideoState,
  uploadVideoFile,
  startNetflixCountdown,
  watchNetflixCountdown,
  setCurrentSource,
  destroyPlayer
} from './player.js';
import { createEmojiPicker } from './emoji.js';
import { startScreenSharing, listenForIncomingShare, stopScreenSharing } from './screenShare.js';
import { db } from './firebase.js';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  initCanvasDrawing,
  drawStrokes,
  syncIncomingStrokes,
  pushStrokeToDb,
  clearStrokesInDb
} from './doodle.js';
import {
  initDoodleGame,
  startNewGameRound,
  submitDrawing,
  submitGuess,
  resetGameScores,
  resetWholeGame
} from './doodleGame.js';

// ─── Particles Background ───
function createParticles() {
  const container = document.getElementById('particles-bg');
  if (!container) return;

  // Skip the ambient particles for users who prefer reduced motion —
  // saves CPU/battery and respects the accessibility preference.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  // Sunset palette: amber, coral, plum sparks.
  const colors = ['rgba(251,191,36,0.3)', 'rgba(251,113,133,0.24)', 'rgba(192,132,252,0.2)'];

  // Build all nodes off-DOM, then insert once to avoid layout thrash.
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 20; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    const size = Math.random() * 2 + 1;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.background = colors[Math.floor(Math.random() * colors.length)];
    particle.style.animationDuration = `${Math.random() * 20 + 15}s`;
    particle.style.animationDelay = `${Math.random() * 15}s`;
    fragment.appendChild(particle);
  }
  container.appendChild(fragment);
}

// ─── Rotating Login Taglines ───
function initLoginTaglines() {
  const el = document.querySelector('.login-subtitle');
  if (!el) return () => {};
  const lines = [
    'your cozy movie corner 🍿',
    'press play, together 💞',
    'miles apart, same screen 🌙',
    'snacks optional, you mandatory 🥰',
    'where every night is movie night 🎬',
  ];
  let i = 0;
  const tick = setInterval(() => {
    i = (i + 1) % lines.length;
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => {
      el.textContent = lines[i];
      el.style.opacity = '';
      el.style.transform = '';
    }, 350);
  }, 3800);
  return () => clearInterval(tick);
}

// ─── Header Live Clock + Greeting ───
function initHeaderClock() {
  const headerLeft = document.querySelector('.header-left');
  if (!headerLeft || headerLeft.querySelector('.header-clock')) return () => {};
  const clock = document.createElement('div');
  clock.className = 'header-clock';
  clock.innerHTML = `<span class="header-clock-emoji"></span><span class="header-clock-time"></span>`;
  headerLeft.appendChild(clock);

  const emojiEl = clock.querySelector('.header-clock-emoji');
  const timeEl = clock.querySelector('.header-clock-time');

  function render() {
    const now = new Date();
    const h = now.getHours();
    const emoji = h < 6 ? '🌙' : h < 12 ? '🌅' : h < 18 ? '☀️' : h < 21 ? '🌇' : '🌙';
    emojiEl.textContent = emoji;
    timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  render();
  const tick = setInterval(render, 15000);
  return () => clearInterval(tick);
}

// ─── Screen Management ───
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

// ─── Login Logic ───
function initLogin() {
  const modal = document.getElementById('password-modal');
  const modalAvatar = document.getElementById('modal-avatar');
  const modalTitle = document.getElementById('modal-title');
  const passwordInput = document.getElementById('password-input');
  const passwordForm = document.getElementById('password-form');
  const loginError = document.getElementById('login-error');
  const modalClose = document.getElementById('modal-close');
  let selectedUser = null;

  function openModal(userKey) {
    selectedUser = userKey;
    const isAdam = userKey === 'adam';
    modalAvatar.textContent = isAdam ? '🧑‍💻' : '👩‍🎨';
    modalTitle.textContent = isAdam ? 'Hey Adam! 👋' : 'Hey Lina! 💕';
    passwordInput.className = isAdam ? '' : 'lina-focus';
    loginError.textContent = '';
    passwordInput.value = '';
    modal.classList.add('show');
    setTimeout(() => passwordInput.focus(), 100);
  }

  document.getElementById('login-adam').addEventListener('click', () => openModal('adam'));
  document.getElementById('login-lina').addEventListener('click', () => openModal('lina'));

  modalClose.addEventListener('click', () => {
    modal.classList.remove('show');
    selectedUser = null;
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
      selectedUser = null;
    }
  });

  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedUser) return;

    const password = passwordInput.value;
    const btn = document.getElementById('btn-enter');
    btn.textContent = 'Entering... ✨';
    btn.disabled = true;
    loginError.textContent = '';

    try {
      await login(selectedUser, password);
      modal.classList.remove('show');
      enterRoom();
    } catch (err) {
      loginError.textContent = err.message;
    } finally {
      btn.textContent = 'Enter Space 🚀';
      btn.disabled = false;
    }
  });
}

// ─── Room Logic ───
let chatMessages = [];
let activeReplyTo = null;
let activeAudio = null;
let activeAudioId = null;

function enterRoom() {
  const user = getCurrentUser();
  if (!user) return;

  // Set body class for color theming
  document.body.className = `user-${user.key}`;
  showScreen('room-screen');

  // Partner presence
  const partnerName = getPartnerName();
  document.getElementById('partner-name').textContent = partnerName;

  watchPartnerPresence((online) => {
    const dot = document.querySelector('.status-dot');
    const name = document.getElementById('partner-name');
    dot.classList.toggle('offline', !online);
    name.textContent = online ? `${partnerName} is here 💕` : `${partnerName} is away`;
  });

  // Initialize chat
  initChatUI();

  // Initialize video player sources
  initVideoSources();

  // Initialize screen sharing
  initScreenShareUI();

  // Load YouTube API
  loadYouTubeAPI().then(() => {
    console.log('YouTube API ready');
  });

  // Initialize doodle game UI
  const doodleCleanup = initDoodleGameUI();

  // Initialize heart burst UI
  const heartBurstCleanup = initHeartBurstUI();

  // Header live clock + greeting
  const headerClockCleanup = initHeaderClock();

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    destroyChat();
    destroyPlayer();
    if (isSharingScreen) {
      await stopScreenSharing();
    }
    if (stopIncomingShareListener) {
      stopIncomingShareListener();
    }
    if (doodleCleanup) {
      doodleCleanup();
    }
    if (heartBurstCleanup) {
      heartBurstCleanup();
    }
    if (headerClockCleanup) {
      headerClockCleanup();
    }
    await logout();
    document.body.className = '';
    showScreen('login-screen');
  });
}

// Helper to convert audio Blob to base64 Data URL
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Chat UI ───
function initChatUI() {
  const chatContainer = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const msgCount = document.getElementById('msg-count');
  const typingIndicator = document.getElementById('typing-indicator');
  const typingNameEl = document.getElementById('typing-name');
  const emojiBtn = document.getElementById('btn-emoji');
  const emojiPicker = document.getElementById('emoji-picker');
  const emojiGrid = document.getElementById('emoji-grid');
  
  const replyPreviewBar = document.getElementById('chat-reply-preview');
  const replyNameEl = document.getElementById('reply-preview-name');
  const replyTextEl = document.getElementById('reply-preview-text');
  const closeReplyBtn = document.getElementById('btn-close-reply');
  
  const voiceBtn = document.getElementById('btn-voice');
  const voiceRecordContainer = document.getElementById('voice-record-container');
  const recordTimerEl = document.getElementById('recording-timer');
  const voiceCancelBtn = document.getElementById('btn-voice-cancel');
  const sendBtn = document.getElementById('btn-send');
  
  const user = getCurrentUser();

  let mediaRecorder = null;
  let audioChunks = [];
  let recordTimerInterval = null;
  let recordStartTime = 0;
  let isRecordCancelled = false;

  // Toggle send/mic buttons based on input text
  chatInput.addEventListener('input', () => {
    const text = chatInput.value.trim();
    if (text.length > 0) {
      sendBtn.classList.remove('hidden');
      voiceBtn.classList.add('hidden');
    } else {
      sendBtn.classList.add('hidden');
      voiceBtn.classList.remove('hidden');
    }
  });

  // Cancel reply handler
  closeReplyBtn.addEventListener('click', () => {
    activeReplyTo = null;
    replyPreviewBar.classList.add('hidden');
  });

  // Emoji picker
  createEmojiPicker(emojiGrid, (emoji) => {
    chatInput.value += emoji;
    chatInput.focus();
    emojiPicker.classList.add('hidden');
    sendBtn.classList.remove('hidden');
    voiceBtn.classList.add('hidden');
  });

  emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
      emojiPicker.classList.add('hidden');
    }
    if (!e.target.closest('.reaction-picker-popover') && !e.target.closest('.react-trigger-btn')) {
      document.querySelectorAll('.reaction-picker-popover').forEach(p => p.classList.add('hidden'));
      document.querySelectorAll('.message').forEach(m => m.classList.remove('has-open-picker'));
    }
  });

  // Typing indicator
  let typingDebounce;
  chatInput.addEventListener('input', () => {
    setTyping(true);
    clearTimeout(typingDebounce);
    typingDebounce = setTimeout(() => setTyping(false), 2000);
  });

  // Send message
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    sendBtn.classList.add('hidden');
    voiceBtn.classList.remove('hidden');

    const replyPayload = activeReplyTo;
    activeReplyTo = null;
    replyPreviewBar.classList.add('hidden');

    await sendMessage(text, replyPayload);
  });

  // Voice recording toggle click
  voiceBtn.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      isRecordCancelled = false;
      mediaRecorder.stop();
    } else {
      await startVoiceRecording();
    }
  });

  voiceCancelBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      isRecordCancelled = true;
      mediaRecorder.stop();
    }
  });

  async function startVoiceRecording() {
    audioChunks = [];
    isRecordCancelled = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      let options = { mimeType: 'audio/webm' };
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/ogg' };
        if (!MediaRecorder.isTypeSupported('audio/ogg')) {
          options = {};
        }
      }
      
      mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        stopRecordTimer();
        if (!isRecordCancelled) {
          const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
          recordTimerEl.textContent = 'Sending... ⏳';
          try {
            const replyPayload = activeReplyTo;
            activeReplyTo = null;
            replyPreviewBar.classList.add('hidden');
            const base64Url = await blobToBase64(audioBlob);
            await sendVoiceMessage(base64Url, replyPayload);
          } catch (err) {
            console.error('Failed to send voice message:', err);
            alert('Failed to send voice message 😢');
          }
        }
        stream.getTracks().forEach(track => track.stop());
        resetRecordUI();
      };
      
      mediaRecorder.start();
      recordStartTime = Date.now();
      startRecordTimer();
      
      emojiBtn.classList.add('hidden');
      chatInput.classList.add('hidden');
      voiceRecordContainer.classList.remove('hidden');
      voiceBtn.textContent = '✔️';
      voiceBtn.title = 'Send voice message';
      voiceBtn.classList.add('recording-active');
    } catch (err) {
      console.error('Microphone access failed:', err);
      alert('Could not access microphone. Please check browser permissions! 🎤');
    }
  }

  function startRecordTimer() {
    clearInterval(recordTimerInterval);
    recordTimerEl.textContent = '0:00';
    recordTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      recordTimerEl.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
      
      // Auto-stop at 45 seconds to keep document size under limits
      if (elapsed >= 45 && mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    }, 1000);
  }

  function stopRecordTimer() {
    clearInterval(recordTimerInterval);
  }

  function resetRecordUI() {
    emojiBtn.classList.remove('hidden');
    chatInput.classList.remove('hidden');
    voiceRecordContainer.classList.add('hidden');
    voiceBtn.textContent = '🎤';
    voiceBtn.title = 'Record Voice Message';
    voiceBtn.classList.remove('recording-active');
    mediaRecorder = null;
  }

  // Listen for messages
  initChat(
    (messages) => {
      chatMessages = messages;
      renderMessages(chatContainer, messages, user);
      msgCount.textContent = messages.length;
    },
    (isTyping, who) => {
      typingIndicator.classList.toggle('hidden', !isTyping);
      typingNameEl.textContent = who === 'adam' ? 'Adam is typing' : 'Lina is typing';
    }
  );
}

function renderMessages(container, messages, user) {
  // Keep welcome if no messages
  if (messages.length === 0) {
    container.innerHTML = `
      <div class="chat-welcome">
        <span>🌙</span>
        <p>Welcome to your space! Say something cute 💕</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  messages.forEach((msg) => {
    const isMine = msg.sender === user.key;
    const div = document.createElement('div');
    div.className = `message ${isMine ? 'mine' : 'theirs'}`;

    // Process reactions
    const reactions = msg.reactions || {};
    const emojiCounts = {};
    Object.values(reactions).forEach(emoji => {
      emojiCounts[emoji] = (emojiCounts[emoji] || 0) + 1;
    });

    let reactionsHtml = '';
    const hasReactions = Object.keys(reactions).length > 0;
    if (hasReactions) {
      reactionsHtml = `<div class="message-reactions-pill">`;
      Object.entries(emojiCounts).forEach(([emoji, count]) => {
        const countStr = count > 1 ? `<span class="reaction-count">${count}</span>` : '';
        const userReactedWithThis = reactions[user.key] === emoji;
        
        // Tooltip description
        const reactors = [];
        Object.entries(reactions).forEach(([uKey, uEmoji]) => {
          if (uEmoji === emoji) {
            reactors.push(uKey === user.key ? 'You' : getPartnerName());
          }
        });
        const tooltip = `${reactors.join(' & ')} reacted with ${emoji}`;

        reactionsHtml += `
          <span class="reaction-emoji-badge ${userReactedWithThis ? 'active' : ''}" data-emoji="${emoji}" title="${tooltip}">
            ${emoji}${countStr}
          </span>
        `;
      });
      reactionsHtml += `</div>`;
    }

    // Quoted reply rendering
    let replyHtml = '';
    if (msg.replyTo) {
      replyHtml = `
        <div class="message-reply-preview">
          <span class="reply-sender">${msg.replyTo.senderName}</span>
          <span class="reply-text">${escapeHtml(msg.replyTo.text || '🎙️ Voice Message')}</span>
        </div>
      `;
    }

    // Message body text/audio
    let messageBody = '';
    if (msg.type === 'audio' || msg.audioUrl) {
      const isPlaying = (activeAudioId === msg.id && activeAudio && !activeAudio.paused);
      const btnLabel = isPlaying ? '⏸️' : '▶️';
      messageBody = `
        <div class="voice-message-player" id="voice-player-${msg.id}">
          <button type="button" class="voice-play-btn" data-url="${msg.audioUrl}" data-id="${msg.id}">${btnLabel}</button>
          <div class="voice-progress-container">
            <div class="voice-progress-bar">
              <div class="voice-progress-fill" id="progress-fill-${msg.id}" style="width: 0%"></div>
            </div>
            <span class="voice-duration" id="voice-duration-${msg.id}">0:00</span>
          </div>
        </div>
      `;
    } else {
      messageBody = escapeHtml(msg.text);
    }

    div.innerHTML = `
      <div class="message-content-container">
        <div class="message-bubble">
          ${replyHtml}
          <div class="message-bubble-body">
            ${messageBody}
          </div>
          ${reactionsHtml}
        </div>
        <button type="button" class="btn-reply-msg" title="Reply to message">↩️</button>
        <button type="button" class="react-trigger-btn" title="Add reaction">➕</button>
        <div class="reaction-picker-popover hidden">
          <button type="button" class="picker-emoji-btn" data-emoji="❤️">❤️</button>
          <button type="button" class="picker-emoji-btn" data-emoji="👍">👍</button>
          <button type="button" class="picker-emoji-btn" data-emoji="😂">😂</button>
          <button type="button" class="picker-emoji-btn" data-emoji="😮">😮</button>
          <button type="button" class="picker-emoji-btn" data-emoji="😢">😢</button>
          <button type="button" class="picker-emoji-btn" data-emoji="🙏">🙏</button>
        </div>
      </div>
      <div class="message-meta">
        <span class="message-sender">${msg.senderName}</span>
        <span class="message-time">${formatTime(msg.createdAt)}</span>
      </div>
    `;

    // Attach listeners
    const reactBtn = div.querySelector('.react-trigger-btn');
    const popover = div.querySelector('.reaction-picker-popover');
    
    reactBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const allPopovers = document.querySelectorAll('.reaction-picker-popover');
      allPopovers.forEach(p => {
        if (p !== popover) p.classList.add('hidden');
      });
      popover.classList.toggle('hidden');
      
      document.querySelectorAll('.message').forEach(m => m.classList.remove('has-open-picker'));
      if (!popover.classList.contains('hidden')) {
        div.classList.add('has-open-picker');
      }
    });

    div.querySelectorAll('.picker-emoji-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const emoji = btn.dataset.emoji;
        popover.classList.add('hidden');
        div.classList.remove('has-open-picker');
        try {
          await toggleReaction(msg.id, reactions, emoji);
        } catch (err) {
          console.error('Error toggling reaction:', err);
        }
      });
    });

    div.querySelectorAll('.reaction-emoji-badge').forEach(badge => {
      badge.addEventListener('click', async (e) => {
        e.stopPropagation();
        const emoji = badge.dataset.emoji;
        try {
          await toggleReaction(msg.id, reactions, emoji);
        } catch (err) {
          console.error('Error toggling reaction badge:', err);
        }
      });
    });

    // Reply click handler
    div.querySelector('.btn-reply-msg').addEventListener('click', (e) => {
      e.stopPropagation();
      activeReplyTo = {
        id: msg.id,
        text: msg.type === 'audio' ? '🎙️ Voice Message' : msg.text,
        senderName: msg.senderName
      };

      const replyPreviewBar = document.getElementById('chat-reply-preview');
      const replyNameEl = document.getElementById('reply-preview-name');
      const replyTextEl = document.getElementById('reply-preview-text');

      replyNameEl.textContent = msg.senderName;
      replyTextEl.textContent = msg.type === 'audio' ? '🎙️ Voice Message' : msg.text;
      replyPreviewBar.classList.remove('hidden');

      const chatInput = document.getElementById('chat-input');
      chatInput.focus();
    });

    // Play Voice message click handler
    div.querySelectorAll('.voice-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.dataset.url;
        const id = btn.dataset.id;
        handleVoicePlayback(id, url, btn);
      });
    });

    container.appendChild(div);
  });

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Video Sources ───
function initVideoSources() {
  const sourceBtns = document.querySelectorAll('.source-btn');
  const youtubeBar = document.getElementById('youtube-input-bar');
  const uploadBar = document.getElementById('upload-input-bar');
  const netflixPanel = document.getElementById('netflix-panel');
  const screensharePanel = document.getElementById('screenshare-panel');
  const doodlePanel = document.getElementById('doodle-panel');
  const playerContainer = document.getElementById('player-container');

  sourceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sourceBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const source = btn.dataset.source;
      setCurrentSource(source);

      youtubeBar.classList.toggle('hidden', source !== 'youtube');
      uploadBar.classList.toggle('hidden', source !== 'upload');
      netflixPanel.classList.toggle('hidden', source !== 'netflix');
      screensharePanel.classList.toggle('hidden', source !== 'screenshare');
      doodlePanel.classList.toggle('hidden', source !== 'doodle');

      // Show/hide player container for netflix or doodle mode
      playerContainer.classList.toggle('hidden', source === 'netflix' || source === 'doodle');

      // Adjust main players visibility when toggling source
      const placeholder = document.getElementById('player-placeholder');
      const ytContainer = document.getElementById('youtube-player');
      const localPlayer = document.getElementById('local-player');
      const screensharePlayer = document.getElementById('screenshare-player');

      if (source !== 'screenshare') {
        screensharePlayer.classList.add('hidden');
        if (source === 'youtube' && getYTPlayer()) {
          ytContainer.classList.remove('hidden');
          placeholder.classList.add('hidden');
        } else if (source === 'upload' && localPlayer.src) {
          localPlayer.classList.remove('hidden');
          placeholder.classList.add('hidden');
        } else {
          placeholder.classList.remove('hidden');
          ytContainer.classList.add('hidden');
          localPlayer.classList.add('hidden');
        }
      } else {
        screensharePlayer.classList.remove('hidden');
        placeholder.classList.add('hidden');
        ytContainer.classList.add('hidden');
        localPlayer.classList.add('hidden');
      }
    });
  });

  // YouTube load
  document.getElementById('btn-load-yt').addEventListener('click', async () => {
    const url = document.getElementById('youtube-url').value;
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      document.getElementById('youtube-url').style.borderColor = '#ff6b6b';
      setTimeout(() => {
        document.getElementById('youtube-url').style.borderColor = '';
      }, 2000);
      return;
    }

    await playYouTubeVideo(videoId);
  });

  // Enter key on YouTube input
  document.getElementById('youtube-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-load-yt').click();
    }
  });

  // File upload
  document.getElementById('file-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('file-name').textContent = file.name;

    // For local preview (works without Firebase Storage)
    const localUrl = URL.createObjectURL(file);
    playLocalVideo(localUrl);

    // Try uploading to Firebase Storage for sync
    try {
      const downloadUrl = await uploadVideoFile(file);
      if (downloadUrl) {
        syncVideoState({
          type: 'upload',
          url: downloadUrl,
          playing: false,
          currentTime: 0
        });
      }
    } catch (err) {
      console.log('Storage upload failed, using local playback:', err);
      // Local playback still works
    }
  });

  // Netflix countdown
  document.getElementById('btn-countdown').addEventListener('click', () => {
    startNetflixCountdown();
  });

  watchNetflixCountdown((data) => {
    if (!data.countdownStart) return;

    const countdownDisplay = document.getElementById('countdown-display');
    const countdownNumber = document.getElementById('countdown-number');
    const countdownMsg = document.getElementById('countdown-msg');
    const countdownBtn = document.getElementById('btn-countdown');

    const title = data.title || 'Something on Netflix';
    const startedBy = data.startedBy === getCurrentUser()?.key ? 'You' : getPartnerName();

    countdownDisplay.classList.remove('hidden');
    countdownBtn.classList.add('hidden');
    countdownMsg.textContent = `${startedBy} started the countdown for "${title}"`;

    let count = 3;
    countdownNumber.textContent = count;

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        countdownNumber.textContent = count;
      } else if (count === 0) {
        countdownNumber.textContent = '▶️';
        countdownMsg.textContent = 'PRESS PLAY NOW! 🎬';
      } else {
        clearInterval(interval);
        setTimeout(() => {
          countdownDisplay.classList.add('hidden');
          countdownBtn.classList.remove('hidden');
          countdownMsg.textContent = `Watching: ${title} 🍿`;
        }, 3000);
      }
    }, 1000);
  });

  // Watch for video sync from partner
  watchVideoState((state) => {
    if (state.type === 'youtube' && state.videoId) {
      // Load YouTube video if different
      document.getElementById('youtube-url').value = `https://youtube.com/watch?v=${state.videoId}`;
      playYouTubeVideo(state.videoId, state.currentTime, state.playing);
    } else if (state.type === 'upload' && state.url) {
      playLocalVideo(state.url, state.currentTime, state.playing);
    }

    // Show "now watching" indicator
    const nowWatching = document.getElementById('now-watching');
    nowWatching.classList.remove('hidden');
    document.getElementById('now-watching-text').textContent = 
      `Watching together with ${getPartnerName()} 💕`;
  });
}

async function playYouTubeVideo(videoId, startTime = 0, shouldPlay = true) {
  const placeholder = document.getElementById('player-placeholder');
  const ytContainer = document.getElementById('youtube-player');
  const localPlayer = document.getElementById('local-player');

  placeholder.classList.add('hidden');
  localPlayer.classList.add('hidden');
  ytContainer.classList.remove('hidden');

  const player = getYTPlayer();
  if (player) {
    player.loadVideoById({ videoId, startSeconds: startTime });
    if (!shouldPlay) {
      setTimeout(() => player.pauseVideo(), 500);
    }
  } else {
    // Initialize new player
    await initYouTubePlayer('youtube-player', (event) => {
      const user = getCurrentUser();
      if (!user) return;

      // Sync state on play/pause
      const ytP = getYTPlayer();
      if (!ytP) return;

      if (event.data === window.YT.PlayerState.PLAYING) {
        syncVideoState({
          type: 'youtube',
          videoId,
          playing: true,
          currentTime: ytP.getCurrentTime()
        });
      } else if (event.data === window.YT.PlayerState.PAUSED) {
        syncVideoState({
          type: 'youtube',
          videoId,
          playing: false,
          currentTime: ytP.getCurrentTime()
        });
      }
    });

    loadYouTubeVideo(videoId);
  }

  // Sync initial state
  syncVideoState({
    type: 'youtube',
    videoId,
    playing: shouldPlay,
    currentTime: startTime
  });

  // Show now watching
  const nowWatching = document.getElementById('now-watching');
  nowWatching.classList.remove('hidden');
}

function playLocalVideo(url, startTime = 0, shouldPlay = true) {
  const placeholder = document.getElementById('player-placeholder');
  const ytContainer = document.getElementById('youtube-player');
  const localPlayer = document.getElementById('local-player');

  placeholder.classList.add('hidden');
  ytContainer.classList.add('hidden');
  localPlayer.classList.remove('hidden');

  localPlayer.src = url;
  localPlayer.currentTime = startTime;

  if (shouldPlay) {
    localPlayer.play().catch(() => {});
  }

  // Sync on play/pause
  localPlayer.onplay = () => {
    syncVideoState({
      type: 'upload',
      url,
      playing: true,
      currentTime: localPlayer.currentTime
    });
  };

  localPlayer.onpause = () => {
    syncVideoState({
      type: 'upload',
      url,
      playing: false,
      currentTime: localPlayer.currentTime
    });
  };

  localPlayer.onseeked = () => {
    syncVideoState({
      type: 'upload',
      url,
      playing: !localPlayer.paused,
      currentTime: localPlayer.currentTime
    });
  };
}

// ─── Screen Sharing UI Controllers ───
let isSharingScreen = false;
let stopIncomingShareListener = null;

function initScreenShareUI() {
  const shareBtn = document.getElementById('btn-toggle-share');
  const shareStatus = document.getElementById('share-status-text');
  const screensharePlayer = document.getElementById('screenshare-player');
  const fullscreenBtn = document.getElementById('btn-player-fullscreen');
  const rotateBtn = document.getElementById('btn-player-rotate');
  const playerContainer = document.getElementById('player-container');

  shareBtn.addEventListener('click', async () => {
    if (isSharingScreen) {
      await stopScreenSharing();
      handleLocalShareStopped();
    } else {
      shareBtn.disabled = true;
      shareBtn.textContent = 'Connecting... 🖥️';
      shareStatus.textContent = 'Requesting screen access...';

      try {
        await startScreenSharing(
          (stream) => {
            isSharingScreen = true;
            screensharePlayer.srcObject = stream;
            screensharePlayer.muted = true;
            activateScreenshareView(true);
            shareBtn.disabled = false;
            shareBtn.textContent = 'Stop Screen Share 🛑';
            shareBtn.classList.add('sharing');
            shareStatus.textContent = 'Sharing screen in real-time...';
          },
          null,
          (state) => {
            console.log('WebRTC Connection state:', state);
            if (state === 'connected') {
              shareStatus.textContent = 'Connected with partner! 💚';
            } else if (state === 'disconnected' || state === 'failed') {
              shareStatus.textContent = 'Connection lost. Recalibrating...';
            }
          }
        );
      } catch (err) {
        console.error('Screen sharing failed to start:', err);
        handleLocalShareStopped();
      }
    }
  });

  function handleLocalShareStopped() {
    isSharingScreen = false;
    screensharePlayer.srcObject = null;
    shareBtn.disabled = false;
    shareBtn.textContent = 'Start Screen Share 🖥️';
    shareBtn.classList.remove('sharing');
    shareStatus.textContent = 'Ready to share';
    resetToDefaultPlayerView();
  }

  stopIncomingShareListener = listenForIncomingShare(
    (stream, senderName) => {
      screensharePlayer.srcObject = stream;
      screensharePlayer.muted = false;
      activateScreenshareView(false, senderName);
      shareStatus.textContent = `${senderName} is sharing their screen 🖥️`;
      shareBtn.classList.add('hidden');
    },
    () => {
      screensharePlayer.srcObject = null;
      shareStatus.textContent = 'Ready to share';
      shareBtn.classList.remove('hidden');
      resetToDefaultPlayerView();
    }
  );

  // Overlay Controls Handlers
  fullscreenBtn.addEventListener('click', togglePlayerFullscreen);
  rotateBtn.addEventListener('click', togglePlayerRotation);

  const syncFullscreenState = () => {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    playerContainer.classList.toggle('is-fullscreen', isFs);
    fullscreenBtn.innerHTML = isFs ? 'Exit 🚪' : '⛶ Fullscreen';
    if (!isFs) {
      screensharePlayer.classList.remove('rotated-90');
      rotateBtn.innerHTML = '🔄 Flip';
    }
  };

  document.addEventListener('fullscreenchange', syncFullscreenState);
  document.addEventListener('webkitfullscreenchange', syncFullscreenState);
}

function togglePlayerFullscreen() {
  const playerContainer = document.getElementById('player-container');
  const screensharePlayer = document.getElementById('screenshare-player');

  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (playerContainer.requestFullscreen) {
      playerContainer.requestFullscreen();
    } else if (playerContainer.webkitRequestFullscreen) {
      playerContainer.webkitRequestFullscreen();
    } else if (screensharePlayer.webkitEnterFullscreen) {
      screensharePlayer.webkitEnterFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

function togglePlayerRotation() {
  const playerContainer = document.getElementById('player-container');
  const screensharePlayer = document.getElementById('screenshare-player');
  const rotateBtn = document.getElementById('btn-player-rotate');

  // Go fullscreen automatically when flipping for maximum size
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (playerContainer.requestFullscreen) {
      playerContainer.requestFullscreen();
    } else if (playerContainer.webkitRequestFullscreen) {
      playerContainer.webkitRequestFullscreen();
    }
  }

  const isRotated = screensharePlayer.classList.toggle('rotated-90');
  rotateBtn.innerHTML = isRotated ? '🔄 Normal' : '🔄 Flip';
}

function activateScreenshareView(isLocalShare, partnerName) {
  const placeholder = document.getElementById('player-placeholder');
  const ytContainer = document.getElementById('youtube-player');
  const localPlayer = document.getElementById('local-player');
  const screensharePlayer = document.getElementById('screenshare-player');

  placeholder.classList.add('hidden');
  ytContainer.classList.add('hidden');
  localPlayer.classList.add('hidden');
  screensharePlayer.classList.remove('hidden');

  const sourceBtns = document.querySelectorAll('.source-btn');
  sourceBtns.forEach(b => b.classList.remove('active'));
  document.getElementById('src-screenshare').classList.add('active');

  document.getElementById('youtube-input-bar').classList.add('hidden');
  document.getElementById('upload-input-bar').classList.add('hidden');
  document.getElementById('netflix-panel').classList.add('hidden');
  document.getElementById('screenshare-panel').classList.remove('hidden');
  document.getElementById('player-overlay-controls').classList.remove('hidden');

  const nowWatching = document.getElementById('now-watching');
  nowWatching.classList.remove('hidden');
  document.getElementById('now-watching-text').textContent = 
    isLocalShare ? 'You are sharing your screen 🖥️' : `${partnerName} is sharing screen 🖥️`;
}

function resetToDefaultPlayerView() {
  const placeholder = document.getElementById('player-placeholder');
  const ytContainer = document.getElementById('youtube-player');
  const localPlayer = document.getElementById('local-player');
  const screensharePlayer = document.getElementById('screenshare-player');

  screensharePlayer.classList.add('hidden');
  
  const activeBtn = document.querySelector('.source-btn.active');
  const source = activeBtn ? activeBtn.dataset.source : 'youtube';

  placeholder.classList.toggle('hidden', source !== 'youtube' && source !== 'upload');
  
  document.getElementById('youtube-input-bar').classList.toggle('hidden', source !== 'youtube');
  document.getElementById('upload-input-bar').classList.toggle('hidden', source !== 'upload');
  document.getElementById('netflix-panel').classList.toggle('hidden', source !== 'netflix');
  document.getElementById('screenshare-panel').classList.toggle('hidden', source !== 'screenshare');
  document.getElementById('player-overlay-controls').classList.add('hidden');

  const nowWatching = document.getElementById('now-watching');
  nowWatching.classList.add('hidden');
}

// ─── Voice Playback Helper ───
function handleVoicePlayback(id, url, btn) {
  if (activeAudioId === id && activeAudio) {
    if (activeAudio.paused) {
      activeAudio.play();
      btn.textContent = '⏸️';
    } else {
      activeAudio.pause();
      btn.textContent = '▶️';
    }
    return;
  }

  if (activeAudio) {
    activeAudio.pause();
    const oldBtn = document.querySelector(`.voice-play-btn[data-id="${activeAudioId}"]`);
    if (oldBtn) oldBtn.textContent = '▶️';
  }

  activeAudio = new Audio(url);
  activeAudioId = id;
  btn.textContent = '⏸️';

  activeAudio.play();

  activeAudio.ontimeupdate = () => {
    const progressFill = document.getElementById(`progress-fill-${id}`);
    const durationEl = document.getElementById(`voice-duration-${id}`);
    if (progressFill && durationEl) {
      const percent = (activeAudio.currentTime / activeAudio.duration) * 100 || 0;
      progressFill.style.width = `${percent}%`;
      durationEl.textContent = `${formatAudioTime(activeAudio.currentTime)} / ${formatAudioTime(activeAudio.duration || 0)}`;
    }
  };

  activeAudio.onloadedmetadata = () => {
    const durationEl = document.getElementById(`voice-duration-${id}`);
    if (durationEl) {
      durationEl.textContent = `0:00 / ${formatAudioTime(activeAudio.duration)}`;
    }
  };

  activeAudio.onended = () => {
    btn.textContent = '▶️';
    const progressFill = document.getElementById(`progress-fill-${id}`);
    const durationEl = document.getElementById(`voice-duration-${id}`);
    if (progressFill) progressFill.style.width = '0%';
    if (durationEl) durationEl.textContent = '0:00';
    activeAudio = null;
    activeAudioId = null;
  };
}

function formatAudioTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// ─── Doodle Game UI ───
function initDoodleGameUI() {
  const canvas = document.getElementById('doodle-canvas');
  if (!canvas) return () => {};
  const ctx = canvas.getContext('2d');

  const placeholderOverlay = document.getElementById('canvas-placeholder-overlay');
  const celebrationOverlay = document.getElementById('canvas-celebration-overlay');
  const drawerToolbar = document.getElementById('doodle-drawer-toolbar');
  const guesserToolbar = document.getElementById('doodle-guesser-toolbar');
  const statusText = document.getElementById('doodle-status-text');
  const scoreAdam = document.getElementById('score-adam');
  const scoreLina = document.getElementById('score-lina');
  const guessInput = document.getElementById('doodle-guess-input');
  const submitGuessBtn = document.getElementById('btn-submit-guess');
  const nextRoundBtn = document.getElementById('btn-next-round');
  const resetScoresBtn = document.getElementById('btn-reset-scores');
  const sendDrawingBtn = document.getElementById('btn-send-drawing');
  const clearCanvasBtn = document.getElementById('btn-tool-clear');
  const eraserBtn = document.getElementById('btn-tool-eraser');
  const correctWordReveal = document.getElementById('correct-word-reveal');
  const guessFeedback = document.getElementById('guess-feedback');

  const user = getCurrentUser();
  if (!user) return () => {};

  let localGameState = null;
  let brushSettings = { color: '#ffb3ba', width: 4, isEraser: false };
  let drawingCleanup = null;
  let strokesCleanup = null;
  let currentStrokesList = [];
  let canDraw = false;

  // Clear guess feedback
  if (guessFeedback) guessFeedback.textContent = '';

  // Get active brush settings for canvas drawing
  function getDrawingSettings() {
    return { ...brushSettings, canDraw };
  }

  // Handle local drawing completion
  async function onStrokeComplete(strokeData) {
    if (!localGameState || localGameState.drawer !== user.key || localGameState.status !== 'drawing') {
      return;
    }
    // Push completed stroke to DB
    await pushStrokeToDb(strokeData, localGameState.version);
  }

  // Bind color pickers
  const colorBtns = document.querySelectorAll('.color-btn');
  colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      colorBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      brushSettings.color = btn.dataset.color;
      brushSettings.isEraser = false;
      if (eraserBtn) eraserBtn.classList.remove('active');
    });
  });

  // Bind size buttons
  const sizeBtns = document.querySelectorAll('.size-btn');
  sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sizeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      brushSettings.width = parseInt(btn.dataset.size);
    });
  });

  // Bind eraser toggle
  if (eraserBtn) {
    eraserBtn.addEventListener('click', () => {
      brushSettings.isEraser = !brushSettings.isEraser;
      eraserBtn.classList.toggle('active', brushSettings.isEraser);
    });
  }

  // Bind clear canvas button
  if (clearCanvasBtn) {
    clearCanvasBtn.addEventListener('click', async () => {
      if (!localGameState || localGameState.drawer !== user.key || localGameState.status !== 'drawing') {
        return;
      }
      // Clear locally
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Clear in Firestore
      await clearStrokesInDb(localGameState.version);
    });
  }

  // Bind send drawing button
  if (sendDrawingBtn) {
    sendDrawingBtn.addEventListener('click', async () => {
      if (!localGameState || localGameState.drawer !== user.key || localGameState.status !== 'drawing') {
        return;
      }
      await submitDrawing();
    });
  }

  // Bind guess submission
  if (submitGuessBtn) {
    submitGuessBtn.addEventListener('click', () => doSubmitGuess());
  }
  if (guessInput) {
    guessInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSubmitGuess();
      }
    });
  }

  async function doSubmitGuess() {
    if (!localGameState || localGameState.guesser !== user.key || localGameState.status !== 'guessing') {
      return;
    }
    const guess = guessInput.value;
    if (!guess.trim()) return;

    guessInput.value = '';
    const isCorrect = await submitGuess(guess, localGameState);
    if (!isCorrect) {
      if (guessFeedback) guessFeedback.textContent = 'Nope! Try again ✨';
      setTimeout(() => {
        if (guessFeedback) guessFeedback.textContent = '';
      }, 3000);
      
      // Wobble input field for visual feedback
      if (guessInput) {
        guessInput.style.borderColor = '#ff4757';
        guessInput.style.animation = 'none';
        void guessInput.offsetWidth; // trigger reflow
        guessInput.style.animation = 'peek 0.3s ease 2';
        setTimeout(() => {
          guessInput.style.borderColor = '';
          guessInput.style.animation = '';
        }, 1000);
      }
    }
  }

  // Bind next round button
  if (nextRoundBtn) {
    nextRoundBtn.addEventListener('click', async () => {
      await startNewGameRound(localGameState);
    });
  }

  // Bind reset scores button
  if (resetScoresBtn) {
    resetScoresBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to reset the game and scores? 🔄')) {
        await resetWholeGame();
      }
    });
  }

  // Resize canvas display resolution dynamically on window resize or tab display
  function resizeCanvasResolution() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      
      if (currentStrokesList) {
        drawStrokes(canvas, currentStrokesList);
      }
    }
  }
  
  // Watch resize
  const resizeObserver = new ResizeObserver(() => {
    resizeCanvasResolution();
  });
  resizeObserver.observe(canvas);

  // Initialize Canvas events
  drawingCleanup = initCanvasDrawing(canvas, getDrawingSettings, onStrokeComplete);

  // Initialize Game State
  const gameCleanup = initDoodleGame((state) => {
    const stateChanged = !localGameState || localGameState.version !== state.version || localGameState.status !== state.status;
    localGameState = state;

    // Render scores
    if (scoreAdam) scoreAdam.textContent = state.score?.adam || 0;
    if (scoreLina) scoreLina.textContent = state.score?.lina || 0;

    // Update canvas drawing permission
    canDraw = (state.drawer === user.key && state.status === 'drawing');

    // Clear guess feedback on any state change
    if (guessFeedback) guessFeedback.textContent = '';

    const isDrawer = state.drawer === user.key;
    const partnerName = getPartnerName();

    // Toggle toolbars
    if (drawerToolbar) drawerToolbar.classList.toggle('hidden', !isDrawer || state.status !== 'drawing');
    if (guesserToolbar) guesserToolbar.classList.toggle('hidden', isDrawer || state.status !== 'guessing');

    // Toggle overlays
    if (placeholderOverlay) {
      placeholderOverlay.classList.toggle('hidden', isDrawer || state.status !== 'drawing');
    }
    const overlayText = document.getElementById('placeholder-overlay-text');
    if (overlayText && !isDrawer && state.status === 'drawing') {
      overlayText.textContent = `${partnerName} is drawing something beautiful... 🎨`;
    }

    if (celebrationOverlay) {
      celebrationOverlay.classList.toggle('hidden', state.status !== 'correct' && state.status !== 'failed');
      const celebrationTitle = celebrationOverlay.querySelector('h2');
      if (celebrationTitle) {
        if (state.status === 'correct') {
          celebrationTitle.textContent = "Correct! 🎉";
          celebrationTitle.style.color = "";
        } else if (state.status === 'failed') {
          celebrationTitle.textContent = "Out of Guesses! 😢";
          celebrationTitle.style.color = "#ff4757";
        }
      }
    }
    if (correctWordReveal && (state.status === 'correct' || state.status === 'failed')) {
      correctWordReveal.textContent = state.word.toUpperCase();
    }

    // Update status banner message
    if (statusText) {
      if (state.status === 'drawing') {
        if (isDrawer) {
          statusText.innerHTML = `Your Turn to Draw! Secret Word: <strong style="color: #fbbf24; font-size: 1.1rem; text-transform: uppercase;">${state.word}</strong> 🎨`;
        } else {
          statusText.textContent = `${partnerName} is drawing... 🖌️`;
        }
      } else if (state.status === 'guessing') {
        if (isDrawer) {
          const wrongCount = state.wrongGuesses || 0;
          statusText.textContent = `Waiting for ${partnerName} to guess... 🤔 (${wrongCount}/2 wrong)`;
        } else {
          const remaining = 2 - (state.wrongGuesses || 0);
          statusText.innerHTML = `Time to Guess! What did ${partnerName} draw? 🧐 <span style="color: #ffb3ba; font-size: 0.85rem;">(${remaining} ${remaining === 1 ? 'guess' : 'guesses'} left!)</span>`;
        }
      } else if (state.status === 'correct') {
        statusText.textContent = `Correct guess! 🎉 Roles swapping next...`;
      } else if (state.status === 'failed') {
        statusText.textContent = `No guesses left! 😢 Roles swapping next...`;
      }
    }

    // If version changed, or if it is the first load, subscribe to new version strokes
    if (stateChanged) {
      if (strokesCleanup) {
        strokesCleanup();
      }
      
      // Clear canvas locally first
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      currentStrokesList = [];
      
      strokesCleanup = syncIncomingStrokes(state.version, (strokes) => {
        currentStrokesList = strokes;
        drawStrokes(canvas, strokes);
      });
    }
  });

  return () => {
    if (drawingCleanup) drawingCleanup();
    if (strokesCleanup) strokesCleanup();
    if (gameCleanup) gameCleanup();
    resizeObserver.disconnect();
  };
}

// ─── Heart Burst UI & Real-Time Sync ───
function initHeartBurstUI() {
  const heartBtn = document.getElementById('btn-heart-burst');
  if (!heartBtn) return () => {};
  const user = getCurrentUser();
  if (!user) return () => {};

  // Click handler
  heartBtn.addEventListener('click', async () => {
    // Throttle clicks locally to prevent spam
    heartBtn.disabled = true;
    heartBtn.style.opacity = '0.5';
    setTimeout(() => {
      heartBtn.disabled = false;
      heartBtn.style.opacity = '';
    }, 2000);

    try {
      await setDoc(doc(db, 'interactions', 'burst'), {
        timestamp: Date.now(),
        triggeredBy: user.key
      }, { merge: true });
    } catch (err) {
      console.error('Error triggering heart burst:', err);
    }
  });

  // Real-time listener
  let lastBurstTime = null;
  const unsubscribe = onSnapshot(doc(db, 'interactions', 'burst'), (snap) => {
    const data = snap.data();
    if (data && data.timestamp) {
      if (lastBurstTime && data.timestamp !== lastBurstTime) {
        triggerHeartBurstAnimation();
      }
      lastBurstTime = data.timestamp;
    }
  });

  return unsubscribe;
}

// Float & fade floating hearts animation in DOM
function triggerHeartBurstAnimation() {
  const container = document.body;
  const colors = ['💖', '💝', '💕', '💗', '💓', '❤️'];
  
  // Launch 25 floating hearts
  for (let i = 0; i < 25; i++) {
    setTimeout(() => {
      const heart = document.createElement('div');
      heart.className = 'floating-heart';
      heart.textContent = colors[Math.floor(Math.random() * colors.length)];
      
      // Random horizontal starting position (0% to 100% of window width)
      const startX = Math.random() * window.innerWidth;
      // Random end position offset (-150px to +150px)
      const endX = startX + (Math.random() * 300 - 150);
      // Random rotation
      const rot = Math.random() * 90 - 45;
      
      heart.style.left = `${startX}px`;
      heart.style.setProperty('--start-x', '0px');
      heart.style.setProperty('--end-x', `${endX - startX}px`);
      heart.style.setProperty('--rot', `${rot}deg`);
      
      // Random animation duration
      const duration = 2 + Math.random() * 1.5;
      heart.style.animationDuration = `${duration}s`;
      
      container.appendChild(heart);
      
      // Remove after animation finishes
      setTimeout(() => {
        heart.remove();
      }, duration * 1000);
    }, i * 60); // stagger launch slightly for cascading waterfall effect
  }
}

// ─── Initialize App ───
document.addEventListener('DOMContentLoaded', () => {
  createParticles();
  initLogin();
  initLoginTaglines();
});
