# Tiến Lên · Thirteen Card Game

> Real-time multiplayer implementation of the Vietnamese card game **Tiến Lên (Thirteen)** — playable over LAN or the internet with up to 4 players and AI bots.

[![Build & Push to GHCR](https://github.com/darktaiga01/thirteen-card-game/actions/workflows/docker.yml/badge.svg)](https://github.com/darktaiga01/thirteen-card-game/actions/workflows/docker.yml)
![Node](https://img.shields.io/badge/node-20-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Screenshots

| Lobby | Game (Desktop) | Game (Mobile) |
|-------|---------------|---------------|
| _(coming soon)_ | _(coming soon)_ | _(coming soon)_ |

---

## Features

- 🃏 **Full Southern-rules Tiến Lên** — singles, pairs, triples, quads, sequences, double sequences, bombs, and instant-win hands
- 🌐 **Real-time multiplayer** via Socket.io — works on LAN or behind a reverse proxy
- 🤖 **AI Bots** — fill empty seats with named bots that play with realistic heuristics
- 💰 **Chip economy** — ante per round, pot distribution, cumulative scoring up to 10 points
- 🔁 **Auto-reconnect** — page refresh restores your hand and chips via `localStorage`
- 📱 **Responsive UI** — fixed poker-table layout on all screen sizes (portrait, landscape, desktop)
- 🖥️ **Fullscreen mode** — toggle from the HUD on any device
- 🎭 **Meme reactions** — in-game emoji reactions (Bị chặt, On fire, GG EZ…)
- 📋 **Play log** — full history of every play in the round

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 |
| Server | Express 4 |
| Real-time | Socket.io 4 |
| Frontend | Vanilla HTML / CSS / JS |
| Container | Docker (node:20-alpine) |
| CI/CD | GitHub Actions → GHCR |

---

## Getting Started

### Prerequisites

- [Node.js 20+](https://nodejs.org/) or [Docker](https://www.docker.com/)

### Run with Node

```bash
git clone https://github.com/darktaiga01/thirteen-card-game.git
cd thirteen-card-game
npm install
npm start
```

The server prints both a **local** and a **LAN URL** on startup:

```
Local  → http://localhost:3000
LAN    → http://192.168.x.x:3000
```

### Run with Docker

```bash
docker run -p 3000:3000 ghcr.io/darktaiga01/thirteen-card-game:latest
```

### Run with Docker Compose

```yaml
services:
  tien-len:
    image: ghcr.io/darktaiga01/thirteen-card-game:latest
    ports:
      - "3000:3000"
    restart: unless-stopped
```

```bash
docker compose up -d
```

---

## How to Play

1. **Host** — open the app, enter a name, click **Create Room**, adjust chips/ante if needed
2. **Friends** — open the LAN URL on their device, enter name + 4-letter room code, click **Join**
3. Host can add **AI Bots** to fill empty seats (up to 4 players total)
4. Host clicks **▶ Start Game** when ready
5. First player to reach **10 points** wins the game

See [GAMEPLAY.md](GAMEPLAY.md) for the full rule set.

---

## Game Rules (Summary)

### Card Ranking

```
3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2
Suits:  ♠ < ♣ < ♦ < ♥
```

The **2 (Heo)** is the highest card and cannot be used in sequences.

### Valid Combinations

| Type | Description |
|------|-------------|
| Single | Any 1 card |
| Pair | 2 cards of the same rank |
| Triple | 3 cards of the same rank |
| Quad | 4 cards of the same rank |
| Sequence | 3+ consecutive ranks (no 2s) |
| Double Sequence | 3+ consecutive pairs |

Each combination must match the **same type and length** as the table, with a higher top card.

### Bombs (Chặt Heo)

| Bomb | Beats |
|------|-------|
| Quad / Double Sequence of 3 | Single 2 |
| Double Sequence of 4+ | Pair of 2s |
| Double Sequence of 5+ | Three 2s |

### Instant Win (Tới Trắng)

- 🐉 Dragon Sequence (3 → A, 12 ranks)
- 🃏 Four 2s (Tứ Quý 2)
- 🂠 Six Pairs (6 Đôi)

### Chip Payouts

| Finish | Points | Pot share |
|--------|--------|-----------|
| 1st | 3 pts | 60% |
| 2nd | 2 pts | 25% |
| 3rd | 1 pt  | 15% |
| 4th | 0 pts | 0% |

---

## Project Structure

```
thirteen-card-game/
├── public/
│   ├── index.html          # Lobby
│   ├── game.html           # Game board
│   ├── css/
│   │   ├── lobby.css
│   │   └── game.css
│   └── js/
│       ├── lobby.js
│       ├── game.js
│       └── effects.js      # VFX & animations
├── src/
│   ├── game/
│   │   ├── GameLogic.js    # Hand validation & ranking
│   │   ├── RoomManager.js  # Room lifecycle
│   │   └── BotAI.js        # AI heuristics
│   └── sockets/
│       └── socketHandlers.js
├── server.js
├── Dockerfile
└── .github/workflows/
    └── docker.yml          # Build & push to GHCR
```

---

## Docker Image

Images are automatically built and pushed to [GitHub Container Registry](https://ghcr.io/darktaiga01/thirteen-card-game) on every push to `main`.

| Tag | Description |
|-----|-------------|
| `latest` | Most recent build from `main` |
| `sha-<commit>` | Pinned to a specific commit |

```bash
# Pull latest
docker pull ghcr.io/darktaiga01/thirteen-card-game:latest
```

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/)
4. Open a Pull Request

---

## License

MIT © [darktaiga01](https://github.com/darktaiga01)
