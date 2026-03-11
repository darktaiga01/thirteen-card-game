const {
    getRoom,
    getAllRooms,
    deleteRoom,
    createRoom,
    publicRoom,
    generateBotId,
    BOT_NAMES,
    startGame,
    applyPlay,
    applyPass,
    settleRound,
    buildPublicState,
} = require('../game/RoomManager');
const { isBot, determineBotPlay } = require('../game/BotAI');

// Promote host to the next human player after the departing host (in seat order).
// Returns true if a new host was assigned, false if no humans remain (room should be deleted).
function promoteHost(room, departingId) {
    const idx = room.players.findIndex(p => p.id === departingId);
    const total = room.players.length;
    for (let i = 1; i < total; i++) {
        const candidate = room.players[(idx + i) % total];
        if (!candidate.isBot && candidate.id !== departingId) {
            room.hostId = candidate.id;
            return true;
        }
    }
    return false; // no human player found
}

function setupSocketHandlers(io) {
    function scheduleBotTurn(room) {
        if (!room.game || room.state !== 'playing') return;
        const currentId = room.game.currentTurn;
        if (!isBot(room, currentId)) return;

        // Delay to feel natural
        setTimeout(() => {
            if (!room.game || room.game.currentTurn !== currentId) return;
            executeBotPlay(room, currentId);
        }, 800 + Math.random() * 700);
    }

    function executeBotPlay(room, botId) {
        const decision = determineBotPlay(room.game, botId);
        if (!decision) return;

        if (decision.action === 'pass') {
            applyPass(room, botId);
            io.to(room.code).emit('game-state', buildPublicState(room));
            scheduleBotTurn(room);
            return;
        }

        if (decision.action === 'play') {
            const result = applyPlay(room, botId, decision.cardIds);
            if (result.roundOver) {
                const settlement = settleRound(room);
                io.to(room.code).emit('round-over', {
                    ...settlement,
                    players: room.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, score: p.score })),
                });
                if (settlement.gameWinner) {
                    io.to(room.code).emit('game-over', {
                        winnerId: settlement.gameWinner,
                        players: room.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, score: p.score })),
                    });
                }
                return;
            }

            io.to(room.code).emit('game-state', buildPublicState(room));
            scheduleBotTurn(room);
        }
    }

    // Phase 2: Central loop to check turn deadlines
    setInterval(() => {
        const rooms = Object.values(getAllRooms());
        for (const room of rooms) {
            if (room.state === 'playing' && room.game && room.game.turnDeadline) {
                // Buffer of 500ms to account for network latency
                if (Date.now() > room.game.turnDeadline + 500) {
                    const currentId = room.game.currentTurn;
                    const wasFirstRound = room.game.firstRound && !room.game.table;

                    // Prevent bot turns from being skipped prematurely if they are naturally slow,
                    // but they shouldn't hit this since their scheduleBotTurn is ~1.5s
                    applyPass(room, currentId);

                    const playerName = room.players.find(p => p.id === currentId)?.name || 'Player';
                    io.to(room.code).emit('toast', { msg: `⏱️ ${playerName} auto-passed (time's up!)`, type: 'error' });
                    if (wasFirstRound) {
                        io.to(room.code).emit('toast', { msg: `3♠ restriction lifted — anyone can lead now`, type: '' });
                    }
                    io.to(room.code).emit('game-state', buildPublicState(room));
                    scheduleBotTurn(room);
                }
            }
        }
    }, 1000);

    io.on('connection', (socket) => {
        // console.log(`Connected: ${socket.id}`);

        socket.on('create-room', ({ name, startingChips, anteAmount }, cb) => {
            const room = createRoom(socket.id, name, startingChips, anteAmount);
            socket.join(room.code);
            cb({ ok: true, room: publicRoom(room) });
        });

        socket.on('rejoin-room', ({ code, name }, cb) => {
            const room = getRoom(code);
            if (!room) return cb({ error: 'Room not found' });
            if (room.state !== 'lobby') return cb({ error: 'Cannot join game in progress' });

            // Player already here? Update socket ID
            const existing = room.players.find(p => p.name === name);
            if (existing) {
                if (room.hostId === existing.id) room.hostId = socket.id;
                existing.id = socket.id;
                existing.disconnected = false; // they're back!
            } else {
                if (room.players.length >= 4) return cb({ error: 'Room is full' });
                room.players.push({ id: socket.id, name, chips: room.startingChips, score: 0, ready: false, isBot: false });
            }

            socket.join(room.code);
            io.to(room.code).emit('room-update', publicRoom(room));
            cb({ ok: true, room: publicRoom(room) });
        });

        socket.on('join-room', ({ code, name }, cb) => {
            const room = getRoom(code);
            if (!room) return cb({ error: 'Room not found' });
            if (room.players.length >= 4) return cb({ error: 'Room is full' });

            if (room.state === 'playing') {
                // Join as spectator — will become a full player next round
                const existingIdx = room.players.findIndex(p => p.name === name);
                if (existingIdx !== -1) {
                    room.players[existingIdx].id = socket.id;
                } else {
                    room.players.push({ id: socket.id, name, chips: room.startingChips, score: 0, isBot: false, spectator: true });
                }
                socket.join(room.code);
                io.to(room.code).emit('room-update', publicRoom(room));
                // Send game-started so lobby.js navigates to game.html
                socket.emit('game-started', { hand: [], myId: socket.id, room: publicRoom(room), spectator: true });
                // Then send current game state so they can watch
                socket.emit('game-state', buildPublicState(room));
                return cb({ ok: true, room: publicRoom(room), spectator: true });
            }

            if (room.state !== 'lobby') return cb({ error: 'Game in progress' });

            // Normal lobby join
            const existingIdx = room.players.findIndex(p => p.name === name);
            if (existingIdx !== -1) {
                room.players[existingIdx].id = socket.id;
            } else {
                room.players.push({ id: socket.id, name, chips: room.startingChips, score: 0, ready: false, isBot: false });
            }

            socket.join(room.code);
            io.to(room.code).emit('room-update', publicRoom(room));
            cb({ ok: true, room: publicRoom(room) });
        });

        socket.on('start-game', ({ code }, cb) => {
            const room = getRoom(code);
            if (!room) return cb({ error: 'Room not found' });
            if (room.hostId !== socket.id) return cb({ error: 'Only host can start' });

            // Convert any spectators to full players before counting
            room.players.forEach(p => { if (p.spectator) delete p.spectator; });

            if (room.players.length < 2) return cb({ error: 'Need at least 2 players' });

            const game = startGame(room);

            // Send private hands
            room.players.forEach(p => {
                const playerSocket = io.sockets.sockets.get(p.id);
                if (playerSocket) {
                    playerSocket.emit('game-started', {
                        hand: game.hands[p.id],
                        myId: p.id,
                        room: publicRoom(room),
                    });
                }
            });

            // Broadcast public state
            io.to(code).emit('game-state', buildPublicState(room));
            cb({ ok: true });

            // Check for immediate win (Tới Trắng)
            if (game.toiTrangWinner) {
                const winnerName = room.players.find(p => p.id === game.toiTrangWinner).name;
                io.to(code).emit('toast', { msg: `🎉 TỚI TRẮNG! ${winnerName} won instantly with ${game.toiTrangReason}!`, type: 'success' });

                setTimeout(() => {
                    const settlement = settleRound(room);
                    io.to(code).emit('round-over', {
                        ...settlement,
                        players: room.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, score: p.score })),
                    });
                    if (settlement.gameWinner) {
                        io.to(code).emit('game-over', {
                            winnerId: settlement.gameWinner,
                            players: room.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, score: p.score })),
                        });
                    }
                }, 2500); // give them time to read the toast
                return; // Skip bot turn scheduling
            }

            // Trigger bot turn if next player is a bot
            scheduleBotTurn(room);
        });

        socket.on('play-cards', ({ code, cardIds }, cb) => {
            const room = getRoom(code);
            if (!room || room.state !== 'playing') return cb({ error: 'No active game' });
            if (room.game.currentTurn !== socket.id) return cb({ error: 'Not your turn' });

            const result = applyPlay(room, socket.id, cardIds);
            if (result.error) return cb({ error: result.error });

            if (result.roundOver) {
                const settlement = settleRound(room);
                io.to(code).emit('round-over', {
                    ...settlement,
                    players: room.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, score: p.score })),
                });
                if (settlement.gameWinner) {
                    io.to(code).emit('game-over', {
                        winnerId: settlement.gameWinner,
                        players: room.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, score: p.score })),
                    });
                }
                return cb({ ok: true });
            }

            // Update the player's private hand
            socket.emit('hand-update', { hand: room.game.hands[socket.id] });

            io.to(code).emit('game-state', buildPublicState(room));
            cb({ ok: true });
            scheduleBotTurn(room);
        });

        socket.on('pass', ({ code }, cb) => {
            const room = getRoom(code);
            if (!room || room.state !== 'playing') return cb({ error: 'No active game' });
            if (room.game.currentTurn !== socket.id) return cb({ error: 'Not your turn' });
            if (!room.game.table) return cb({ error: 'Cannot pass on empty table' });

            applyPass(room, socket.id);
            io.to(code).emit('game-state', buildPublicState(room));
            cb({ ok: true });
            scheduleBotTurn(room);
        });

        socket.on('rejoin-game', ({ code, name }, cb) => {
            const room = getRoom(code);
            if (!room) return cb({ error: 'Room not found' });

            // Find player by name (since socket ID changed on page reload)
            let player = room.players.find(p => p.name === name);
            if (!player) return cb({ error: 'Player not found in room' });

            // Update socket ID
            const oldId = player.id;
            player.id = socket.id;
            socket.join(room.code);

            // Update game state references only for active (non-spectator) players
            if (room.game && !player.spectator) {
                const g = room.game;
                if (g.hands[oldId]) { g.hands[socket.id] = g.hands[oldId]; delete g.hands[oldId]; }
                if (g.currentTurn === oldId) g.currentTurn = socket.id;
                if (g.table && g.table.playerId === oldId) g.table.playerId = socket.id;
                if (g.activePlayers) g.activePlayers = g.activePlayers.map(id => id === oldId ? socket.id : id);
                if (g.finishOrder) g.finishOrder = g.finishOrder.map(id => id === oldId ? socket.id : id);
                if (g.passedPlayers) g.passedPlayers = g.passedPlayers.map(id => id === oldId ? socket.id : id);
            }

            if (room.hostId === oldId) room.hostId = socket.id;

            const hand = (room.game && !player.spectator) ? room.game.hands[socket.id] || [] : [];
            cb({ ok: true, hand, room: publicRoom(room), spectator: !!player.spectator });

            if (room.game) {
                socket.emit('game-state', buildPublicState(room));
            }
        });

        socket.on('new-round', ({ code }, cb) => {
            const room = getRoom(code);
            if (!room) return cb({ error: 'Room not found' });
            if (room.hostId !== socket.id) return cb({ error: 'Only host can start next round' });
            if (room.state !== 'lobby') return cb({ error: 'Round already in progress' });

            // Convert spectators to full players
            room.players.forEach(p => { if (p.spectator) delete p.spectator; });

            // Remove broke players
            room.players = room.players.filter(p => p.chips >= room.anteAmount);
            if (room.players.length < 2) return cb({ error: 'Not enough players with chips' });

            const game = startGame(room);
            room.players.forEach(p => {
                const playerSocket = io.sockets.sockets.get(p.id);
                if (playerSocket) {
                    playerSocket.emit('game-started', {
                        hand: game.hands[p.id],
                        myId: p.id,
                        room: publicRoom(room),
                    });
                }
            });

            io.to(code).emit('game-state', buildPublicState(room));
            if (cb) cb({ ok: true });

            if (game.toiTrangWinner) {
                const winnerName = room.players.find(p => p.id === game.toiTrangWinner).name;
                io.to(code).emit('toast', { msg: `🎉 TỚI TRẮNG! ${winnerName} won instantly with ${game.toiTrangReason}!`, type: 'success' });

                setTimeout(() => {
                    const settlement = settleRound(room);
                    io.to(code).emit('round-over', {
                        ...settlement,
                        players: room.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, score: p.score })),
                    });
                    if (settlement.gameWinner) {
                        io.to(code).emit('game-over', {
                            winnerId: settlement.gameWinner,
                            players: room.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, score: p.score })),
                        });
                    }
                }, 2500);
                return;
            }

            scheduleBotTurn(room);
        });

        socket.on('play-again', ({ code }, cb) => {
            const room = getRoom(code);
            if (!room) return cb({ error: 'Room not found' });
            if (room.hostId !== socket.id) return cb({ error: 'Only host can start a new game' });
            if (room.state !== 'lobby') return cb({ error: 'Game already in progress' });

            // Convert spectators to full players
            room.players.forEach(p => { if (p.spectator) delete p.spectator; });

            // Reset scores & remove broke players
            room.players = room.players.filter(p => p.chips >= room.anteAmount);
            room.players.forEach(p => p.score = 0);

            if (room.players.length < 2) return cb({ error: 'Not enough players with chips' });

            const game = startGame(room);
            room.players.forEach(p => {
                const playerSocket = io.sockets.sockets.get(p.id);
                if (playerSocket) {
                    playerSocket.emit('game-started', {
                        hand: game.hands[p.id],
                        myId: p.id,
                        room: publicRoom(room),
                    });
                }
            });

            io.to(code).emit('game-state', buildPublicState(room));
            if (cb) cb({ ok: true });

            if (game.toiTrangWinner) {
                const winnerName = room.players.find(p => p.id === game.toiTrangWinner).name;
                io.to(code).emit('toast', { msg: `🎉 TỚI TRẮNG! ${winnerName} won instantly with ${game.toiTrangReason}!`, type: 'success' });

                setTimeout(() => {
                    const settlement = settleRound(room);
                    io.to(code).emit('round-over', {
                        ...settlement,
                        players: room.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, score: p.score })),
                    });
                    if (settlement.gameWinner) {
                        io.to(code).emit('game-over', {
                            winnerId: settlement.gameWinner,
                            players: room.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, score: p.score })),
                        });
                    }
                }, 2500);
                return;
            }

            scheduleBotTurn(room);
        });

        socket.on('add-bot', ({ code }, cb) => {
            const room = getRoom(code);
            if (!room) return cb({ error: 'Room not found' });
            if (room.hostId !== socket.id) return cb({ error: 'Only host can add bots' });
            if (room.players.length >= 4) return cb({ error: 'Room is full (max 4)' });
            if (room.state !== 'lobby') return cb({ error: 'Game already in progress' });

            const usedNames = room.players.map(p => p.name);
            const botName = BOT_NAMES.find(n => !usedNames.includes(`🤖 ${n}`)) || `Bot ${room.players.length}`;
            const bot = {
                id: generateBotId(),
                name: `🤖 ${botName}`,
                chips: room.startingChips,
                score: 0,
                isBot: true,
            };
            room.players.push(bot);
            io.to(code).emit('room-update', publicRoom(room));
            cb({ ok: true });
        });

        socket.on('remove-bot', ({ code }, cb) => {
            const room = getRoom(code);
            if (!room) return cb({ error: 'Room not found' });
            if (room.hostId !== socket.id) return cb({ error: 'Only host can remove bots' });
            if (room.state !== 'lobby') return cb({ error: 'Game already in progress' });

            const botIdx = room.players.findIndex(p => p.isBot);
            if (botIdx === -1) return cb({ error: 'No bots to remove' });
            room.players.splice(botIdx, 1);
            io.to(code).emit('room-update', publicRoom(room));
            cb({ ok: true });
        });

        socket.on('disconnect', () => {
            const rooms = getAllRooms();
            for (const [code, room] of Object.entries(rooms)) {
                const idx = room.players.findIndex(p => p.id === socket.id);
                if (idx === -1) continue;

                if (room.state === 'playing' && room.game) {
                    room.players[idx].disconnected = true;
                } else {
                    // Promote host BEFORE splice so seat-order search still works
                    if (room.hostId === socket.id) {
                        if (!promoteHost(room, socket.id)) {
                            deleteRoom(code);
                            continue;
                        }
                    }
                    room.players.splice(idx, 1);
                    if (room.players.length === 0) {
                        deleteRoom(code);
                    } else {
                        io.to(code).emit('room-update', publicRoom(room));
                    }
                }
            }
        });

        // Phase 3: Meme Reactor
        socket.on('meme', ({ code, meme }, cb = () => { }) => {
            const room = getRoom(code);
            if (!room) return cb({ error: 'Room not found' });

            const player = room.players.find(p => p.id === socket.id);
            if (!player) return cb({ error: 'Not in room' });

            // Broadcast reaction to everyone in the room
            io.to(code).emit('meme', { from: player.name, fromId: player.id, meme });
            cb({ ok: true });
        });

        socket.on('leave-room', ({ code }, cb = () => { }) => {
            const room = getRoom(code);
            if (!room) return cb({ error: 'Room not found' });

            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx === -1) return cb({ error: 'Not in room' });

            // Promote host BEFORE splice so seat-order search still works
            if (room.hostId === socket.id) {
                if (!promoteHost(room, socket.id)) {
                    // No human players left to promote — delete room
                    socket.leave(code);
                    deleteRoom(code);
                    return cb({ ok: true });
                }
            }

            socket.leave(code);
            room.players.splice(idx, 1);

            // If only bots remain after the splice, delete room
            const humanPlayers = room.players.filter(p => !p.isBot);
            if (humanPlayers.length === 0) {
                deleteRoom(code);
                return cb({ ok: true });
            }

            // Check if game in progress to auto-fold them
            if (room.state === 'playing' && room.game) {
                // Remove from active player loops
                room.game.activePlayers = room.game.activePlayers.filter(id => id !== socket.id);
                delete room.game.hands[socket.id];

                // If it was their turn, pass turn
                if (room.game.currentTurn === socket.id) {
                    applyPass(room, socket.id);
                }

                // If game is now empty or only bots, end it
                if (humanPlayers.length === 0 || room.game.activePlayers.length <= 1) {
                    room.state = 'lobby';
                    room.game = null;
                    io.to(code).emit('game-over', {
                        winnerId: room.players[0] ? room.players[0].id : null,
                        players: room.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, score: p.score })),
                    });
                } else {
                    io.to(code).emit('game-state', buildPublicState(room));
                }
            }

            io.to(code).emit('room-update', publicRoom(room));
            cb({ ok: true });
        });
    });
}

module.exports = { setupSocketHandlers };
