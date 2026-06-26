// Main application — Adam & Lina's Space
import './style.css';
import { login, logout, getCurrentUser, watchPartnerPresence, getPartnerName } from './auth.js';
import { initChat, sendMessage, setTyping, destroyChat, formatTime } from './chat.js';
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

// ─── Particles Background ───
function createParticles() {
  const container = document.getElementById('particles-bg');
  const colors = ['rgba(124,106,255,0.3)', 'rgba(255,107,157,0.3)', 'rgba(251,191,36,0.2)'];

  for (let i = 0; i < 30; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    const size = Math.random() * 6 + 2;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.background = colors[Math.floor(Math.random() * colors.length)];
    particle.style.animationDuration = `${Math.random() * 15 + 10}s`;
    particle.style.animationDelay = `${Math.random() * 10}s`;
    container.appendChild(particle);
  }
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

  // Load YouTube API
  loadYouTubeAPI().then(() => {
    console.log('YouTube API ready');
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    destroyChat();
    destroyPlayer();
    await logout();
    document.body.className = '';
    showScreen('login-screen');
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
  const user = getCurrentUser();

  // Emoji picker
  createEmojiPicker(emojiGrid, (emoji) => {
    chatInput.value += emoji;
    chatInput.focus();
    emojiPicker.classList.add('hidden');
  });

  emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
      emojiPicker.classList.add('hidden');
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
    await sendMessage(text);
  });

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

    div.innerHTML = `
      <div class="message-bubble">${escapeHtml(msg.text)}</div>
      <div class="message-meta">
        <span class="message-sender">${msg.senderName}</span>
        <span class="message-time">${formatTime(msg.createdAt)}</span>
      </div>
    `;
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

  sourceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sourceBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const source = btn.dataset.source;
      setCurrentSource(source);

      youtubeBar.classList.toggle('hidden', source !== 'youtube');
      uploadBar.classList.toggle('hidden', source !== 'upload');
      netflixPanel.classList.toggle('hidden', source !== 'netflix');

      // Show/hide player container for netflix mode
      const playerContainer = document.getElementById('player-container');
      playerContainer.classList.toggle('hidden', source === 'netflix');
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

// ─── Initialize App ───
document.addEventListener('DOMContentLoaded', () => {
  createParticles();
  initLogin();
});
