// Emoji data and picker for Adam & Lina's Space

export const EMOJIS = [
  '😊', '😂', '🥰', '😍', '😘', '💕', '❤️', '💖',
  '🥺', '😢', '😭', '🤣', '😅', '😇', '🤩', '🥳',
  '😎', '🤔', '🙄', '😏', '😌', '😴', '🤗', '🫶',
  '👀', '🙈', '🙉', '🙊', '💀', '👻', '🎬', '🍿',
  '🎥', '📺', '🎶', '🎵', '🌙', '⭐', '✨', '🌟',
  '🔥', '💫', '🦋', '🌸', '🌺', '🌹', '💐', '🌻',
  '☕', '🧋', '🍕', '🍫', '🍰', '🧁', '🍪', '🎂',
  '👍', '👎', '👏', '🙌', '🤝', '💪', '✌️', '🤞',
  '💯', '💝', '💗', '💓', '💞', '💘', '💌', '🫂',
  '🎉', '🎊', '🎈', '🎁', '🏠', '🛋️', '🧸', '🕯️'
];

export function createEmojiPicker(container, onSelect) {
  container.innerHTML = '';
  EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn';
    btn.textContent = emoji;
    btn.type = 'button';
    btn.addEventListener('click', () => onSelect(emoji));
    container.appendChild(btn);
  });
}
