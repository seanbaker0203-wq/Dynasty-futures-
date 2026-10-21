/**
 * Dynasty AI Evaluator - Aggressive String Normalization Pipeline (Slice 2)
 * The CSV/Name Ghost Fix: Normalizes names to lowercase alphanumeric, executes fuzzy matching >= 85%,
 * and maps matches back to the un-normalized master array.
 */

import { MasterPlayer, FuzzyMatchCandidate } from '../types';

export class NormalizationEngine {
  /**
   * Aggressive String Normalization Pipeline:
   * Converts strings to lowercase and uses Regex to strip ALL non-alphanumeric characters.
   * Example: "C.J. Stroud " -> "cjstroud"
   * Example: "Amon-Ra St. Brown" -> "amonrastbrown"
   */
  public static normalizeString(text: string): string {
    if (!text) return '';
    return text.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Calculates similarity ratio (0.0 to 100.0) between two strings using Levenshtein distance
   */
  public static calculateSimilarity(s1: string, s2: string): number {
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 100;

    const len1 = s1.length;
    const len2 = s2.length;
    const dp: number[][] = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) dp[i][0] = i;
    for (let j = 0; j <= len2; j++) dp[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, // deletion
          dp[i][j - 1] + 1, // insertion
          dp[i - 1][j - 1] + cost // substitution
        );
      }
    }

    const distance = dp[len1][len2];
    const maxLen = Math.max(len1, len2);
    return ((1 - distance / maxLen) * 100);
  }

  /**
   * Evaluates normalized uploaded name against normalized database names (Threshold >= 85%).
   * CRITICAL: When a match is found, maps the match index perfectly back to the UN-NORMALIZED master array.
   * The math runs on "amonrastbrown", but the return must be "Amon-Ra St. Brown".
   */
  public static matchPlayer(
    rawName: string,
    masterPlayers: MasterPlayer[],
    normalizedCache?: string[],
    threshold: number = 85.0
  ): { player: MasterPlayer | null; score: number; index: number | null } {
    const normQuery = this.normalizeString(rawName);
    if (!normQuery || masterPlayers.length === 0) {
      return { player: null, score: 0, index: null };
    }

    const normDb =
      normalizedCache && normalizedCache.length === masterPlayers.length
        ? normalizedCache
        : masterPlayers.map((p) => this.normalizeString(p.full_name));

    // 1. Exact normalized match pass
    const exactIndex = normDb.indexOf(normQuery);
    if (exactIndex !== -1) {
      // Return un-normalized master player object
      return { player: masterPlayers[exactIndex], score: 100, index: exactIndex };
    }

    // 2. Fuzzy match pass
    let bestScore = 0;
    let bestIndex: number | null = null;

    for (let i = 0; i < normDb.length; i++) {
      const score = this.calculateSimilarity(normQuery, normDb[i]);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex !== null && bestScore >= threshold) {
      // Map matched index back to UN-NORMALIZED master array
      return { player: masterPlayers[bestIndex], score: bestScore, index: bestIndex };
    }

    return { player: null, score: bestScore, index: null };
  }

  /**
   * Batch resolves names from CSV or text inputs
   */
  public static batchMatch(
    rawNames: string[],
    masterPlayers: MasterPlayer[],
    threshold: number = 85.0
  ): FuzzyMatchCandidate[] {
    const normDb = masterPlayers.map((p) => this.normalizeString(p.full_name));
    return rawNames.map((name) => {
      const normInput = this.normalizeString(name);
      const { player, score } = this.matchPlayer(name, masterPlayers, normDb, threshold);
      return {
        raw_input: name,
        normalized_input: normInput,
        matched_player_id: player?.id,
        matched_player_name: player?.full_name,
        similarity_score: Math.round(score * 10) / 10,
        is_match: !!player,
      };
    });
  }
}
