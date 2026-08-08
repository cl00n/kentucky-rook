/**
 * Deck creation, shuffling, and dealing for Rook (Kentucky Discard)
 */

import { Card, Color } from './types';

const COLORS: Color[] = ['Black', 'Red', 'Green', 'Yellow'];

/** Compute the point value of a card by its color and value */
function computePoints(color: 'Rook' | Color, value: number | 'Rook'): number {
  if (color === 'Rook') return 20;
  if (value === 1) return 15;
  if (value === 14 || value === 10) return 10;
  if (value === 5) return 5;
  return 0;
}

/**
 * Build the full 57-card Rook deck.
 * Includes cards 1–14 in each of the 4 colors, plus the Rook bird card.
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const color of COLORS) {
    for (let value = 1; value <= 14; value++) {
      deck.push({
        id: `${color}-${value}`,
        color,
        value,
        points: computePoints(color, value),
      });
    }
  }

  // The Rook bird card
  deck.push({
    id: 'Rook',
    color: 'Rook',
    value: 'Rook',
    points: 20,
  });

  return deck;
}

/**
 * Shuffle a deck in-place using the Fisher-Yates algorithm.
 * Returns the shuffled deck (same array reference).
 */
export function shuffle(deck: Card[]): Card[] {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Deal cards from a 57-card deck.
 * First 5 cards go to the widow; remaining 52 are dealt 13 each to 4 players.
 *
 * @returns `hands` — array of 4 hands (13 cards each), and `widow` — 5 cards
 */
export function dealCards(deck: Card[]): { hands: Card[][]; widow: Card[] } {
  if (deck.length !== 57) {
    throw new Error(`Expected 57-card deck, got ${deck.length}`);
  }

  const widow = deck.slice(0, 5);
  const remaining = deck.slice(5); // 52 cards

  const hands: Card[][] = [[], [], [], []];
  for (let i = 0; i < remaining.length; i++) {
    hands[i % 4].push(remaining[i]);
  }

  return { hands, widow };
}
