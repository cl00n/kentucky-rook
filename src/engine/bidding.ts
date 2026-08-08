/**
 * Bidding logic for Rook (Kentucky Discard)
 *
 * Bidding order: starts left of dealer, clockwise.
 * Min bid = 125, increments of 5.
 * Once a player passes they are out for the round.
 * If all players but one pass, the remaining player wins the bid.
 * If everyone passes back to dealer without a bid, dealer is "lawed off" at 125.
 */

import { GameState } from './types';

/** Minimum opening bid */
export const MIN_BID = 125;

/** Minimum increment for a bid raise */
export const BID_INCREMENT = 5;

/**
 * Returns true if `amount` is a valid bid for the given seat right now.
 */
export function isValidBid(state: GameState, seat: number, amount: number): boolean {
  const { bidState } = state;

  // Must be this seat's turn
  if (state.activePlayer !== seat) return false;
  // Seat must not have already passed
  if (bidState.passedSeats.has(seat)) return false;

  // Amount must be at least MIN_BID and higher than current bid
  if (amount < MIN_BID) return false;
  if (amount <= bidState.currentBid) return false;

  // Must be in increments of 5
  if (amount % BID_INCREMENT !== 0) return false;

  return true;
}

/**
 * Determine the next seat (clockwise) that hasn't passed yet,
 * skipping the current active player.
 */
export function getNextBidder(state: GameState): number {
  const { bidState, activePlayer } = state;
  let seat = (activePlayer + 1) % 4;
  // Walk clockwise until we find someone who hasn't passed
  for (let i = 0; i < 4; i++) {
    if (!bidState.passedSeats.has(seat)) return seat;
    seat = (seat + 1) % 4;
  }
  // Fallback — shouldn't happen if bidding isn't over
  return activePlayer;
}

/**
 * Returns true when bidding has concluded:
 * - Only one non-passed seat remains, OR
 * - The dealer was lawed off
 */
export function isBiddingOver(state: GameState): boolean {
  if (state.bidState.lawedOff) return true;
  const activeBidders = 4 - state.bidState.passedSeats.size;
  return activeBidders <= 1;
}

/**
 * Apply a bid or pass from `seat`.
 * Returns the updated GameState.
 *
 * Handles:
 *  - Regular bid: update currentBid and currentBidder
 *  - Pass: add seat to passedSeats
 *  - Lawed-off detection: if all others pass and dealer has no bid, force 125
 *  - Transitions phase to 'widow' when bidding ends
 */
export function placeBid(
  state: GameState,
  seat: number,
  amount: number | 'pass'
): GameState {
  if (state.phase !== 'bidding') {
    throw new Error(`Cannot bid during phase: ${state.phase}`);
  }
  if (state.activePlayer !== seat) {
    throw new Error(`It is not seat ${seat}'s turn to bid`);
  }
  if (state.bidState.passedSeats.has(seat)) {
    throw new Error(`Seat ${seat} has already passed`);
  }

  let { bidState } = state;

  if (amount === 'pass') {
    // Add this seat to passed set
    const passedSeats = new Set(bidState.passedSeats);
    passedSeats.add(seat);
    bidState = { ...bidState, passedSeats };

    // Check if dealer must be lawed off:
    // All non-dealer seats have passed AND dealer never bid
    const remainingBidders = 4 - passedSeats.size;
    let lawedOff = false;

    if (remainingBidders === 1) {
      const lastSeat = [0, 1, 2, 3].find(s => !passedSeats.has(s))!;
      if (lastSeat === bidState.dealer && bidState.currentBidder === -1) {
        // Dealer lawed off — forced to take at 125
        lawedOff = true;
        bidState = {
          ...bidState,
          lawedOff: true,
          currentBid: MIN_BID,
          currentBidder: bidState.dealer,
        };
      }
    }

    const newState: GameState = {
      ...state,
      bidState,
    };

    if (isBiddingOver(newState)) {
      return {
        ...newState,
        phase: 'widow',
        activePlayer: newState.bidState.currentBidder,
      };
    }

    return {
      ...newState,
      activePlayer: getNextBidder(newState),
    };
  } else {
    // Validate bid amount
    if (!isValidBid(state, seat, amount)) {
      throw new Error(
        `Invalid bid ${amount} by seat ${seat}. Current bid: ${bidState.currentBid}`
      );
    }

    bidState = {
      ...bidState,
      currentBid: amount,
      currentBidder: seat,
    };

    const newState: GameState = {
      ...state,
      bidState,
      activePlayer: getNextBidder({ ...state, bidState, activePlayer: seat }),
    };

    if (isBiddingOver(newState)) {
      return {
        ...newState,
        phase: 'widow',
        activePlayer: newState.bidState.currentBidder,
      };
    }

    return newState;
  }
}
