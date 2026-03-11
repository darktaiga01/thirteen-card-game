const socket = io();
let myName = '';
let currentRoom = null;

const AVATAR_COLORS = ['#7c6af7', '#f7a76a', '#5bbfb5', '#f7e06a', '#e85b7a', '#5b9ef7'];

function getEl(id) { return document.getElementById(id); }
function show(id) { getEl(id).classList.remove('hidden'); }
function hide(id) { getEl(id).classList.add('hidden'); }
function showOnly(id) {
  ['screen-name', 'screen-create', 'screen-join', 'screen-lobby'].forEach(s => {
    s === id ? show(s) : hide(s);
  });
}

// ─── Persistent State (survives refresh) ──────────────────────────────────────
function saveState() {
  localStorage.setItem('tl_state', JSON.stringify({
    name: myName,
    roomCode: currentRoom ? currentRoom.code : null,
  }));
}
function clearState() {
  localStorage.removeItem('tl_state');
  localStorage.removeItem('tl_room');
}
function loadState() { try { return JSON.parse(localStorage.getItem('tl_state')); } catch { return null; } }

// ─── Auto-Reconnect on Page Load ──────────────────────────────────────────────
(function autoReconnect() {
  // Check if we were in a game (game.html redirect data)
  const gameData = localStorage.getItem('tl_room');
  if (gameData) {
    try {
      const data = JSON.parse(gameData);
      if (data.code && data.name) {
        // Try to rejoin the game directly
        window.location.href = '/game.html';
        return;
      }
    } catch { }
  }

  // Check if we were in a lobby
  const saved = loadState();
  if (saved && saved.name && saved.roomCode) {
    myName = saved.name;
    getEl('player-name').value = myName;
    // Try to rejoin room
    socket.emit('rejoin-room', { code: saved.roomCode, name: saved.name }, (res) => {
      if (res.ok) {
        currentRoom = res.room;
        renderLobby(res.room, res.room.hostId === socket.id);
        showOnly('screen-lobby');
      } else {
        // Room gone — clear state, show name screen
        clearState();
      }
    });
  } else if (saved && saved.name) {
    myName = saved.name;
    getEl('player-name').value = myName;
  }

  // Check URL for ?room=CODE
  const params = new URLSearchParams(window.location.search);
  const roomQuery = params.get('room');
  if (roomQuery && roomQuery.length === 4) {
    showOnly('screen-name');

    // Auto-fill the hidden join input
    getEl('room-code-input').value = roomQuery.toUpperCase();

    // If they already have a name saved, just inject them into the join screen immediately
    if (myName) {
      setTimeout(() => {
        showOnly('screen-join');
      }, 100);
    }

    // Clean up URL visually
    window.history.replaceState({}, document.title, '/');
  }

})();

// ─── Navigation ───────────────────────────────────────────────────────────────
getEl('btn-create').onclick = () => {
  myName = getEl('player-name').value.trim();
  if (!myName) { shakeInput('player-name'); return; }
  showOnly('screen-create');
};

getEl('btn-join-show').onclick = () => {
  myName = getEl('player-name').value.trim();
  if (!myName) { shakeInput('player-name'); return; }
  showOnly('screen-join');
};

getEl('btn-back-create').onclick = () => showOnly('screen-name');
getEl('btn-back-join').onclick = () => showOnly('screen-name');

getEl('player-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') getEl('btn-create').click();
});

getEl('room-code-input').addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});
getEl('room-code-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') getEl('btn-join-confirm').click();
});

// ─── Create Room ──────────────────────────────────────────────────────────────
getEl('btn-create-confirm').onclick = () => {
  const startingChips = parseInt(getEl('starting-chips').value) || 10000;
  const anteAmount = parseInt(getEl('ante-amount').value) || 100;

  socket.emit('create-room', { name: myName, startingChips, anteAmount }, (res) => {
    if (res.error) { alert(res.error); return; }
    currentRoom = res.room;
    saveState();
    renderLobby(res.room, true);
    showOnly('screen-lobby');
  });
};

// ─── Join Room ────────────────────────────────────────────────────────────────
getEl('btn-join-confirm').onclick = () => {
  const code = getEl('room-code-input').value.trim().toUpperCase();
  if (code.length !== 4) { shakeInput('room-code-input'); return; }

  socket.emit('join-room', { code, name: myName }, (res) => {
    if (res.error) { alert(res.error); return; }
    currentRoom = res.room;
    saveState();
    renderLobby(res.room, false);
    showOnly('screen-lobby');
  });
};

// ─── Start Game ───────────────────────────────────────────────────────────────
getEl('btn-start').onclick = () => {
  socket.emit('start-game', { code: currentRoom.code }, (res) => {
    if (res && res.error) alert(res.error);
  });
};

getEl('btn-add-bot').onclick = () => {
  socket.emit('add-bot', { code: currentRoom.code }, (res) => {
    if (res && res.error) alert(res.error);
  });
};

getEl('btn-remove-bot').onclick = () => {
  socket.emit('remove-bot', { code: currentRoom.code }, (res) => {
    if (res && res.error) alert(res.error);
  });
};

getEl('btn-leave-lobby').onclick = () => {
  if (!currentRoom) return;
  socket.emit('leave-room', { code: currentRoom.code });
  clearState();
  currentRoom = null;
  getEl('player-name').value = myName;
  showOnly('screen-name');
  showOnly('screen-name');
};

getEl('btn-copy-url').onclick = async () => {
  const url = `${window.location.protocol}//${window.location.hostname}:${window.location.port}/?room=${currentRoom.code}`;
  try {
    await navigator.clipboard.writeText(url);
    const btn = getEl('btn-copy-url');
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy Link'; }, 2000);
  } catch (err) {
    console.error('Failed to copy', err);
  }
};

// ─── Server Events ────────────────────────────────────────────────────────────
socket.on('room-update', (room) => {
  currentRoom = room;
  saveState();
  renderLobby(room, room.hostId === socket.id);
});

socket.on('game-started', (data) => {
  localStorage.setItem('tl_room', JSON.stringify({
    code: data.room.code,
    myId: data.myId,
    name: myName,
    hand: data.hand,
  }));
  window.location.href = '/game.html';
});

// ─── Lobby Render ─────────────────────────────────────────────────────────────
function renderLobby(room, isHost) {
  getEl('room-code-display').textContent = room.code;
  getEl('lobby-ante').textContent = room.anteAmount.toLocaleString();
  getEl('lobby-chips').textContent = room.startingChips.toLocaleString();

  // LAN URL
  getEl('lan-url').textContent = `http://${window.location.hostname}:${window.location.port}`;

  // Host badge
  if (isHost) { show('host-badge'); } else { hide('host-badge'); }

  // Host controls
  if (isHost && room.players.length >= 2) {
    show('btn-start');
    hide('waiting-msg');
  } else if (isHost) {
    hide('btn-start');
    show('waiting-msg');
    getEl('waiting-msg').textContent = `Waiting for players… (${room.players.length}/4)`;
  } else {
    hide('btn-start');
    show('waiting-msg');
    getEl('waiting-msg').textContent = 'Waiting for host to start…';
  }

  // Bot controls – show entire host-controls row only to the host
  if (isHost) {
    show('host-controls');
    // Disable Add Bot if room is full
    getEl('btn-add-bot').disabled = room.players.length >= 4;
    // Disable Remove Bot if no bots in room
    const hasBots = room.players.some(p => p.isBot);
    getEl('btn-remove-bot').disabled = !hasBots;
  } else {
    hide('host-controls');
  }

  // Players
  const list = getEl('player-list');
  list.innerHTML = '';
  room.players.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'player-item';
    const initials = p.isBot ? '🤖' : p.name.slice(0, 2).toUpperCase();
    item.innerHTML = `
      <div class="player-avatar" style="background:${AVATAR_COLORS[i % AVATAR_COLORS.length]}">${initials}</div>
      <div class="player-info">
        <div class="player-name">${escapeHtml(p.name)}</div>
        <div class="player-chips">💰 ${p.chips.toLocaleString()} chips</div>
      </div>
      ${p.id === room.hostId ? '<div class="player-host-tag">HOST</div>' : ''}
      ${p.isBot ? '<div class="player-host-tag" style="border-color:rgba(124,106,247,0.3);color:#7c6af7">BOT</div>' : ''}
    `;
    list.appendChild(item);
  });
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function shakeInput(id) {
  const el = getEl(id);
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'shake 0.4s ease';
  el.focus();
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─── Fullscreen toggle ────────────────────────────────────────────────────────
(function () {
  const btn = document.getElementById('btn-lobby-fullscreen');
  if (!btn) return;

  function updateIcon() {
    const isFs = !!document.fullscreenElement;
    btn.textContent = isFs ? '⊡' : '⛶';
    btn.title = isFs ? 'Exit Fullscreen' : 'Fullscreen';
    btn.classList.toggle('fs-active', isFs);
  }

  if (!document.documentElement.requestFullscreen) {
    btn.style.display = 'none';
    return;
  }

  btn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  document.addEventListener('fullscreenchange', updateIcon);
})();
