export type TwoWayOdds = {
  oddsA: number;
  oddsB: number;
};

export function impliedSum({ oddsA, oddsB }: TwoWayOdds): number {
  if (!Number.isFinite(oddsA) || !Number.isFinite(oddsB) || oddsA <= 1 || oddsB <= 1) return NaN;
  return 1 / oddsA + 1 / oddsB;
}

export function roiPercent({ oddsA, oddsB }: TwoWayOdds): number {
  const s = impliedSum({ oddsA, oddsB });
  if (!Number.isFinite(s)) return NaN;
  return (1 - s) * 100;
}

export function isArbitrage({ oddsA, oddsB }: TwoWayOdds, minRoiPercent = 0): boolean {
  const roi = roiPercent({ oddsA, oddsB });
  return Number.isFinite(roi) && roi > 0 && roi >= minRoiPercent;
}

export type StakePlan = {
  stakeA: number;
  stakeB: number;
  totalStake: number;
  payout: number;
  profit: number;
  roiPercent: number;
};

export function stakePlan(bankroll: number, { oddsA, oddsB }: TwoWayOdds): StakePlan {
  if (!Number.isFinite(bankroll) || bankroll <= 0) {
    return { stakeA: 0, stakeB: 0, totalStake: 0, payout: 0, profit: 0, roiPercent: NaN };
  }

  const s = impliedSum({ oddsA, oddsB });
  if (!Number.isFinite(s)) {
    return { stakeA: 0, stakeB: 0, totalStake: bankroll, payout: 0, profit: 0, roiPercent: NaN };
  }

  // Stakes proportional to implied probabilities.
  const stakeA = (bankroll * (1 / oddsA)) / s;
  const stakeB = (bankroll * (1 / oddsB)) / s;

  // Guaranteed payout (should be equal for both outcomes).
  const payoutA = stakeA * oddsA;
  const payoutB = stakeB * oddsB;
  const payout = Math.min(payoutA, payoutB);

  const totalStake = stakeA + stakeB;
  const profit = payout - totalStake;
  const roi = totalStake > 0 ? (profit / totalStake) * 100 : NaN;

  return {
    stakeA,
    stakeB,
    totalStake,
    payout,
    profit,
    roiPercent: roi,
  };
}
