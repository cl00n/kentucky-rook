/**
 * Trick-taking logic for Rook (Kentucky Discard)
 *
 * Card rank (high → low): 1, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2
 * The Rook is the highest trump (rank 20) and beats all other cards when trump is led or played.
 * Must follow suit if able; if unable, may play any card.
 */

import { Card, Color, Trick } from './types';

/**
 * Returns true if the card is a point card.
 * Point cards: 1s (15pts), 5s (5pts), 10s (10pts), 14s (10pts), Rook (20pts)
 */
export function isPointCard(card: Card): boolean {
  return card.points > 0;
}

/**
 * Get the effective color of a card for following-suit purposes.
 * The Rook counts as trump when trump has been named.
 */
export function getEffectiveColor(card: Card, trump: Color): Color | 'Rook' {
  if (card.color === 'Rook') return trump; // Rook is trump-colored for suit-following
  return card.color;
}

/**
 * Get the numeric rank of a card for comparison purposes.
 *
 * Rank table (higher = stronger):
 *  - Rook bird = 20 (always highest trump)
 *  - 1 = 15 (highest non-Rook rank)
 *  - 14 = 14
 *  - 13 = 13
 *  - ...
 *  - 2 = 2
 *
 * @param card - The card to rank
 * @param trump - The named trump color
 * @returns Numeric rank for comparison (higher wins)
 */
export function getCardRank(card: Card, trump: Color): number {
  if (card.color === 'Rook') return 20; // Rook is always highest trump
  const value = card.value as number; // All non-Rook cards have numeric values
  if (value === 1) return 15; // 1 is highest non-Rook rank
  return value; // 14, 13, ..., 2 map directly
}

/**
 * Returns true if the player's hand contains at least one card matching
 * the led suit (or trump, for the Rook).
 */
export function canFollowSuit(hand: Card[], ledColor: Color, trump: Color): boolean {
  return hand.some(card => {
    if (card.color === 'Rook') return ledColor === trump; // Rook follows trump suit
    return card.color === ledColor;
  });
}

/**
 * Returns true if playing `card` is legal given the current trick state.
 *
 * Rules:
 * - If you are the first player in the trick, any card is valid.
 * - Otherwise, you must follow the led suit if you have any card of that suit.
 *   (The Rook counts as trump for following purposes.)
 * - If you cannot follow suit, any card is valid.
 */
export function isValidPlay(
  card: Card,
  hand: Card[],
  trick: Trick,
  trump: Color
): boolean {
  // First play in the trick — anything goes
  if (trick.plays.length === 0) return true;

  const ledCard = trick.plays[0].card;
  // If Rook led, treat as trump being led — must follow trump if able
  const ledColor: Color = ledCard.color === 'Rook' ? trump : ledCard.color as Color;

  // If can follow suit, must play a card of that suit
  if (canFollowSuit(hand, ledColor, trump)) {
    if (card.color === 'Rook') return ledColor === trump; // Rook valid only if trump led
    return card.color === ledColor;
  }

  // Cannot follow suit — any card is valid
  return true;
}

/**
 * Determine which seat wins a completed trick.
 *
 * Priority:
 * 1. If any trump was played, the highest-ranked trump wins.
 * 2. Otherwise, the highest card of the led suit wins.
 *
 * @returns The seat number of the trick winner
 */
export function getTrickWinner(trick: Trick, trump: Color): number {
  if (trick.plays.length === 0) throw new Error('Cannot determine winner of empty trick');

  const ledColor = trick.plays[0].card.color as Color;

  // Check if any trump was played (including Rook)
  const trumpPlays = trick.plays.filter(
    p => p.card.color === trump || p.card.color === 'Rook'
  );

  if (trumpPlays.length > 0) {
    // Highest trump wins
    let winner = trumpPlays[0];
    for (const play of trumpPlays.slice(1)) {
      if (getCardRank(play.card, trump) > getCardRank(winner.card, trump)) {
        winner = play;
      }
    }
    return winner.seat;
  }

  // No trump — highest of led suit wins
  const ledPlays = trick.plays.filter(p => p.card.color === ledColor);
  let winner = ledPlays[0];
  for (const play of ledPlays.slice(1)) {
    if (getCardRank(play.card, trump) > getCardRank(winner.card, trump)) {
      winner = play;
    }
  }
  return winner.seat;
}

/**
 * Count the total point value of a set of cards.
 */
export function countPoints(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + card.points, 0);
}
