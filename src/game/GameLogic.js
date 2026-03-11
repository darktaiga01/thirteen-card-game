const SUITS = ['S', 'C', 'D', 'H']; // Spades < Clubs < Diamonds < Hearts
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUIT_NAMES = { S: '♠', C: '♣', D: '♦', H: '♥' };

function cardValue(card) {
    return RANKS.indexOf(card.rank) * 4 + SUITS.indexOf(card.suit);
}

function cardId(card) {
    return `${card.rank}${card.suit}`;
}

function createDeck() {
    const deck = [];
    for (const rank of RANKS) {
        for (const suit of SUITS) {
            deck.push({ rank, suit, id: `${rank}${suit}` });
        }
    }
    return deck;
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function sortCards(cards) {
    return [...cards].sort((a, b) => cardValue(a) - cardValue(b));
}

// ─── Combination Detection ────────────────────────────────────────────────────

function rankIndex(r) { return RANKS.indexOf(r); }
function suitIndex(s) { return SUITS.indexOf(s); }

function getComboType(cards) {
    const n = cards.length;
    const sorted = sortCards(cards);
    const ranks = sorted.map(c => c.rank);
    const rankIdxs = ranks.map(rankIndex);

    if (n === 1) return { type: 'single', top: sorted[0] };

    // All same rank?
    const allSameRank = ranks.every(r => r === ranks[0]);
    if (allSameRank) {
        if (n === 2) return { type: 'pair', top: sorted[n - 1] };
        if (n === 3) return { type: 'triple', top: sorted[n - 1] };
        if (n === 4) return { type: 'quad', top: sorted[n - 1] };
    }

    // Sequence? (no 2s allowed)
    if (n >= 3 && !ranks.includes('2')) {
        // Check single sequence: each rank is consecutive
        const uniqueRanks = [...new Set(rankIdxs)].sort((a, b) => a - b);
        if (uniqueRanks.length === n) {
            let isSeq = true;
            for (let i = 1; i < uniqueRanks.length; i++) {
                if (uniqueRanks[i] !== uniqueRanks[i - 1] + 1) { isSeq = false; break; }
            }
            if (isSeq) return { type: 'sequence', top: sorted[n - 1], length: n };
        }

        // Double sequence? n must be even, n >= 6
        if (n >= 6 && n % 2 === 0) {
            const pairs = {};
            for (const ri of rankIdxs) pairs[ri] = (pairs[ri] || 0) + 1;
            if (Object.values(pairs).every(c => c === 2)) {
                const pairRanks = Object.keys(pairs).map(Number).sort((a, b) => a - b);
                let isDblSeq = true;
                for (let i = 1; i < pairRanks.length; i++) {
                    if (pairRanks[i] !== pairRanks[i - 1] + 1) { isDblSeq = false; break; }
                }
                if (isDblSeq) return { type: 'double-sequence', top: sorted[n - 1], length: n / 2 };
            }
        }
    }

    return null; // invalid combo
}

function checkToiTrang(hand) {
    const ranks = hand.map(c => c.rank);

    // 1. Sảnh Rồng (Sequence from 3 to A - 12 distinct ranks)
    const hasSanhRong = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].every(r => ranks.includes(r));
    if (hasSanhRong) return 'Sảnh Rồng (Dragon Sequence)';

    // 2. Tứ Quý 2 (Four 2s)
    const twos = ranks.filter(r => r === '2').length;
    if (twos === 4) return 'Tứ Quý 2 (Four 2s)';

    // 3. 6 Đôi (6 Pairs)
    const rankCounts = {};
    ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
    let pairs = 0;
    Object.values(rankCounts).forEach(count => {
        pairs += Math.floor(count / 2);
    });
    if (pairs >= 6) return '6 Đôi (6 Pairs)';

    return null;
}

function compareCards(a, b) {
    // Returns positive if a > b
    const rv = rankIndex(a.rank) - rankIndex(b.rank);
    if (rv !== 0) return rv;
    return suitIndex(a.suit) - suitIndex(b.suit);
}

// Can `challenger` beat `current`? Both are valid combos.
function canBeat(current, challenger) {
    const c = current.type;
    const ch = challenger.type;

    // Same type, compare top cards
    if (c === ch) {
        if ((c === 'sequence' || c === 'double-sequence') && challenger.length !== current.length) return false;
        return compareCards(challenger.top, current.top) > 0;
    }

    // Bomb rules: playing on single 2
    if (c === 'single' && current.top.rank === '2') {
        if (ch === 'quad') return true;
        if (ch === 'double-sequence' && challenger.length >= 3) return true;
    }

    // Pair of 2s
    if (c === 'pair' && current.top.rank === '2') {
        if (ch === 'double-sequence' && challenger.length >= 4) return true;
    }

    // Triple 2s
    if (c === 'triple' && current.top.rank === '2') {
        if (ch === 'double-sequence' && challenger.length >= 5) return true;
    }

    // Higher bomb of same type
    if (c === ch && (c === 'quad' || c === 'double-sequence')) {
        if (c === 'double-sequence' && challenger.length >= current.length) {
            return compareCards(challenger.top, current.top) > 0;
        }
    }

    return false;
}

module.exports = {
    createDeck,
    shuffle,
    sortCards,
    cardValue,
    cardId,
    getComboType,
    checkToiTrang,
    canBeat,
    compareCards,
    rankIndex,
};
