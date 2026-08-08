/**
 * Main game state machine for Rook (Kentucky Discard)
 *
 * All functions are pure: they accept a GameState and return a new GameState.
 * No mutation of the input state occurs.
 */

import { Card, Color, GameState, Player, Trick } from './types';
import { createDeck, dealCards, shuffle } from './deck';
import { placeBid, getNextBidder, MIN_BID } from './bidding';
import {
  isPointCard,
  isValidPlay,
  getTrickWinner,
  countPoints,
  canFollowSuit,
} from './tricks';
import { scoreHand, checkGameOver } from './scoring';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the team number (0 or 1) for a given seat */
function teamOf(seat: number): 0 | 1 {
  return (seat % 2) as 0 | 1;
}

/** Deep-clone a Player array (hands are new arrays of same card refs) */
function clonePlayers(players: Player[]): Player[] {
  return players.map(p => ({ ...p, hand: [...p.hand] }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a fresh GameState with 4 players.
 *
 * @param playerNames - Display names for seats 0–3
 * @param humanSeats - Which seat indices are human-controlled
 */
export function createGame(playerNames: string[], humanSeats: number[]): GameState {
  if (playerNames.length !== 4) {
    throw new Error('Rook requires exactly 4 players');
  }

  const players: Player[] = playerNames.map((name, i) => ({
    id: `player-${i}`,
    seat: i as 0 | 1 | 2 | 3,
    name,
    hand: [],
    isHuman: humanSeats.includes(i),
  }));

  return {
    players,
    phase: 'dealing',
    scores: [0, 0],
    completedTricks: [],
    widow: [],
    bidState: {
      currentBid: 0,
      currentBidder: -1,
      dealer: 0,
      passedSeats: new Set(),
      lawedOff: false,
    },
    activePlayer: 1, // left of dealer starts bidding
    round: 1,
  };
}

/**
 * Shuffle and deal cards, then advance to bidding phase.
 * The dealer rotates each round.
 */
export function startDeal(state: GameState): GameState {
  const deck = shuffle(createDeck());
  const { hands, widow } = dealCards(deck);

  const players = clonePlayers(state.players);
  for (let i = 0; i < 4; i++) {
    players[i].hand = hands[i];
  }

  const dealer = state.bidState.dealer;
  const firstBidder = (dealer + 1) % 4;

  return {
    ...state,
    players,
    phase: 'bidding',
    widow,
    completedTricks: [],
    currentTrick: undefined,
    trump: undefined,
    activePlayer: firstBidder,
    bidState: {
      currentBid: 0,
      currentBidder: -1,
      dealer,
      passedSeats: new Set(),
      lawedOff: false,
    },
  };
}

/**
 * Place a bid or pass on behalf of `seat`.
 * Delegates to bidding module; re-throws errors on invalid state.
 */
export function bid(
  state: GameState,
  seat: number,
  amount: number | 'pass'
): GameState {
  return placeBid(state, seat, amount);
}

/**
 * Bid winner picks up the widow — merges widow cards into their hand.
 * Advances phase to 'widow' discard step (stays in 'widow' phase).
 */
export function pickUpWidow(state: GameState): GameState {
  if (state.phase !== 'widow') {
    throw new Error(`Cannot pick up widow during phase: ${state.phase}`);
  }

  const bidWinner = state.bidState.currentBidder;
  if (state.activePlayer !== bidWinner) {
    throw new Error('Only the bid winner can pick up the widow');
  }

  const players = clonePlayers(state.players);
  players[bidWinner].hand = [...players[bidWinner].hand, ...state.widow];

  return {
    ...state,
    players,
    // Widow is now in hand; clear the widow pile temporarily
    widow: [],
  };
}

/**
 * Bid winner discards exactly 5 cards face-down to the widow.
 * Validates that none of the discarded cards are point cards.
 * Advances phase to 'trump'.
 */
export function discardToWidow(
  state: GameState,
  seat: number,
  cards: Card[]
): GameState {
  if (state.phase !== 'widow') {
    throw new Error(`Cannot discard during phase: ${state.phase}`);
  }
  if (seat !== state.bidState.currentBidder) {
    throw new Error('Only the bid winner can discard to the widow');
  }
  if (cards.length !== 5) {
    throw new Error(`Must discard exactly 5 cards, got ${cards.length}`);
  }

  // No point cards allowed in the discard
  const pointCard = cards.find(isPointCard);
  if (pointCard) {
    throw new Error(`Cannot discard point card: ${pointCard.id}`);
  }

  const players = clonePlayers(state.players);
  const hand = players[seat].hand;

  // Verify each card is actually in the player's hand
  const discardIds = new Set(cards.map(c => c.id));
  const newHand = hand.filter(c => !discardIds.has(c.id));

  if (newHand.length !== hand.length - 5) {
    throw new Error('One or more discarded cards were not in your hand');
  }

  players[seat].hand = newHand;

  return {
    ...state,
    players,
    widow: cards, // Discarded cards become the widow
    phase: 'trump',
    activePlayer: seat,
  };
}

/**
 * Bid winner names the trump color.
 * Advances phase to 'playing'; bid winner leads the first trick.
 */
export function callTrump(state: GameState, seat: number, color: Color): GameState {
  if (state.phase !== 'trump') {
    throw new Error(`Cannot call trump during phase: ${state.phase}`);
  }
  if (seat !== state.bidState.currentBidder) {
    throw new Error('Only the bid winner can name trump');
  }

  return {
    ...state,
    trump: color,
    phase: 'playing',
    activePlayer: seat, // Bid winner leads first
    currentTrick: { plays: [] },
  };
}

/**
 * Play a card from `seat`'s hand into the current trick.
 *
 * - Validates it's the right player's turn
 * - Validates the play is legal (follow suit rules)
 * - Handles trick completion (determine winner, start next trick)
 * - Handles round completion (all 13 tricks played → scoring)
 */
export function playCard(state: GameState, seat: number, card: Card): GameState {
  if (state.phase !== 'playing') {
    throw new Error(`Cannot play card during phase: ${state.phase}`);
  }
  if (state.activePlayer !== seat) {
    throw new Error(`It is not seat ${seat}'s turn`);
  }
  if (!state.trump) {
    throw new Error('Trump has not been named');
  }

  const trick = state.currentTrick ?? { plays: [] };

  // Validate the play
  const player = state.players[seat];
  if (!isValidPlay(card, player.hand, trick, state.trump)) {
    throw new Error(`Card ${card.id} is not a valid play for seat ${seat}`);
  }

  // Remove card from hand
  const players = clonePlayers(state.players);
  const cardIdx = players[seat].hand.findIndex(c => c.id === card.id);
  if (cardIdx === -1) {
    throw new Error(`Card ${card.id} is not in seat ${seat}'s hand`);
  }
  players[seat].hand.splice(cardIdx, 1);

  // Add card to trick
  const updatedTrick: Trick = {
    plays: [...trick.plays, { seat, card }],
  };

  // Is the trick complete? (all 4 players have played)
  if (updatedTrick.plays.length === 4) {
    const winningSeat = getTrickWinner(updatedTrick, state.trump);
    const finishedTrick: Trick = { ...updatedTrick, winningSeat };
    const completedTricks = [...state.completedTricks, finishedTrick];

    // Is this the last trick? (13 total)
    if (completedTricks.length === 13) {
      // Score the hand
      const handState: GameState = {
        ...state,
        players,
        completedTricks,
        currentTrick: undefined,
      };

      const { team0Score, team1Score } = scoreHand(handState);
      const newScores: [number, number] = [
        state.scores[0] + team0Score,
        state.scores[1] + team1Score,
      ];

      const gameOverTeam = checkGameOver({ team0: newScores[0], team1: newScores[1] });

      if (gameOverTeam !== null) {
        return {
          ...handState,
          scores: newScores,
          phase: 'gameOver',
          winner: gameOverTeam,
        };
      }

      // Prepare next round — dealer rotates
      const nextDealer = (state.bidState.dealer + 1) % 4;

      return {
        ...handState,
        scores: newScores,
        phase: 'scoring',
        bidState: {
          ...state.bidState,
          dealer: nextDealer,
        },
        round: state.round + 1,
      };
    }

    // Trick done, but round continues — winner leads next
    return {
      ...state,
      players,
      completedTricks,
      currentTrick: { plays: [] },
      activePlayer: winningSeat,
    };
  }

  // Trick still in progress — next player clockwise
  const nextPlayer = (seat + 1) % 4;

  return {
    ...state,
    players,
    currentTrick: updatedTrick,
    activePlayer: nextPlayer,
  };
}

/**
 * Returns the set of cards that `seat` can legally play right now.
 * Returns empty array if it's not their turn or wrong phase.
 */
export function getValidPlays(state: GameState, seat: number): Card[] {
  if (state.phase !== 'playing') return [];
  if (state.activePlayer !== seat) return [];
  if (!state.trump) return [];

  const player = state.players[seat];
  const trick = state.currentTrick ?? { plays: [] };

  return player.hand.filter(card => isValidPlay(card, player.hand, trick, state.trump!));
}
