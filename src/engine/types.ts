/**
 * Core types for the Rook card game engine (Kentucky Discard variant)
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

/** The four suit colors in Rook */
export type Color = 'Black' | 'Red' | 'Green' | 'Yellow';

/**
 * Represents a single card in the deck.
 * The Rook bird card has color 'Rook' and value 'Rook'.
 */
export interface Card {
  /** Unique identifier for this card, e.g. "Red-7" or "Rook" */
  id: string;
  /** Suit color, or 'Rook' for the bird card */
  color: Color | 'Rook';
  /** Numeric value 1–14, or 'Rook' for the bird card */
  value: number | 'Rook';
  /** Point value: 1s=15, 14s=10, 10s=10, 5s=5, Rook=20, else 0 */
  points: number;
}

/** Represents one player in the game */
export interface Player {
  /** Unique player identifier */
  id: string;
  /** Seat position 0–3 (0&2 are team 0, 1&3 are team 1) */
  seat: 0 | 1 | 2 | 3;
  /** Display name */
  name: string;
  /** Cards currently in this player's hand */
  hand: Card[];
  /** Whether this seat is controlled by a human */
  isHuman: boolean;
}

/** A single played card within a trick */
export interface TrickPlay {
  seat: number;
  card: Card;
}

/** Represents one trick (up to 4 plays) */
export interface Trick {
  /** Cards played in order */
  plays: TrickPlay[];
  /** Seat number of the winner (set after trick is complete) */
  winningSeat?: number;
}

/** Bidding phase state */
export interface BidState {
  /** Current highest bid (starts at 0, min first bid is 125) */
  currentBid: number;
  /** Seat of current highest bidder (-1 if no bid yet) */
  currentBidder: number;
  /** Seat of the dealer */
  dealer: number;
  /** Seats that have passed */
  passedSeats: Set<number>;
  /** True if dealer was lawed off at 125 (forced bid) */
  lawedOff: boolean;
}

/** Phases of a game round */
export type GamePhase =
  | 'dealing'
  | 'bidding'
  | 'widow'
  | 'trump'
  | 'playing'
  | 'scoring'
  | 'gameOver';

/** Complete game state — always treat as immutable; return new copies on update */
export interface GameState {
  /** All four players */
  players: Player[];
  /** Current phase of the round */
  phase: GamePhase;
  /** Cumulative scores: index = team number (0 or 1) */
  scores: [number, number];
  /** Completed tricks this round */
  completedTricks: Trick[];
  /** Current trick in progress (undefined if none started) */
  currentTrick?: Trick;
  /** The 5-card widow pile */
  widow: Card[];
  /** Named trump color (undefined until trump phase completes) */
  trump?: Color;
  /** Bidding state */
  bidState: BidState;
  /** Seat whose turn it is to act (bid, play, etc.) */
  activePlayer: number;
  /** Round number (starts at 1) */
  round: number;
  /** Winning team (0 or 1) once game is over */
  winner?: 0 | 1;
}
