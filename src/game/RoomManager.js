const { createDeck, shuffle, sortCards, getComboType, canBeat, checkToiTrang } = require('./GameLogic');

const rooms = {};
let botCounter = 0;

const BOT_NAMES = ['Lan', 'Minh', 'Hùng', 'Trang', 'Tuấn', 'Linh', 'Đức', 'Hoa', 'Bảo', 'Mai'];

function generateBotId() { return `bot_${++botCounter}_${Date.now()}`; }

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
        code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (rooms[code]);
    return code;
}

function createRoom(hostId, hostName, startingChips, anteAmount) {
    const code = generateRoomCode();
    rooms[code] = {
        code,
        hostId,
        players: [{ id: hostId, name: hostName, chips: startingChips, score: 0, ready: false, isBot: false }],
        startingChips: startingChips || 10000,
        anteAmount: anteAmount || 100,
        state: 'lobby', // lobby | playing
        game: null,
        lastRoundWinner: null,     // id of previous round winner (for winner-goes-first rule)
        lastRoundPlayerIds: null,  // player ids who played last round
        lastGameComplete: false,   // true after game-over, so next startGame resets scores
    };
    return rooms[code];
}

function getRoom(code) { return rooms[code] || null; }

function getAllRooms() { return rooms; }
function deleteRoom(code) { delete rooms[code]; }

function publicRoom(room) {
    return {
        code: room.code,
        hostId: room.hostId,
        players: room.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, score: p.score, isBot: !!p.isBot, spectator: !!p.spectator })),
        startingChips: room.startingChips,
        anteAmount: room.anteAmount,
        state: room.state,
    };
}

// ─── Game Logic ───────────────────────────────────────────────────────────────

function startGame(room) {
    // Only deal to non-spectator players
    const players = room.players.filter(p => !p.spectator);
    const deck = shuffle(createDeck());

    const hands = {};
    let startingPlayer = null;

    // Determine if the roster is identical to the last round (winner-goes-first rule)
    const currentIds = players.map(p => p.id).slice().sort();
    const lastIds = room.lastRoundPlayerIds ? [...room.lastRoundPlayerIds].sort() : null;
    const sameRoster = lastIds &&
        currentIds.length === lastIds.length &&
        currentIds.every((id, i) => id === lastIds[i]);

    // Reset scores when roster changed OR a full game just completed
    if (!sameRoster || room.lastGameComplete) {
        room.players.forEach(p => { p.score = 0; });
        room.lastGameComplete = false;
    }

    const useWinnerFirst = sameRoster && room.lastRoundWinner &&
        players.some(p => p.id === room.lastRoundWinner);

    players.forEach((p, i) => {
        const hand = sortCards(deck.slice(i * 13, i * 13 + 13));
        hands[p.id] = hand;
        if (!useWinnerFirst && hand.some(c => c.rank === '3' && c.suit === 'S')) {
            startingPlayer = p.id;
        }
    });

    if (useWinnerFirst) {
        startingPlayer = room.lastRoundWinner;
    } else if (!startingPlayer) {
        startingPlayer = players[0].id; // fallback (shouldn't happen)
    }

    // Deduct antes from active players only
    const pot = players.length * room.anteAmount;
    players.forEach(p => { p.chips -= room.anteAmount; });

    room.state = 'playing';
    room.game = {
        hands,
        currentTurn: startingPlayer,
        turnDeadline: Date.now() + 15000,
        table: null,
        passedPlayers: [],
        activePlayers: players.map(p => p.id),
        finishOrder: [],
        firstRound: !useWinnerFirst, // no 3♠ restriction when winner goes first
        pot,
        roundScores: {},
        toiTrangWinner: null,
        toiTrangReason: null,
        trickHistory: [],
        roundLog: [],
    };

    // Check Tới Trắng
    const toiTrangWins = players.map(p => ({ id: p.id, reason: checkToiTrang(hands[p.id]) }))
        .filter(x => x.reason);
    if (toiTrangWins.length > 0) {
        const starterWin = toiTrangWins.find(x => x.id === startingPlayer);
        const winnerInfo = starterWin || toiTrangWins[0];
        room.game.toiTrangWinner = winnerInfo.id;
        room.game.toiTrangReason = winnerInfo.reason;
        room.game.finishOrder.push(winnerInfo.id);
        players.forEach(p => {
            if (p.id !== winnerInfo.id) room.game.finishOrder.push(p.id);
        });
        room.game.activePlayers = [];
    }

    return room.game;
}

function nextActiveTurn(room) {
    const game = room.game;
    const allIds = room.players.map(p => p.id);
    const startIdx = allIds.indexOf(game.currentTurn);

    for (let i = 1; i <= allIds.length; i++) {
        const nextIdx = (startIdx + i) % allIds.length;
        const nextId = allIds[nextIdx];

        if (game.activePlayers.includes(nextId) && !game.passedPlayers.includes(nextId)) {
            return nextId;
        }
    }
    return game.activePlayers[0];
}

function applyPlay(room, playerId, cardIds) {
    const game = room.game;
    const hand = game.hands[playerId];

    // Find cards by id
    const played = cardIds.map(id => hand.find(c => c.id === id)).filter(Boolean);
    if (played.length !== cardIds.length) return { error: 'Invalid cards' };

    const combo = getComboType(played);
    if (!combo) return { error: 'Invalid combination' };

    // First move in first round must include 3♠
    if (game.firstRound && !game.table) {
        if (!played.some(c => c.rank === '3' && c.suit === 'S')) {
            return { error: 'First move must include the 3 of Spades' };
        }
        game.firstRound = false;
    }

    // Check can beat table
    if (game.table) {
        if (!canBeat(game.table, combo)) return { error: 'Does not beat current table' };
    }

    // Push the outgoing table play into trick history before replacing it
    if (game.table) {
        game.trickHistory.push({ cards: game.table.cards, type: game.table.type, playerId: game.table.playerId });
    }

    // Log this play (lightweight, for the log panel)
    const playerName = room.players.find(p => p.id === playerId)?.name || 'Player';
    game.roundLog.push({ playerName, playerId, type: combo.type, cardCount: played.length });

    // Apply
    game.hands[playerId] = hand.filter(c => !cardIds.includes(c.id));
    game.table = { ...combo, cards: played, playerId };

    // Check if player finished
    if (game.hands[playerId].length === 0) {
        game.finishOrder.push(playerId);
        game.activePlayers = game.activePlayers.filter(id => id !== playerId);

        if (game.activePlayers.length <= 1) {
            // Round over
            if (game.activePlayers.length === 1) {
                game.finishOrder.push(game.activePlayers[0]);
            }
            return { roundOver: true };
        }
    }

    game.currentTurn = nextActiveTurn(room);
    game.turnDeadline = Date.now() + 15000;

    // If every other active player already passed this trick, auto-end it so the
    // player who just played doesn't have to beat their own card.
    const othersStillIn = game.activePlayers.filter(id => id !== playerId && !game.passedPlayers.includes(id));
    if (othersStillIn.length === 0 && game.activePlayers.includes(playerId)) {
        game.table = null;
        game.passedPlayers = [];
        game.trickHistory = [];
        if (game.roundLog.length > 0) game.roundLog.push({ divider: true });
        game.currentTurn = playerId; // player leads the new trick
    }

    return { ok: true };
}

function applyPass(room, playerId) {
    const game = room.game;

    // If the first-round opener timed out on an empty table, lift the 3♠ restriction
    // so the next player is free to play anything
    if (game.firstRound && !game.table) {
        game.firstRound = false;
    }

    if (!game.passedPlayers.includes(playerId)) {
        game.passedPlayers.push(playerId);
    }

    // Count how many active players have NOT passed
    const playersStillInTrick = game.activePlayers.filter(id => !game.passedPlayers.includes(id));

    if (playersStillInTrick.length <= 1) {
        // Everyone else passed — clear table, last remaining player goes again
        const lastPlayerId = game.table ? game.table.playerId : null;
        // When table is empty (no one played), the last remaining non-passed player leads.
        // Compute this BEFORE resetting passedPlayers, otherwise nextActiveTurn can't tell who should go.
        const emptyTableLeader = !game.table ? (playersStillInTrick[0] || null) : null;

        game.table = null;
        game.passedPlayers = []; // reset for new trick
        game.trickHistory = []; // reset trick history for new trick
        if (game.roundLog.length > 0) game.roundLog.push({ divider: true });

        if (emptyTableLeader) {
            // No one played this trick — last non-passed player leads
            game.currentTurn = emptyTableLeader;
        } else if (game.activePlayers.includes(lastPlayerId)) {
            game.currentTurn = lastPlayerId;
        } else {
            // The person who won the trick just finished their hand!
            // Right to start new trick passes to the next available person
            game.currentTurn = lastPlayerId;
            game.currentTurn = nextActiveTurn(room);
        }
    } else {
        game.currentTurn = nextActiveTurn(room);
    }

    game.turnDeadline = Date.now() + 15000;
    return { ok: true };
}

// Points: 1st=3, 2nd=2, 3rd=1, 4th=0
const ROUND_POINTS = [3, 2, 1, 0];

function settleRound(room) {
    const game = room.game;
    const order = game.finishOrder;
    const pot = game.pot;

    // Point scoring
    const pointResults = {};
    order.forEach((pid, i) => {
        const pts = ROUND_POINTS[i] || 0;
        const player = room.players.find(p => p.id === pid);
        if (player) {
            player.score += pts;
            pointResults[pid] = pts;
        }
    });

    // Chip payouts (pot distribution)
    const PAYOUTS = [0.60, 0.25, 0.15, 0]; // 1st gets 60%, 2nd 25%, 3rd 15%, 4th nothing
    const chipResults = {};
    order.forEach((pid, i) => {
        const gain = Math.floor(pot * (PAYOUTS[i] || 0));
        const player = room.players.find(p => p.id === pid);
        if (player) {
            player.chips += gain;
            chipResults[pid] = gain;
        }
    });

    // Check game winner (first to reach 10 points)
    const sorted = [...room.players].sort((a, b) => b.score - a.score);
    let gameWinner = null;
    if (sorted[0].score >= 10 && sorted[0].score > sorted[1].score) {
        gameWinner = sorted[0].id;
    }

    // Store for next round: winner-goes-first and roster tracking
    room.lastRoundWinner = order[0];
    room.lastRoundPlayerIds = room.players.filter(p => !p.spectator).map(p => p.id);
    if (gameWinner) room.lastGameComplete = true;

    room.state = 'lobby'; // reset to lobby for next round

    return { order, pointResults, chipResults, gameWinner, pot };
}

function buildPublicState(room) {
    if (!room.game) return { state: 'lobby', room: publicRoom(room) };
    const g = room.game;
    return {
        state: 'playing',
        room: publicRoom(room),
        table: g.table ? { type: g.table.type, top: g.table.top, length: g.table.length, cards: g.table.cards, playerId: g.table.playerId } : null,
        currentTurn: g.currentTurn,
        turnDeadline: g.turnDeadline,
        handSizes: Object.fromEntries(Object.entries(g.hands).map(([id, h]) => [id, h.length])),
        activePlayers: g.activePlayers,
        passedPlayers: g.passedPlayers,
        finishOrder: g.finishOrder,
        pot: g.pot,
        firstRound: g.firstRound || false,
        trickHistory: g.trickHistory || [],
        roundLog: g.roundLog || [],
    };
}

module.exports = {
    getRoom,
    getAllRooms,
    deleteRoom,
    createRoom,
    publicRoom,
    generateBotId,
    BOT_NAMES,
    startGame,
    nextActiveTurn,
    applyPlay,
    applyPass,
    settleRound,
    buildPublicState,
};
