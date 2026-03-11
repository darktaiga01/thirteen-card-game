const { sortCards, rankIndex, getComboType, canBeat, cardValue } = require('./GameLogic');

function isBot(room, playerId) {
    const p = room.players.find(pl => pl.id === playerId);
    return p && p.isBot;
}

function findAllCombos(hand) {
    const combos = [];
    const sorted = sortCards(hand);
    const n = sorted.length;

    // Singles
    for (const c of sorted) combos.push([c]);

    // Group by rank
    const byRank = {};
    for (const c of sorted) {
        if (!byRank[c.rank]) byRank[c.rank] = [];
        byRank[c.rank].push(c);
    }

    // Pairs, triples, quads
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

    // Sequences (3+), no 2s
    const rankGroups = Object.keys(byRank)
        .filter(r => r !== '2')
        .map(r => ({ rank: r, idx: rankIndex(r), cards: byRank[r] }))
        .sort((a, b) => a.idx - b.idx);

    for (let start = 0; start < rankGroups.length; start++) {
        const seq = [rankGroups[start]];
        for (let end = start + 1; end < rankGroups.length; end++) {
            if (rankGroups[end].idx !== rankGroups[end - 1].idx + 1) break;
            seq.push(rankGroups[end]);
            if (seq.length >= 3) {
                // Pick the lowest card from each rank group for the sequence
                combos.push(seq.map(g => g.cards[0]));
            }
        }
    }

    // Double sequences (6+), no 2s
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

function determineBotPlay(game, botId) {
    const hand = game.hands[botId];
    if (!hand || hand.length === 0) return null;

    const allCombos = findAllCombos(hand);

    if (!game.table) {
        // Empty table: play the lowest valid combo
        // First round: must include 3♠
        let choices;
        if (game.firstRound) {
            choices = allCombos.filter(c => c.some(card => card.rank === '3' && card.suit === 'S'));
        } else {
            choices = allCombos;
        }

        if (choices.length === 0) return null; // shouldn't happen

        // Prefer multi-card combos to shed cards faster, then lowest value
        // Priority: more cards > lower max value
        choices.sort((a, b) => {
            // Prefer combos with more cards (shed faster)
            if (b.length !== a.length) return b.length - a.length;
            // Then by lowest max card value
            const va = Math.max(...a.map(cardValue));
            const vb = Math.max(...b.map(cardValue));
            return va - vb;
        });

        // Play the lowest combo (avoid 2s if possible)
        const noTwos = choices.filter(c => c.every(card => card.rank !== '2'));
        const pick = (noTwos.length > 0 ? noTwos : choices)[0];
        return { action: 'play', cardIds: pick.map(c => c.id) };
    } else {
        // Table has a combo — try to beat it
        const tableCombo = game.table;
        const validPlays = allCombos
            .map(cards => ({ cards, combo: getComboType(cards) }))
            .filter(x => x.combo && canBeat(tableCombo, x.combo))
            .sort((a, b) => {
                const va = Math.max(...a.cards.map(cardValue));
                const vb = Math.max(...b.cards.map(cardValue));
                return va - vb;
            });

        if (validPlays.length === 0) {
            return { action: 'pass' };
        }

        // Play lowest valid option (avoid 2s if possible)
        const noTwos = validPlays.filter(x => x.cards.every(c => c.rank !== '2'));
        const pick = (noTwos.length > 0 ? noTwos : validPlays)[0];
        return { action: 'play', cardIds: pick.cards.map(c => c.id) };
    }
}

module.exports = { isBot, findAllCombos, determineBotPlay };
