# Tiến Lên (Thirteen) LAN Multiplayer

This is a Node.js + Socket.IO implementation of the popular Vietnamese card game Tiến Lên (Thirteen). It features real-time multiplayer over LAN, a virtual betting system, AI bots for single-player testing, and a resilient reconnection system.

## Project Context

This project was built to allow players on the same local network (LAN) to play Tiến Lên together using their phones/computers. 
- **Tech Stack:** Node.js, Express, Socket.IO (Backend) / Vanilla HTML, CSS, JavaScript (Frontend).
- **Features:** Room-based multiplayer, Host controls, AI Bots (🤖), virtual chips betting, and page-refresh reconnection (using `localStorage`).

## Game Rules (Southern Style)

The objective is to be the first to shed all 13 cards from your hand.

### Card Ranking
- **Rank:** 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2 
- **Suit:** Spades (♠) < Clubs (♣) < Diamonds (♦) < Hearts (♥)
- Note: A 5♠ beats a 4♥. Suit only matters if numbers are tied (e.g. 5♥ beats 5♠).
- The **2 (Heo)** is the highest card in the deck and cannot be used in normal sequences.

### Valid Combinations
Players must beat the current combo on the table with the **exact same type and length**, but with a higher top card.
1. **Single:** 1 card (e.g., 5♠)
2. **Pair:** 2 cards of same rank (e.g., 5♠ 5♥)
3. **Three of a Kind (Triple):** 3 cards of same rank
4. **Four of a Kind (Quad):** 4 cards of same rank (also acts as a bomb)
5. **Sequence:** 3+ consecutive cards (e.g., 4♥ 5♠ 6♦). To beat a sequence, you must play a sequence of the **exact same length** with a higher top card.
6. **Double Sequence:** 3+ consecutive pairs (e.g., 3♠3♥ 4♣4♦ 5♠5♥). Must also match exact length to beat.

### The "Bomb" Rules (Chặt Heo)
The 2 is powerful, but can be chopped (chặt) by specific combinations:
- **Four of a Kind (Tứ Quý):** Can beat a single 2. 
- **Double Sequence of 3 (3 Đôi Thông):** Can beat a single 2.
- **Double Sequence of 4 (4 Đôi Thông):** Can beat a pair of 2s.
- **Double Sequence of 5 (5 Đôi Thông):** Can beat three 2s.
- *Note: A higher bomb can beat a lower bomb of the same type (e.g., Tứ Quý 8 beats Tứ Quý 5).*

### Passing (Bỏ Lượt)
If you cannot or choose not to beat the current table, you must Pass. 
- Passing locks you out of the current trick completely.
- When everyone else passes, the last player to play wins the trick, the table clears, and they can start a new sequence with any combo.
- If the player who wins the trick played their very last card, the right to start the new trick passes smoothly to the next active player.

### Tới Trắng (Instant Win)
If a player is dealt one of the following special hands, the game ends immediately, and they are declared the winner of the entire pot:
1. **Sảnh Rồng (Dragon Sequence):** Sequence from 3 to A (12 distinct ranks).
2. **Tứ Quý 2:** Four 2s.
3. **6 Đôi:** 6 pairs of any rank.

## Betting & Scoring System

- **Antes & Pot:** When a game starts, an Ante (e.g., 100 chips) is deducted from all players and placed in the Pot (e.g., 400 chips).
- **Points:** Players earn points based on the order they finish their hand:
  - 1st Place: 3 points
  - 2nd Place: 2 points
  - 3rd Place: 1 point
  - 4th Place: 0 points
- **Chip Payouts:** The pot is distributed at the end of the round based on finish order:
  - 1st: 60% of Pot
  - 2nd: 25% of Pot
  - 3rd: 15% of Pot
  - 4th: 0%
- **Game Winner:** The overarching game continues until a player reaches **10 points**. Once someone hits 10+ points (and is in the clear lead), they are crowned the overall Game Winner.

## How to Run & Play

1. Run `npm start` in the terminal.
2. The console will print the Local URL (for you) and the LAN URL (for devices on your WiFi).
3. **Host:** Open the app, enter a name, click "Create Room". Adjust chips and antes if desired.
4. **Friends:** Open the LAN URL on their phones, enter name + 4-letter Room Code, click "Join Room". 
5. **AI Bots:** The Host can click "🤖 Add Bot" to fill empty seats with AI players (Lan, Minh, Hùng, etc.). Bots play automatically with realistic strategies (preferring combos over singles).
6. **Reconnection:** If anyone accidentally refreshes their page (F5), they will automatically reconnect and their hand/chips will be perfectly restored.
