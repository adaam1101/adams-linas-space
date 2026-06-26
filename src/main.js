// Main application — Adam & Lina's Space
import './style.css';
import { login, logout, getCurrentUser, watchPartnerPresence, getPartnerName } from './auth.js';
import { initChat, sendMessage, setTyping, destroyChat, formatTime, toggleReaction } from './chat.js';
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

  // Initialize screen sharing
  initScreenShareUI();

  // Load YouTube API
  loadYouTubeAPI().then(() => {
    console.log('YouTube API ready');
  });

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

    div.innerHTML = `
      <div class="message-content-container">
        <div class="message-bubble">
          ${escapeHtml(msg.text)}
          ${reactionsHtml}
        </div>
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
      document.getElementById('screenshare-panel').classList.toggle('hidden', source !== 'screenshare');

      // Show/hide player container for netflix mode
      const playerContainer = document.getElementById('player-container');
      playerContainer.classList.toggle('hidden', source === 'netflix');

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

// ─── Initialize App ───
document.addEventListener('DOMContentLoaded', () => {
  createParticles();
  initLogin();
});
