/**
 * Scoring logic for Rook (Kentucky Discard)
 *
 * Points per trick: 1s=15, 14s=10, 10s=10, 5s=5, Rook=20 → 180 total
 * Majority bonus: team that wins 8+ of 13 tricks earns +20 points
 *
 * Bid result:
 *  - If bidding team makes their bid (trick points >= bid): they score their trick points
 *  - If bidding team fails: they go NEGATIVE their bid; opponents score their trick points
 *
 * Game ends when a team reaches 500+ points.
 */

import { GameState } from './types';
import { countPoints } from './tricks';

/** Bonus points for winning the majority of tricks (8+/13) */
export const MAJORITY_BONUS = 20;

/** Total points available per round (before majority bonus) */
export const ROUND_TOTAL_POINTS = 180;

/**
 * Score the completed hand.
 *
 * @returns Score deltas for each team and whether the bid was made
 */
export function scoreHand(state: GameState): {
  team0Score: number;
  team1Score: number;
  bidMade: boolean;
} {
  const { completedTricks, bidState, widow, trump } = state;

  if (!trump) throw new Error('Cannot score: trump not named');
  if (bidState.currentBidder === -1) throw new Error('Cannot score: no bidder');

  // Determine bidding team (0 or 1) based on bidder's seat
  const biddingTeam = bidState.currentBidder % 2 as 0 | 1;
  const bid = bidState.currentBid;

  // Collect all cards won by each team
  const team0Cards: import('./types').Card[] = [];
  const team1Cards: import('./types').Card[] = [];

  // Last trick winner also gets the widow
  const lastTrick = completedTricks[completedTricks.length - 1];
  const lastTrickWinner = lastTrick?.winningSeat ?? bidState.currentBidder;
  const lastTrickTeam = lastTrickWinner % 2;

  for (const trick of completedTricks) {
    const team = (trick.winningSeat ?? 0) % 2;
    for (const play of trick.plays) {
      if (team === 0) team0Cards.push(play.card);
      else team1Cards.push(play.card);
    }
  }

  // Add widow to last trick winner's team
  if (lastTrickTeam === 0) {
    team0Cards.push(...widow);
  } else {
    team1Cards.push(...widow);
  }

  // Count trick points for each team
  let team0Points = countPoints(team0Cards);
  let team1Points = countPoints(team1Cards);

  // Count tricks won for majority bonus
  const team0Tricks = completedTricks.filter(t => (t.winningSeat ?? 0) % 2 === 0).length;
  const team1Tricks = completedTricks.filter(t => (t.winningSeat ?? 0) % 2 === 1).length;

  if (team0Tricks >= 8) team0Points += MAJORITY_BONUS;
  if (team1Tricks >= 8) team1Points += MAJORITY_BONUS;

  // Determine bid result
  const biddingTeamPoints = biddingTeam === 0 ? team0Points : team1Points;
  const bidMade = biddingTeamPoints >= bid;

  let team0Score: number;
  let team1Score: number;

  if (bidMade) {
    // Bidding team scores their trick points; opponents score theirs
    team0Score = team0Points;
    team1Score = team1Points;
  } else {
    // Bidding team goes negative their bid; opponents score their trick points normally
    if (biddingTeam === 0) {
      team0Score = -bid;
      team1Score = team1Points;
    } else {
      team0Score = team0Points;
      team1Score = -bid;
    }
  }

  return { team0Score, team1Score, bidMade };
}

/**
 * Check if either team has reached or exceeded 500 points.
 *
 * @returns 0 if team 0 wins, 1 if team 1 wins, null if game continues
 */
export function checkGameOver(scores: { team0: number; team1: number }): 0 | 1 | null {
  const TARGET = 500;
  if (scores.team0 >= TARGET && scores.team1 >= TARGET) {
    // Both reached 500 — higher score wins
    return scores.team0 >= scores.team1 ? 0 : 1;
  }
  if (scores.team0 >= TARGET) return 0;
  if (scores.team1 >= TARGET) return 1;
  return null;
}
