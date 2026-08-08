/**
 * Improved AI for Kentucky Rook — single-player mode
 * Implements smarter bidding, widow discard, trump selection, and card play.
 */

import { Card, Color, Difficulty, GameState } from '../engine/types';
import { isPointCard, isValidPlay, canFollowSuit, getCardRank, getTrickWinner } from '../engine/tricks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLORS: Color[] = ['Black', 'Red', 'Green', 'Yellow'];

// ---------------------------------------------------------------------------
// Hand evaluation helpers
// ---------------------------------------------------------------------------

/** Count how many cards of each color are in the hand (excluding Rook) */
function colorCounts(hand: Card[]): Record<Color, number> {
  const counts: Record<Color, number> = { Black: 0, Red: 0, Green: 0, Yellow: 0 };
  for (const c of hand) {
    if (c.color !== 'Rook') counts[c.color as Color]++;
  }
  return counts;
}

/** Sum of rank values for a given color in hand */
function colorRankSum(hand: Card[], color: Color): number {
  return hand
    .filter(c => c.color === color)
    .reduce((s, c) => {
      const v = c.value as number;
      return s + (v === 1 ? 15 : v);
    }, 0);
}

/** Sort cards ascending by point value then numeric rank (lowest first) */
function sortAscending(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.points !== b.points) return a.points - b.points;
    const va = a.value === 'Rook' ? 20 : (a.value as number);
    const vb = b.value === 'Rook' ? 20 : (b.value as number);
    return va - vb;
  });
}

/** Sort cards descending by rank (highest first) */
function sortDescending(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const ra = a.value === 'Rook' ? 20 : (a.value as number === 1 ? 15 : a.value as number);
    const rb = b.value === 'Rook' ? 20 : (b.value as number === 1 ? 15 : b.value as number);
    return rb - ra;
  });
}

/** The color the AI has the most cards in; tiebreak by rank sum */
function dominantColor(hand: Card[]): Color {
  const counts = colorCounts(hand);
  return COLORS.reduce((best, c) => {
    if (counts[c] > counts[best]) return c;
    if (counts[c] === counts[best] && colorRankSum(hand, c) > colorRankSum(hand, best)) return c;
    return best;
  }, COLORS[0]);
}

/** Compute a hand strength score for bidding purposes */
function handStrength(hand: Card[]): number {
  const counts = colorCounts(hand);
  // Find the most likely trump color (most cards)
  const likelyTrump = dominantColor(hand);

  let strength = 0;
  for (const c of hand) {
    // Points cards contribute their point value
    strength += c.points;
    // High cards (1, 14, 13) get a bonus
    if (c.value !== 'Rook') {
      const v = c.value as number;
      if (v === 1 || v === 14 || v === 13) strength += 3;
    }
    // Trump cards (in likely trump color) get a bonus
    if (c.color === likelyTrump || c.color === 'Rook') strength += 5;
  }
  return strength;
}

// ---------------------------------------------------------------------------
// Bidding action
// ---------------------------------------------------------------------------

function aiBid(state: GameState, seat: number): number | 'pass' {
  const hand = state.players[seat].hand;
  const { currentBid, currentBidder, dealer, lawedOff } = state.bidState;
  const strength = handStrength(hand);
  const counts = colorCounts(hand);
  const hasLongSuit = COLORS.some(c => counts[c] >= 4);

  // If lawed off as dealer, must accept 125
  if (lawedOff && seat === dealer) return 125;

  // Opening bid
  if (currentBid === 0) {
    if (strength >= 70 && hasLongSuit) return 125;
    return 'pass';
  }

  // Re-raise: only if very strong and bid is still low
  if (currentBidder !== seat && strength >= 85 && currentBid < 150) {
    const nextBid = currentBid + 5;
    if (nextBid <= 160) return nextBid;
  }

  return 'pass';
}

// ---------------------------------------------------------------------------
// Widow discard action
// ---------------------------------------------------------------------------

/** Returns exactly 5 cards to discard */
function aiDiscard(hand: Card[]): Card[] {
  const dominant = dominantColor(hand);

  // Determine which cards we want to KEEP:
  // 1. All point cards
  // 2. All cards in dominant color
  // 3. High cards (rank 13+) in secondary colors if possible
  const mustKeep = new Set<string>();

  for (const c of hand) {
    if (c.points > 0) mustKeep.add(c.id);          // point cards
    if (c.color === dominant) mustKeep.add(c.id);    // dominant color
    if (c.color !== 'Rook' && c.color !== dominant) {
      const v = c.value as number;
      if (v === 1 || v >= 13) mustKeep.add(c.id);   // high cards in secondary colors
    }
  }

  // Candidates to discard: not in mustKeep
  const discardCandidates = hand.filter(c => !mustKeep.has(c.id));

  // Sort candidates: discard low cards in shortest suits first
  const countsByColor = colorCounts(hand);
  const sorted = sortAscending(discardCandidates).sort((a, b) => {
    // Prefer discarding from shorter suits
    const aCount = a.color === 'Rook' ? 0 : countsByColor[a.color as Color];
    const bCount = b.color === 'Rook' ? 0 : countsByColor[b.color as Color];
    if (aCount !== bCount) return aCount - bCount;
    // Then by lowest rank
    const va = a.value === 'Rook' ? 20 : (a.value as number);
    const vb = b.value === 'Rook' ? 20 : (b.value as number);
    return va - vb;
  });

  if (sorted.length >= 5) return sorted.slice(0, 5);

  // Not enough non-point candidates — we have to discard some "lesser" point cards
  // Pick point cards from secondary colors with lowest value
  const extras = hand
    .filter(c => !discardCandidates.includes(c))
    .filter(c => c.color !== dominant && c.color !== 'Rook')
    .sort((a, b) => a.points - b.points || (a.value as number) - (b.value as number));

  return [...sorted, ...extras].slice(0, 5);
}

// ---------------------------------------------------------------------------
// Trump selection action
// ---------------------------------------------------------------------------

function aiTrump(hand: Card[]): Color {
  return dominantColor(hand);
}

// ---------------------------------------------------------------------------
// Card play helpers
// ---------------------------------------------------------------------------

/** True if seats are on the same team */
function isPartner(seat: number, other: number): boolean {
  return seat % 2 === other % 2;
}

/** Determine the current winning play in the trick */
function currentWinner(trick: { plays: { seat: number; card: Card }[] }, trump: Color): { seat: number; card: Card } | null {
  if (trick.plays.length === 0) return null;
  // Simulate getTrickWinner by finding the best play
  const winningSeat = getTrickWinner({ plays: trick.plays }, trump);
  return trick.plays.find(p => p.seat === winningSeat) ?? null;
}

/** True if playing `card` would win (or keep winning) the trick */
function wouldWin(card: Card, seat: number, trick: { plays: { seat: number; card: Card }[] }, trump: Color): boolean {
  const hypo = { plays: [...trick.plays, { seat, card }] };
  if (hypo.plays.length === 4) {
    return getTrickWinner(hypo, trump) === seat;
  }
  // Partial trick: check if card beats current best
  if (trick.plays.length === 0) return true; // leading
  const best = currentWinner(trick, trump);
  if (!best) return true;
  const bestCard = best.card;
  const cardIsTrump = card.color === 'Rook' || card.color === trump;
  const bestIsTrump = bestCard.color === 'Rook' || bestCard.color === trump;
  if (cardIsTrump && !bestIsTrump) return true;
  if (!cardIsTrump && bestIsTrump) return false;
  if (card.color === bestCard.color || (cardIsTrump && bestIsTrump)) {
    return getCardRank(card, trump) > getCardRank(bestCard, trump);
  }
  return false;
}

/** Count points currently in the trick */
function trickPoints(trick: { plays: { seat: number; card: Card }[] }): number {
  return trick.plays.reduce((s, p) => s + p.card.points, 0);
}

// ---------------------------------------------------------------------------
// Card play action
// ---------------------------------------------------------------------------

function aiPlayCard(state: GameState, seat: number): Card {
  const hand = state.players[seat].hand;
  const trick = state.currentTrick ?? { plays: [] };
  const trump = state.trump!;
  const tricksPlayed = state.completedTricks.length;

  // Filter valid cards
  const valid = hand.filter(c => isValidPlay(c, hand, trick, trump));
  if (valid.length === 1) return valid[0];

  const winning = valid.filter(c => wouldWin(c, seat, trick, trump));
  const losing = valid.filter(c => !wouldWin(c, seat, trick, trump));

  const winnerPlay = currentWinner(trick, trump);
  const partnerWinning = winnerPlay !== null && isPartner(seat, winnerPlay.seat);
  const trickHasPoints = trickPoints(trick) > 0;

  // -------------------------------------------------------------------------
  // LEADING a trick (no cards played yet)
  // -------------------------------------------------------------------------
  if (trick.plays.length === 0) {
    const trumpInHand = hand.filter(c => c.color === trump || c.color === 'Rook');
    const rookInHand = hand.find(c => c.color === 'Rook');

    // Late game: aggressively use Rook if opponents might still have trump
    if (rookInHand && tricksPlayed >= 9) {
      return rookInHand;
    }

    // Lead high trump to pull out opponent trump
    if (trumpInHand.length >= 3) {
      // Early-mid game: lead highest trump (but save Rook for early game)
      const nonRookTrump = trumpInHand.filter(c => c.color !== 'Rook');
      if (nonRookTrump.length > 0) {
        return sortDescending(nonRookTrump)[0];
      }
    }

    // Lead highest point card in a short suit (try to win it)
    const pointCards = valid.filter(c => c.points > 0 && c.color !== 'Rook');
    if (pointCards.length > 0) {
      const counts = colorCounts(hand);
      // Find point card in shortest non-trump suit for maximum scoring chance
      const shortSuitPoints = pointCards.sort((a, b) => {
        const ca = a.color === 'Rook' ? 99 : counts[a.color as Color];
        const cb = b.color === 'Rook' ? 99 : counts[b.color as Color];
        if (ca !== cb) return ca - cb; // shorter suit first
        return b.points - a.points;   // higher points first
      });
      return shortSuitPoints[0];
    }

    // Default: lead lowest card
    return sortAscending(valid)[0];
  }

  // -------------------------------------------------------------------------
  // FOLLOWING a trick
  // -------------------------------------------------------------------------

  // Partner is currently winning
  if (partnerWinning) {
    if (trick.plays.length === 3) {
      // Last to play, partner winning: dump highest point card if can't follow (help score)
      const ledColor = trick.plays[0].card.color === 'Rook' ? trump : trick.plays[0].card.color as Color;
      if (!canFollowSuit(hand, ledColor, trump)) {
        // Can't follow suit — dump a point card to partner
        const pointCards = sortDescending(valid.filter(c => c.points > 0));
        if (pointCards.length > 0) return pointCards[0];
      }
    }
    // Partner winning: play lowest valid card (save big cards)
    return sortAscending(valid)[0];
  }

  // Opponent is winning (or no winner yet — shouldn't happen in following)
  // Try to beat them
  if (winning.length > 0) {
    if (trickHasPoints || trickPoints(trick) + 5 >= 5) {
      // Trick has points: play highest winning card to secure them
      return sortDescending(winning)[0];
    } else {
      // No points yet: play lowest winning card (save resources)
      return sortAscending(winning)[0];
    }
  }

  // Can't win this trick
  // If opponent is winning and we can't follow suit, consider playing Rook/trump
  const ledColor = trick.plays[0].card.color === 'Rook' ? trump : trick.plays[0].card.color as Color;
  if (!canFollowSuit(hand, ledColor, trump)) {
    // Can't follow suit — play trump if opponent winning and trick has points
    const rookCard = valid.find(c => c.color === 'Rook');
    const trumpCards = valid.filter(c => c.color === trump);

    if (!partnerWinning && trickHasPoints) {
      // Late game: use Rook aggressively
      if (rookCard && tricksPlayed >= 9) return rookCard;
      // Use trump to steal a point trick
      if (trumpCards.length > 0) {
        // Use lowest trump that wins
        const winningTrump = trumpCards.filter(c => wouldWin(c, seat, trick, trump));
        if (winningTrump.length > 0) return sortAscending(winningTrump)[0];
      }
      if (rookCard) return rookCard;
    }

    // Can't win, partner not winning: dump a low non-point card
    const nonPoint = sortAscending(valid.filter(c => !isPointCard(c)));
    if (nonPoint.length > 0) return nonPoint[0];
    return sortAscending(valid)[0];
  }

  // Must follow suit, can't win: dump lowest non-point card in suit
  const nonPoint = sortAscending(valid.filter(c => !isPointCard(c)));
  if (nonPoint.length > 0) return nonPoint[0];
  return sortAscending(valid)[0];
}


function aiBidEasy(state: GameState, seat: number): number | 'pass' {
  const hand = state.players[seat].hand;
  const pts = handStrength(hand);
  const { currentBid } = state.bidState;
  const rand = Math.random();
  if (rand < 0.3 && currentBid < 155) {
    return Math.max(125, currentBid + 5);
  }
  if (pts >= 50 && rand < 0.5 && currentBid < 145) {
    return Math.max(125, currentBid + 5);
  }
  return 'pass';
}

function aiPlayCardEasy(state: GameState, seat: number): Card {
  const hand = state.players[seat].hand;
  const trick = state.currentTrick ?? { plays: [] };
  const trump = state.trump!;
  const valid = hand.filter(c => isValidPlay(c, hand, trick, trump));
  return valid[Math.floor(Math.random() * valid.length)] ?? hand[0];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Get the AI action for the given seat.
 *
 * - bidding: returns `number | 'pass'`
 * - widow: returns `Card[]` (5 cards to discard)
 * - trump: returns `Color`
 * - playing: returns `Card`
 */
export function getAIAction(state: GameState, seat: number, difficulty: Difficulty = 'medium'): any {
  switch (state.phase) {
    case 'bidding':
      return difficulty === 'easy' ? aiBidEasy(state, seat) : aiBid(state, seat);
    case 'widow': {
      const hand = state.players[seat].hand;
      return aiDiscard(hand);
    }
    case 'trump':
      return aiTrump(state.players[seat].hand);
    case 'playing':
      return difficulty === 'easy' ? aiPlayCardEasy(state, seat) : aiPlayCard(state, seat);
    default:
      return 'pass';
  }
}
