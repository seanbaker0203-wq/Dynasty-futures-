/** Trade assets and idea shapes shared by the browser (display) and the server (which builds the ideas). */
import type { DraftPick, MasterPlayer } from '../types';

export type FinderAsset = { kind: 'player'; item: MasterPlayer } | { kind: 'pick'; item: DraftPick };
export const finderAssetId = (a: FinderAsset) => `${a.kind}:${a.item.id}`;

export interface TradeIdea {
  partner_id: string;
  partner_name: string;
  give: FinderAsset[];
  get: FinderAsset[];
  value_give: number;
  value_get: number;
  /** Totals on the value source used to judge fairness (when not Futures Value) */
  fair_give?: number;
  fair_get?: number;
  /** Change in your projected points per week, per season */
  my_change: number[];
  their_change: number[];
  /** Weighted five-season gain for you (pts/wk) */
  my_gain: number;
  their_gain: number;
  score: number;
  reasons: string[];
}

export interface PersonalIdea {
  partner_id: string;
  partner_name: string;
  give: FinderAsset[];
  get: FinderAsset[];
  market_give: number;
  market_get: number;
  mine_give: number;
  mine_get: number;
  gain: number;
  lineup_change: number;
  also: { partner_id: string; partner_name: string; pick: DraftPick }[];
}

/** Five-season effect of a trade for both teams (from the server). */
export interface TradeImpactRow {
  season: number;
  me: { before: number; after: number };
  them: { before: number; after: number };
  meRank: { before: number; after: number };
  themRank: { before: number; after: number };
}
