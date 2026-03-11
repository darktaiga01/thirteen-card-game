# Codebase Structure Enhancement Plan

## Overview
The `server.js` file currently handles game rules, state management, socket events, and bot AI all in one 900+ line file. This refactor will break it down into modular components to improve maintainability and readability without altering the existing functionality.

## Project Type
BACKEND (Node.js)

## Success Criteria
- `server.js` is simplified into an entry point.
- Game logic, state management, and socket handling are decoupled.
- The game continues to work exactly as it does currently.

## Tech Stack
- Node.js (CommonJS or ES Modules)
- Socket.IO

## File Structure
```
├── server.js (Entry point & Express setup)
└── src/
    ├── game/
    │   ├── GameLogic.js (Card ranking, combos, beating logic, Tới Trắng)
    │   ├── RoomManager.js (Room state, game progression, pass tracking)
    │   └── BotAI.js (Bot decision making)
    └── sockets/
        └── socketHandlers.js (Socket.IO event wiring)
```

## Task Breakdown

### Task 1: Extract Game Logic
- **Agent**: `backend-specialist`
- **Input**: `server.js`
- **Output**: `src/game/GameLogic.js`
- **Verify**: Exports correctly expose `compareCards`, `getComboType`, `canBeat`, `checkToiTrang`.

### Task 2: Extract Bot AI
- **Agent**: `backend-specialist`
- **Input**: `server.js`
- **Output**: `src/game/BotAI.js`
- **Verify**: `botPlay`, `findAllCombos`, `scheduleBotTurn` are successfully extracted.

### Task 3: Extract Room Manager
- **Agent**: `backend-specialist`
- **Input**: `server.js`
- **Output**: `src/game/RoomManager.js`
- **Verify**: Moving `createRoom`, `applyPlay`, `applyPass`, `startGame`, etc.

### Task 4: Extract Sockets & Wire Up
- **Agent**: `backend-specialist`
- **Input**: `server.js`
- **Output**: `src/sockets/socketHandlers.js` & updated `server.js`
- **Verify**: Server starts properly with `npm start` and clients can connect.

## Phase X: Verification
- [x] Code properly linted/checked.
- [x] Server boots with `npm start` successfully.
- [x] A complete game round works normally (including bots and passing).

## ✅ PHASE X COMPLETE
- Server: ✅ `npm start` successful
- Date: 2026-03-10
