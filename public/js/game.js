const socket = io();

// ─── State ────────────────────────────────────────────────────────────────────
let myId = null;
let myHand = [];
let selectedIds = new Set();
let gameState = null;
let roomData = null;
let myCode = '';
let timerInterval = null;
let myComboStreak = 0;
let lastMemeTime = 0;
let suggestionIndex = 0;
let lastTableKey = null;
let lastGhostKey = null;
let lastLogLength = 0;
let logPanelOpen = false;
let isSpectator = false;       // true when watching a game as spectator
let lastRoundOverData = null;  // stored so we can re-render overlay on room-update
let currentOverlayType = null; // 'round-over' | 'game-over' | null
let gameOverCountdown = null;  // interval id for game-over auto-redirect countdown

const SUITS = ['S', 'C', 'D', 'H'];
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUIT_SYM = { S: '♠', C: '♣', D: '♦', H: '♥' };
const AVATAR_COLORS = ['#7c6af7', '#f7a76a', '#5bbfb5', '#f7e06a', '#e85b7a', '#5b9ef7'];
const FINISH_MEDALS = ['🥇', '🥈', '🥉', '💀'];

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  const saved = localStorage.getItem('tl_room');
  if (!saved) { window.location.href = '/'; return; }
  const data = JSON.parse(saved);
  myCode = data.code;
  const myName = data.name;

  getEl('hud-code').textContent = myCode;
  setStatus('Waiting for game state…'); // Set this BEFORE emitting

  getEl('btn-leave-game').onclick = leaveGame;

  getEl('btn-copy-game').onclick = async () => {
    const url = `${window.location.protocol}//${window.location.hostname}:${window.location.port}/?room=${myCode}`;
    try {
      await navigator.clipboard.writeText(url);
      const btn = getEl('btn-copy-game');
      const originalText = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = originalText; }, 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  // Also allow clicking the room code itself as a fast shortcut
  getEl('hud-code').onclick = getEl('btn-copy-game').onclick;

  // Phase 3: Wire Meme Buttons
  document.querySelectorAll('.meme-btn').forEach(btn => {
    btn.onclick = () => {
      const now = Date.now();
      if (now - lastMemeTime < 2000) {
        showToast('Wait a moment before memeing again! ⏱️', '');
        return;
      }
      lastMemeTime = now;
      const meme = btn.dataset.meme;
      socket.emit('meme', { code: myCode, meme });

      // Visual feedback on button
      const oldStyle = btn.style.transform;
      btn.style.transform = 'scale(0.9)';
      setTimeout(() => btn.style.transform = oldStyle, 100);
    };
  });

  // Keyboard bindings
  // Re-register with server (socket ID changed after page navigation/refresh)
  socket.emit('rejoin-game', { code: myCode, name: myName }, (res) => {
    if (res.error) {
      console.error('Rejoin failed:', res.error);
      setStatus('Connection error — returning to lobby…');
      localStorage.removeItem('tl_room');
      setTimeout(() => { window.location.href = '/'; }, 1500);
      return;
    }
    myId = socket.id;
    myHand = res.hand || [];
    isSpectator = !!res.spectator;
    roomData = res.room;

    localStorage.setItem('tl_room', JSON.stringify({ ...data, myId: myId, hand: myHand }));

    renderHand();
    updateActionButtons();

    if (isSpectator) setStatus('👁 Spectating — you\'ll join next round');

    if (gameState) {
      renderGameState();
    }
  });
}

// ─── Socket Events ────────────────────────────────────────────────────────────
socket.on('game-state', (state) => {
  gameState = state;
  roomData = state.room;
  suggestionIndex = 0;
  renderGameState();
});

socket.on('hand-update', ({ hand }) => {
  myHand = hand;
  selectedIds.clear();
  suggestionIndex = 0;
  renderHand();
  updateActionButtons();
});

socket.on('game-started', (data) => {
  myHand = data.hand || [];
  isSpectator = !!data.spectator;
  selectedIds.clear();
  lastTableKey = null;
  lastGhostKey = null;
  lastLogLength = 0;
  currentOverlayType = null;
  lastRoundOverData = null;
  if (gameOverCountdown) { clearInterval(gameOverCountdown); gameOverCountdown = null; }
  hideOverlay();
  getEl('log-entries').innerHTML = '';
  updateLogBadge(0);

  const saved = localStorage.getItem('tl_room');
  if (saved) {
    const parsed = JSON.parse(saved);
    parsed.hand = myHand;
    localStorage.setItem('tl_room', JSON.stringify(parsed));
  }

  renderHand();
  updateActionButtons();

  if (isSpectator) setStatus('👁 Spectating — you\'ll join next round');
});

socket.on('room-update', (room) => {
  const prevCount = roomData ? roomData.players.length : 0;
  roomData = room;

  // If a new player joined, show a toast
  if (room.players.length > prevCount) {
    const newest = room.players[room.players.length - 1];
    showToast(`${newest.name} joined the room`, '');
  }

  // Refresh round-over overlay to reflect updated player list / add-bot button state
  if (currentOverlayType === 'round-over' && lastRoundOverData && !getEl('overlay').classList.contains('hidden')) {
    showRoundOver(lastRoundOverData);
  }
});

socket.on('toast', ({ msg, type }) => {
  if (window.FX) window.FX.showToastFX(msg, type);
  else showToast(msg, type); // fallback
});

// Phase 3: Receive Meme Reaction
socket.on('meme', ({ from, fromId, meme }) => {
  const layer = getEl('reaction-layer');
  if (!layer) return;

  const emojiMap = {
    'chop': '🔪 Bị chặt',
    'fire': '🔥 On fire',
    'gg': '👑 GG',
    'luck': '🍀 Hên thôi',
    'rip': '💀 RIP'
  };

  const el = document.createElement('div');
  el.className = 'reaction-float';
  el.textContent = `${from}: ${emojiMap[meme] || meme}`;

  // Randomize floating start position slightly (bottom-ish center)
  const leftPos = 20 + Math.random() * 60;
  el.style.left = `${leftPos}%`;
  el.style.bottom = '120px';

  layer.appendChild(el);
  setTimeout(() => el.remove(), 2500);
});

socket.on('round-over', (data) => {
  // Update chips in hand reference
  const me = data.players.find(p => p.id === myId);
  if (me) {
    if (data.winnerId === myId || (data.order && data.order[0] === myId)) {
      myComboStreak++;
      if (myComboStreak >= 2 && window.FX) window.FX.triggerOnFire(true);
      if (window.FX) window.FX.confettiBurst(100); // Phase 1: Confetti on Win
    } else {
      myComboStreak = 0;
      if (window.FX) window.FX.triggerOnFire(false);
    }

    getEl('my-chips').textContent = `💰 ${me.chips.toLocaleString()}`;
    getEl('my-score').textContent = `${me.score} pts`;
  }
  showRoundOver(data);
});
// (Duplicate removed)

socket.on('game-over', (data) => {
  showGameOver(data);
});

// ─── Render Game State ────────────────────────────────────────────────────────
function renderGameState() {
  if (!gameState || !roomData) return;

  const { table, currentTurn, handSizes, activePlayers, finishOrder, pot } = gameState;
  const players = roomData.players;

  // HUD
  getEl('hud-pot').textContent = `💰 ${(pot || 0).toLocaleString()}`;

  // Status
  const isMyTurn = currentTurn === myId;
  const turnPlayer = players.find(p => p.id === currentTurn);
  const amIPassed = gameState.passedPlayers && gameState.passedPlayers.includes(myId);

  if (isMyTurn) {
    setStatus('⚡ Your Turn!', true);
  } else if (amIPassed) {
    setStatus('Waiting for next trick…');
  } else if (turnPlayer) {
    setStatus(`${turnPlayer.name}'s turn`);
  }

  // Table + trick history ghost stack
  renderTable(table, players);
  renderGhosts(gameState.trickHistory);
  updateLogFromState();

  // My info
  const me = players.find(p => p.id === myId);
  if (me) {
    getEl('my-chips').textContent = `💰 ${me.chips.toLocaleString()}`;
    getEl('my-score').textContent = `${me.score} pts`;
  }

  if (amIPassed) {
    getEl('my-hand').classList.add('my-passed');
  } else {
    getEl('my-hand').classList.remove('my-passed');
  }

  // Opponents
  const opponents = players.filter(p => p.id !== myId);
  const positions = ['top', 'left', 'right'];
  positions.forEach(pos => {
    const zone = getEl(`opponent-${pos}`);
    zone.classList.add('hidden');
  });

  opponents.forEach((opp, i) => {
    const pos = positions[i];
    if (!pos) return;
    const zone = getEl(`opponent-${pos}`);
    zone.classList.remove('hidden');

    const colorIdx = players.indexOf(opp);
    const avatarText = opp.spectator ? '👁' : (opp.isBot ? '🤖' : opp.name.slice(0, 2).toUpperCase());
    getEl(`opp-${pos}-avatar`).textContent = avatarText;
    getEl(`opp-${pos}-avatar`).style.background = AVATAR_COLORS[colorIdx % AVATAR_COLORS.length];
    getEl(`opp-${pos}-name`).textContent = opp.spectator ? `${opp.name} 👁` : opp.name;
    getEl(`opp-${pos}-chips`).textContent = `💰 ${opp.chips.toLocaleString()}`;
    getEl(`opp-${pos}-score`).textContent = opp.spectator ? 'Spectating' : `${opp.score} pts`;

    // Spectator: just show their info, no cards or timer
    if (opp.spectator) {
      getEl(`opp-${pos}-hand`).innerHTML = '';
      zone.classList.remove('is-turn', 'passed', 'timer-ok', 'timer-warn', 'timer-crit');
      const ring = zone.querySelector('.timer-ring');
      if (ring) ring.style.removeProperty('--timer-pct');
      return;
    }

    // Render passed status
    const isPassed = gameState.passedPlayers && gameState.passedPlayers.includes(opp.id);
    if (isPassed) {
      zone.classList.add('passed');
      if (!zone.querySelector('.passed-badge')) {
        const badge = document.createElement('div');
        badge.className = 'passed-badge';
        badge.textContent = 'PASSED';
        zone.appendChild(badge);
      }
    } else {
      zone.classList.remove('passed');
      const badge = zone.querySelector('.passed-badge');
      if (badge) badge.remove();
    }

    // Clear Phase 2 timer state for this opponent
    zone.classList.remove('timer-ok', 'timer-warn', 'timer-crit');
    const ring = zone.querySelector('.timer-ring');
    if (ring) ring.style.removeProperty('--timer-pct');

    // Render card backs efficiently to prevent flickering
    const handEl = getEl(`opp-${pos}-hand`);
    const count = handSizes[opp.id] || 0;
    const isActive = activePlayers.includes(opp.id);
    const isTheirTurn = currentTurn === opp.id;

    // Create/remove elements only if the count changed
    while (handEl.children.length > count) {
      handEl.removeChild(handEl.lastChild);
    }
    while (handEl.children.length < count) {
      const cb = document.createElement('div');
      cb.className = 'card-back';
      handEl.appendChild(cb);
    }

    // Apply turn glow class to the container
    if (isTheirTurn) {
      handEl.classList.add('is-turn');
    } else {
      handEl.classList.remove('is-turn');
    }

    if (!isActive && finishOrder.includes(opp.id)) {
      const medal = FINISH_MEDALS[finishOrder.indexOf(opp.id)] || '✓';
      getEl(`opp-${pos}-avatar`).textContent = medal;
    }
  });

  // Buttons
  updateActionButtons();

  // Phase 2: Start/Update Timer Loop
  startTimerCountdown(gameState.turnDeadline, gameState.currentTurn);
}

// ─── Phase 2: Radial Turn Timer ───────────────────────────────────────────────
function startTimerCountdown(deadline, currentTurnId) {
  if (timerInterval) clearInterval(timerInterval);

  // Clear all timer states first
  document.querySelectorAll('.opponent-zone').forEach(z => {
    z.classList.remove('timer-ok', 'timer-warn', 'timer-crit');
    const ring = z.querySelector('.timer-ring');
    if (ring) ring.style.removeProperty('--timer-pct');
  });

  const myTimerBar = getEl('my-timer-bar');
  if (myTimerBar) {
    myTimerBar.style.width = '100%';
    myTimerBar.className = 'timer-ok';
  }

  if (!deadline || !currentTurnId) return;

  const totalTime = 15000; // 15s fixed server-side

  timerInterval = setInterval(() => {
    const remaining = Math.max(0, deadline - Date.now());
    const pct = (remaining / totalTime) * 100;

    let timerClass = 'timer-ok';
    if (pct < 33) timerClass = 'timer-crit';
    else if (pct < 66) timerClass = 'timer-warn';

    if (currentTurnId === myId) {
      if (myTimerBar) {
        myTimerBar.style.width = `${pct}%`;
        myTimerBar.className = timerClass;
      }
    } else {
      // Find which opponent zone and update their timer ring
      if (roomData && roomData.players) {
        const opponents = roomData.players.filter(p => p.id !== myId);
        const positions = ['top', 'left', 'right'];
        const oppIndex = opponents.findIndex(p => p.id === currentTurnId);
        if (oppIndex !== -1 && positions[oppIndex]) {
          const zone = getEl(`opponent-${positions[oppIndex]}`);
          if (zone) {
            const ring = zone.querySelector('.timer-ring');
            if (ring) {
              ring.style.setProperty('--timer-pct', pct);
              zone.classList.remove('timer-ok', 'timer-warn', 'timer-crit');
              zone.classList.add(timerClass);
            }
          }
        }
      }
    }

    if (remaining <= 0) {
      clearInterval(timerInterval);
    }
  }, 50); // fast 50ms ticks for smooth conic-gradient rotation
}

function renderTable(table, players) {
  const cardsEl = getEl('table-cards');
  const labelEl = getEl('table-label');
  const infoEl = getEl('table-info');

  const tableKey = (table && table.cards && table.cards.length > 0)
    ? table.cards.map(c => c.id).join(',')
    : '';

  if (!tableKey) {
    // Table is empty — only clear DOM if it wasn't already empty
    if (lastTableKey !== '') {
      cardsEl.innerHTML = '';
      lastTableKey = '';
    }
    labelEl.textContent = 'Empty Table';
    infoEl.textContent = '— Play any combination —';
    return;
  }

  // Always update label and who played
  labelEl.textContent = comboLabel(table.type, table);
  const player = players && players.find(p => p.id === table.playerId);
  infoEl.textContent = player ? `Played by ${player.name}` : '';

  // Only rebuild card elements when the table actually changed
  if (tableKey === lastTableKey) return;
  lastTableKey = tableKey;

  cardsEl.innerHTML = '';
  table.cards.forEach(c => cardsEl.appendChild(createCardEl(c, false)));

  // Phase 1: Cinematic FX on Table Play
  if (window.FX) {
    if (table.type === 'quad' || table.type === 'double-sequence') {
      window.FX.screenShake('heavy');
      window.FX.flashChop();
    }
    setTimeout(() => {
      window.FX.cardFlyIn(cardsEl.querySelectorAll('.playing-card'));
    }, 10);
  }
}

// ─── Trick History Ghost Stack ────────────────────────────────────────────────
function renderGhosts(trickHistory) {
  const ghostsEl = getEl('table-ghosts');
  if (!ghostsEl) return;

  const ghostKey = trickHistory && trickHistory.length
    ? trickHistory.map(p => p.cards.map(c => c.id).join(',')).join('|')
    : '';
  if (ghostKey === lastGhostKey) return;
  lastGhostKey = ghostKey;

  ghostsEl.innerHTML = '';
  if (!trickHistory || trickHistory.length === 0) return;

  // Show at most 2 previous plays; show +N badge for the rest
  const visible = trickHistory.slice(-2);
  const hiddenCount = trickHistory.length - visible.length;

  visible.forEach((play, i) => {
    const depth = visible.length - i; // 2 = oldest visible, 1 = most recent
    const ghost = document.createElement('div');
    ghost.className = 'trick-ghost';
    ghost.dataset.depth = depth;
    play.cards.forEach(c => ghost.appendChild(createCardEl(c, false)));
    ghostsEl.appendChild(ghost);
  });

  if (hiddenCount > 0) {
    const badge = document.createElement('div');
    badge.className = 'trick-ghost-count';
    badge.textContent = `+${hiddenCount}`;
    ghostsEl.appendChild(badge);
  }
}

// ─── Play Log Panel ───────────────────────────────────────────────────────────
function updateLogBadge(count) {
  const badge = getEl('log-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.classList.add('visible');
  } else {
    badge.classList.remove('visible');
  }
}

function updateLogFromState() {
  if (!gameState) return;
  const log = gameState.roundLog || [];
  const newCount = log.length - lastLogLength;

  if (logPanelOpen) {
    // Panel open — render all entries and clear badge
    renderLogEntries(log);
    lastLogLength = log.length;
    updateLogBadge(0);
  } else if (newCount > 0) {
    // Panel closed — update badge with new entry count
    updateLogBadge(newCount);
  }
}

function renderLogEntries(log) {
  const entriesEl = getEl('log-entries');
  if (!entriesEl) return;
  entriesEl.innerHTML = '';

  log.forEach(entry => {
    if (entry.divider) {
      const div = document.createElement('div');
      div.className = 'log-divider';
      div.textContent = 'trick ended';
      entriesEl.appendChild(div);
      return;
    }

    const el = document.createElement('div');
    el.className = 'log-entry';
    if (entry.playerId === myId) el.classList.add('is-me');

    const playerIdx = roomData && roomData.players
      ? roomData.players.findIndex(p => p.id === entry.playerId)
      : -1;
    const color = playerIdx >= 0 ? AVATAR_COLORS[playerIdx % AVATAR_COLORS.length] : '#888';

    const dot = document.createElement('span');
    dot.className = 'log-entry-dot';
    dot.style.background = color;

    const text = document.createElement('span');
    text.className = 'log-entry-text';
    const label = comboLabel(entry.type, {});
    text.innerHTML = `<strong>${escapeHtml(entry.playerName)}</strong> played ${label}`;

    el.appendChild(dot);
    el.appendChild(text);
    entriesEl.appendChild(el);
  });

  // Auto-scroll to latest entry
  entriesEl.scrollTop = entriesEl.scrollHeight;
}

function openLogPanel() {
  logPanelOpen = true;
  getEl('log-panel').classList.add('open');
  lastLogLength = (gameState && gameState.roundLog) ? gameState.roundLog.length : 0;
  updateLogBadge(0);
  if (gameState) renderLogEntries(gameState.roundLog || []);
}

function closeLogPanel() {
  logPanelOpen = false;
  getEl('log-panel').classList.remove('open');
}

// ─── Hand Interaction ───────────────────────────────────────────────────────────
function renderHand() {
  const container = getEl('my-hand');
  const sorted = [...myHand].sort((a, b) => cardValue(a) - cardValue(b));
  const handIds = new Set(sorted.map(c => c.id));

  // Build map of cards currently in DOM (skip ones already animating out)
  const existing = new Map();
  container.querySelectorAll('.playing-card').forEach(el => {
    if (!el.classList.contains('card-play-out')) {
      existing.set(el.dataset.id, el);
    }
  });

  // Animate out cards that are no longer in the hand
  existing.forEach((el, id) => {
    if (!handIds.has(id)) {
      el.classList.add('card-play-out');
      el.onclick = null;
      setTimeout(() => { if (el.parentNode) el.remove(); }, 220);
    }
  });

  // Update existing cards or add new ones
  sorted.forEach(card => {
    const el = existing.get(card.id);
    if (el) {
      // Already in DOM — just sync selection state
      el.classList.toggle('selected', selectedIds.has(card.id));
      el.onclick = () => toggleSelect(card.id);
    } else {
      // New card (fresh round) — create and append
      const newEl = createCardEl(card, true);
      if (selectedIds.has(card.id)) newEl.classList.add('selected');
      newEl.onclick = () => toggleSelect(card.id);
      container.appendChild(newEl);
    }
  });
}

// ─── Card Element ─────────────────────────────────────────────────────────────
function createCardEl(card, interactive) {
  const isRed = card.suit === 'D' || card.suit === 'H';
  const el = document.createElement('div');
  el.className = `playing-card ${isRed ? 'red-card' : 'black-card'}`;
  el.dataset.id = card.id;

  const sym = SUIT_SYM[card.suit];
  el.innerHTML = `
    <div class="card-corner tl">
      <span class="card-rank">${card.rank}</span>
      <span class="card-suit-corner">${sym}</span>
    </div>
    <div class="card-center">${sym}</div>
    <div class="card-corner br">
      <span class="card-rank">${card.rank}</span>
      <span class="card-suit-corner">${sym}</span>
    </div>
  `;
  return el;
}

// ─── Card Selection ───────────────────────────────────────────────────────────
function toggleSelect(cardId) {
  if (!isMyTurnNow()) return;

  if (selectedIds.has(cardId)) {
    selectedIds.delete(cardId);
  } else {
    selectedIds.add(cardId);
  }

  // Toggle class directly on the existing element — no DOM rebuild needed
  const el = document.querySelector(`#my-hand [data-id="${cardId}"]`);
  if (el) el.classList.toggle('selected', selectedIds.has(cardId));
  updateActionButtons();
}

// ─── Actions ──────────────────────────────────────────────────────────────────
function playCards() {
  const cardIds = [...selectedIds];
  if (!cardIds.length) return;

  socket.emit('play-cards', { code: myCode, cardIds }, (res) => {
    if (res.error) {
      showToast(`❌ ${res.error}`, 'error');
    } else {
      selectedIds.clear();
    }
  });
}

function pass() {
  socket.emit('pass', { code: myCode }, (res) => {
    if (res.error) showToast(`❌ ${res.error}`, 'error');
    else showToast('You passed', '');
  });
}

function updateActionButtons() {
  if (isSpectator) {
    getEl('btn-pass').disabled = true;
    getEl('btn-play').disabled = true;
    const btnSuggest = getEl('btn-suggest');
    if (btnSuggest) btnSuggest.disabled = true;
    return;
  }

  const isMyTurn = isMyTurnNow();
  const table = gameState && gameState.table;
  const hasTable = table && table.cards && table.cards.length > 0;
  const hasSelection = selectedIds.size > 0;

  getEl('btn-pass').disabled = !isMyTurn || !hasTable;
  getEl('btn-play').disabled = !isMyTurn || !hasSelection;

  // Auto Select Logic
  const btnSuggest = getEl('btn-suggest');
  if (btnSuggest) {
    if (!isMyTurn) {
      btnSuggest.disabled = true;
    } else {
      if (!table) {
        btnSuggest.disabled = false;
      } else {
        const allCombos = findAllCombos(myHand);
        const canBeatTable = allCombos.some(cards => {
          const combo = getComboType(cards);
          return combo && canBeat(table, combo);
        });
        btnSuggest.disabled = !canBeatTable;
      }
    }
  }
}

function isMyTurnNow() {
  return gameState && gameState.currentTurn === myId;
}

// ─── Overlays ─────────────────────────────────────────────────────────────────
function showRoundOver(data) {
  lastRoundOverData = data;
  currentOverlayType = 'round-over';

  const { order, chipResults, pointResults, players, pot } = data;
  const pos = ['🥇 1st', '🥈 2nd', '🥉 3rd', '💀 4th'];

  let body = `<div style="margin-bottom:12px;color:var(--muted);font-size:0.8rem">Pot: 💰 ${pot ? pot.toLocaleString() : 0}</div>`;
  order.forEach((pid, i) => {
    const p = players.find(pl => pl.id === pid);
    if (!p) return;
    const chip = chipResults[pid] || 0;
    const pts = pointResults[pid] || 0;
    const isMe = pid === myId;
    body += `<div class="result-row" ${isMe ? 'style="border:1px solid var(--primary)"' : ''}>
      <span class="pos">${pos[i] || ''}</span>
      <span class="rname">${escapeHtml(p.name)}${isMe ? ' (You)' : ''}</span>
      <span class="rchip">${chip > 0 ? '+' : ''}${chip.toLocaleString()}</span>
      <span class="rpts">+${pts}pt</span>
    </div>`;
  });

  // Show spectators joining next round
  const currentPlayers = roomData ? roomData.players : [];
  const spectators = currentPlayers.filter(p => p.spectator);
  if (spectators.length > 0) {
    body += `<div style="margin-top:8px;color:var(--muted);font-size:0.78rem">👁 ${spectators.map(p => escapeHtml(p.name)).join(', ')} joining next round</div>`;
  }

  // Invite link row
  const inviteUrl = `${window.location.protocol}//${window.location.hostname}:${window.location.port}/?room=${myCode}`;
  body += `<div class="invite-row">
    <span class="invite-code">Room: <strong>${myCode}</strong></span>
    <button class="btn-copy-inline" onclick="copyInviteLink(this, '${inviteUrl}')">📋 Copy Link</button>
  </div>`;

  const isHost = roomData && roomData.hostId === myId;
  const canAddBot = isHost && currentPlayers.length < 4;
  const hasBot = isHost && currentPlayers.some(p => p.isBot);

  const actionsHtml = `
    <button class="btn-overlay-secondary btn-danger-overlay" onclick="leaveGame()">Leave</button>
    ${isHost ? `<button class="btn-overlay-secondary" id="overlay-addbot-btn" onclick="addBotFromOverlay()" ${canAddBot ? '' : 'disabled'}>+ Add Bot</button>` : ''}
    ${isHost ? `<button class="btn-overlay-secondary btn-danger-overlay" id="overlay-kickbot-btn" onclick="kickBotFromOverlay()" ${hasBot ? '' : 'disabled'}>- Kick Bot</button>` : ''}
  `;

  showOverlay('🃏', 'Round Over', body,
    isHost ? 'Next Round' : 'Waiting for host…',
    isHost ? () => {
      socket.emit('new-round', { code: myCode }, (res) => {
        if (res && res.error) showToast(res.error, 'error');
      });
      hideOverlay();
    } : null,
    actionsHtml
  );
}

function showGameOver(data) {
  currentOverlayType = 'game-over';
  if (gameOverCountdown) { clearInterval(gameOverCountdown); gameOverCountdown = null; }

  const winner = data.players.find(p => p.id === data.winnerId);
  const isWinner = data.winnerId === myId;
  let body = `<p>${isWinner ? '🎉 Congratulations!' : `${winner ? escapeHtml(winner.name) : 'Someone'} wins the game!`}</p><br/>`;
  const sorted = [...data.players].sort((a, b) => b.score - a.score || b.chips - a.chips);
  sorted.forEach((p, i) => {
    const isMe = p.id === myId;
    body += `<div class="result-row" ${isMe ? 'style="border:1px solid var(--gold)"' : ''}>
      <span class="pos">${FINISH_MEDALS[i] || ''}</span>
      <span class="rname">${escapeHtml(p.name)}</span>
      <span class="rchip">💰 ${p.chips.toLocaleString()}</span>
      <span class="rpts">${p.score}pt</span>
    </div>`;
  });
  body += `<div id="game-over-countdown" style="margin-top:14px;color:var(--muted);font-size:0.82rem">Returning to lobby in <span id="countdown-secs">5</span>s…</div>`;

  showOverlay('🏆', 'Game Over!', body, 'Back to Lobby', () => returnToLobby());

  let secs = 5;
  gameOverCountdown = setInterval(() => {
    secs--;
    const el = getEl('countdown-secs');
    if (el) el.textContent = secs;
    if (secs <= 0) {
      clearInterval(gameOverCountdown);
      gameOverCountdown = null;
      returnToLobby();
    }
  }, 1000);
}

function returnToLobby() {
  if (gameOverCountdown) { clearInterval(gameOverCountdown); gameOverCountdown = null; }
  localStorage.removeItem('tl_room'); // prevent lobby from auto-redirecting back to game.html
  window.location.href = `/?room=${myCode}`;
}

function showOverlay(icon, title, bodyHtml, btnText, btnAction, actionsHtml = '') {
  getEl('overlay-icon').textContent = icon;
  getEl('overlay-title').textContent = title;
  getEl('overlay-body').innerHTML = bodyHtml;
  const actionsEl = getEl('overlay-actions');
  if (actionsEl) actionsEl.innerHTML = actionsHtml;
  const btn = getEl('overlay-btn');
  btn.textContent = btnText || 'OK';
  btn.onclick = btnAction || hideOverlay;
  btn.style.opacity = btnAction ? '1' : '0.5';
  getEl('overlay').classList.remove('hidden');
}

function hideOverlay() {
  getEl('overlay').classList.add('hidden');
  currentOverlayType = null;
}

// ─── Overlay helpers (called from inline onclick in overlay HTML) ──────────────
function leaveGame() {
  if (confirm('Are you sure you want to leave?')) {
    socket.emit('leave-room', { code: myCode });
    localStorage.removeItem('tl_room');
    localStorage.removeItem('tl_state');
    window.location.href = '/';
  }
}

function addBotFromOverlay() {
  socket.emit('add-bot', { code: myCode }, (res) => {
    if (res && res.error) showToast(res.error, 'error');
  });
}

function kickBotFromOverlay() {
  socket.emit('remove-bot', { code: myCode }, (res) => {
    if (res && res.error) showToast(res.error, 'error');
  });
}

function copyInviteLink(btn, url) {
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  }).catch(() => {});
}

// ─── Toasts ───────────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const container = getEl('toasts');
  const t = document.createElement('div');
  t.className = `toast${type ? ' ' + type : ''}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// ─── HUD Status ───────────────────────────────────────────────────────────────
function setStatus(text, myTurn = false) {
  const el = getEl('hud-status');
  el.textContent = text;
  el.className = myTurn ? 'hud-status my-turn' : 'hud-status';
}

// ─── Phase 4: Auto Select Helper ──────────────────────────────────────────────

function rankIndex(r) { return RANKS.indexOf(r); }
function suitIndex(s) { return SUITS.indexOf(s); }
function cardValue(card) { return rankIndex(card.rank) * 4 + suitIndex(card.suit); }
function sortCards(cards) { return [...cards].sort((a, b) => cardValue(a) - cardValue(b)); }

function getComboType(cards) {
  const n = cards.length;
  const sorted = sortCards(cards);
  const ranks = sorted.map(c => c.rank);
  const rankIdxs = ranks.map(rankIndex);

  if (n === 1) return { type: 'single', top: sorted[0] };

  const allSameRank = ranks.every(r => r === ranks[0]);
  if (allSameRank) {
    if (n === 2) return { type: 'pair', top: sorted[n - 1] };
    if (n === 3) return { type: 'triple', top: sorted[n - 1] };
    if (n === 4) return { type: 'quad', top: sorted[n - 1] };
  }

  if (n >= 3 && !ranks.includes('2')) {
    const uniqueRanks = [...new Set(rankIdxs)].sort((a, b) => a - b);
    if (uniqueRanks.length === n && uniqueRanks[n - 1] - uniqueRanks[0] === n - 1) {
      return { type: 'sequence', length: n, top: sorted[n - 1] };
    }
  }

  if (n >= 6 && n % 2 === 0 && !ranks.includes('2')) {
    let isDoubleSeq = true;
    const pairs = [];
    for (let i = 0; i < n; i += 2) {
      if (ranks[i] !== ranks[i + 1]) { isDoubleSeq = false; break; }
      pairs.push(rankIdxs[i]);
    }
    if (isDoubleSeq) {
      pairs.sort((a, b) => a - b);
      const uPairs = [...new Set(pairs)];
      if (uPairs.length === pairs.length && uPairs[uPairs.length - 1] - uPairs[0] === pairs.length - 1) {
        return { type: 'double-sequence', length: n / 2, top: sorted[n - 1] };
      }
    }
  }
  return null;
}

function compareCards(a, b) {
  const rv = rankIndex(a.rank) - rankIndex(b.rank);
  if (rv !== 0) return rv;
  return suitIndex(a.suit) - suitIndex(b.suit);
}

function canBeat(current, challenger) {
  const c = current.type;
  const ch = challenger.type;

  if (c === ch) {
    if ((c === 'sequence' || c === 'double-sequence') && challenger.length !== current.length) return false;
    return compareCards(challenger.top, current.top) > 0;
  }

  if (c === 'single' && current.top.rank === '2') {
    if (ch === 'quad') return true;
    if (ch === 'double-sequence' && challenger.length >= 3) return true;
  }

  if (c === 'pair' && current.top.rank === '2') {
    if (ch === 'double-sequence' && challenger.length >= 4) return true;
  }

  if (c === 'triple' && current.top.rank === '2') {
    if (ch === 'double-sequence' && challenger.length >= 5) return true;
  }

  if (c === ch && (c === 'quad' || c === 'double-sequence')) {
    if (c === 'double-sequence' && challenger.length >= current.length) {
      return compareCards(challenger.top, current.top) > 0;
    }
  }
  return false;
}

function findAllCombos(hand) {
  const combos = [];
  const sorted = sortCards(hand);

  for (const c of sorted) combos.push([c]);

  const byRank = {};
  for (const c of sorted) {
    if (!byRank[c.rank]) byRank[c.rank] = [];
    byRank[c.rank].push(c);
  }

  for (const cards of Object.values(byRank)) {
    if (cards.length >= 2) {
      for (let i = 0; i < cards.length; i++)
        for (let j = i + 1; j < cards.length; j++)
          combos.push([cards[i], cards[j]]);
    }
    if (cards.length >= 3) {
      for (let i = 0; i < cards.length; i++)
        for (let j = i + 1; j < cards.length; j++)
          for (let k = j + 1; k < cards.length; k++)
            combos.push([cards[i], cards[j], cards[k]]);
    }
    if (cards.length === 4) combos.push([...cards]);
  }

  const rankGroups = Object.keys(byRank)
    .filter(r => r !== '2')
    .map(r => ({ rank: r, idx: rankIndex(r), cards: byRank[r] }))
    .sort((a, b) => a.idx - b.idx);

  for (let start = 0; start < rankGroups.length; start++) {
    const seq = [rankGroups[start]];
    for (let end = start + 1; end < rankGroups.length; end++) {
      if (rankGroups[end].idx !== rankGroups[end - 1].idx + 1) break;
      seq.push(rankGroups[end]);
      if (seq.length >= 3) combos.push(seq.map(g => g.cards[0]));
    }
  }

  const dblRankGroups = rankGroups.filter(g => g.cards.length >= 2);
  for (let start = 0; start < dblRankGroups.length; start++) {
    const dSeq = [dblRankGroups[start]];
    for (let end = start + 1; end < dblRankGroups.length; end++) {
      if (dblRankGroups[end].idx !== dblRankGroups[end - 1].idx + 1) break;
      dSeq.push(dblRankGroups[end]);
      if (dSeq.length >= 3) {
        const cards = [];
        dSeq.forEach(g => cards.push(g.cards[0], g.cards[1]));
        combos.push(cards);
      }
    }
  }
  return combos;
}

function autoSelect() {
  if (!gameState || !roomData || gameState.currentTurn !== myId) return;

  const hand = myHand;
  if (!hand || hand.length === 0) return;

  const allCombos = findAllCombos(hand);
  let candidates = [];

  const table = gameState.table;
  const hasTable = table && table.cards && table.cards.length > 0;

  if (!hasTable) {
    // Free play: build a ranked list of suggestions
    let choices;
    if (gameState.firstRound) {
      // First round: must include 3♠
      choices = allCombos.filter(c => c.some(card => card.rank === '3' && card.suit === 'S'));
    } else {
      choices = allCombos;
    }

    // Prefer combos that don't use 2s
    const noTwos = choices.filter(c => c.every(card => card.rank !== '2'));
    const preferred = noTwos.length > 0 ? noTwos : choices;

    if (hand.length <= 4) {
      // Few cards left: prefer longer combos to finish faster
      preferred.sort((a, b) => {
        if (b.length !== a.length) return b.length - a.length;
        return compareCards(a[a.length - 1], b[b.length - 1]);
      });
    } else {
      // Conservative: play lowest-valued combo first; for same top card prefer shorter
      preferred.sort((a, b) => {
        const cmp = compareCards(a[a.length - 1], b[b.length - 1]);
        if (cmp !== 0) return cmp;
        return a.length - b.length;
      });
    }
    candidates = preferred;
  } else {
    // Must beat the table: find all valid plays sorted weakest-first
    const validPlays = allCombos
      .map(cards => ({ cards, combo: getComboType(cards) }))
      .filter(x => x.combo && canBeat(table, x.combo));

    if (validPlays.length === 0) {
      showToast('No cards can beat this trick! 😤', 'error');
      suggestionIndex = 0;
      return;
    }

    // Prefer no-2s, then sort weakest-to-strongest so first suggestion is most conservative
    const noTwos = validPlays.filter(x => x.cards.every(c => c.rank !== '2'));
    const ordered = noTwos.length > 0 ? noTwos : validPlays;
    ordered.sort((a, b) => compareCards(a.combo.top, b.combo.top));
    candidates = ordered.map(x => x.cards);
  }

  if (candidates.length === 0) {
    showToast('No valid plays available!', 'error');
    suggestionIndex = 0;
    return;
  }

  // Cycle through candidates on repeated clicks
  if (suggestionIndex >= candidates.length) suggestionIndex = 0;
  const bestCombo = candidates[suggestionIndex];
  suggestionIndex = (suggestionIndex + 1) % candidates.length;

  selectedIds.clear();
  bestCombo.forEach(c => selectedIds.add(c.id));

  // Toggle selection classes directly — no DOM rebuild
  document.querySelectorAll('#my-hand .playing-card').forEach(el => {
    el.classList.toggle('selected', selectedIds.has(el.dataset.id));
  });

  // Pulse animation on newly selected cards
  bestCombo.forEach(c => {
    const el = document.querySelector(`#my-hand [data-id="${c.id}"]`);
    if (el) {
      el.classList.remove('suggest-highlight');
      void el.offsetWidth; // force reflow to restart animation
      el.classList.add('suggest-highlight');
      setTimeout(() => el.classList.remove('suggest-highlight'), 700);
    }
  });

  updateActionButtons();

  // Toast: show combo type + cycle position
  const combo = getComboType(bestCombo);
  const label = combo ? comboLabel(combo.type, combo) : 'Play';
  const total = candidates.length;
  const current = ((suggestionIndex - 1 + total) % total) + 1;
  const cycleHint = total > 1 ? ` · ${current}/${total} — press S again for more` : '';
  showToast(`💡 ${label}${cycleHint}`, '');
}

// ─── Combo Label ──────────────────────────────────────────────────────────────
function comboLabel(type, table) {
  const map = {
    single: 'Single', pair: 'Pair', triple: 'Three of a Kind',
    quad: 'Four of a Kind 💣', sequence: 'Sequence', 'double-sequence': 'Double Sequence 💣'
  };
  return map[type] || type;
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function getEl(id) { return document.getElementById(id); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─── Button Wires & Keyboard Shortcuts ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  getEl('btn-play').onclick = playCards;
  getEl('btn-pass').onclick = pass;
  const suggestBtn = getEl('btn-suggest');
  if (suggestBtn) suggestBtn.onclick = autoSelect;

  getEl('btn-log').onclick = () => logPanelOpen ? closeLogPanel() : openLogPanel();
  getEl('btn-log-close').onclick = closeLogPanel;

  document.addEventListener('keydown', (e) => {
    // Ignore when typing in an input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 's' || e.key === 'S') {
      const btn = getEl('btn-suggest');
      if (btn && !btn.disabled) autoSelect();
    }
    if (e.key === 'Enter') {
      const btn = getEl('btn-play');
      if (btn && !btn.disabled) playCards();
    }
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault(); // prevent page scroll
      const btn = getEl('btn-pass');
      if (btn && !btn.disabled) pass();
    }
    if (e.key === 'Escape') {
      selectedIds.clear();
      suggestionIndex = 0;
      document.querySelectorAll('#my-hand .playing-card').forEach(el => {
        el.classList.remove('selected');
      });
      updateActionButtons();
    }
  });

  init();
});
