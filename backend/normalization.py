"""
Dynasty AI Evaluator - Normalization & Fuzzy Resolution Engine (Slice 2)
Implements aggressive string normalization pipeline and entity resolution.
"""

import re
from typing import List, Tuple, Optional, Dict, Any

try:
    from rapidfuzz import fuzz
    HAS_RAPIDFUZZ = True
except ImportError:
    HAS_RAPIDFUZZ = False

from backend.models import MasterPlayer, FuzzyMatchCandidate


class NormalizationEngine:
    """
    Aggressive String Normalization Pipeline (The CSV/Name Ghost Fix)
    """

    @staticmethod
    def _normalize_string(text: str) -> str:
        """
        Converts strings to lowercase and uses Regex to strip ALL non-alphanumeric
        characters (spaces, periods, hyphens, apostrophes, accents).
        Example: "C.J. Stroud " -> "cjstroud"
        Example: "Amon-Ra St. Brown" -> "amonrastbrown"
        """
        if not text:
            return ""
        # Lowercase and strip leading/trailing whitespace
        s = text.strip().lower()
        # Remove common generational suffixes to ensure matching consistency
        # e.g., "marvin harrison jr." -> "marvinharrison" if needed, but primary regex strips punct
        # Strip all non-alphanumeric characters (a-z, 0-9)
        normalized = re.sub(r"[^a-z0-9]", "", s)
        return normalized

    @classmethod
    def _calculate_similarity(cls, s1: str, s2: str) -> float:
        """
        Calculates similarity ratio between 0.0 and 100.0 using RapidFuzz when available,
        falling back to Levenshtein ratio.
        """
        if not s1 or not s2:
            return 0.0
        if s1 == s2:
            return 100.0

        if HAS_RAPIDFUZZ:
            return float(fuzz.ratio(s1, s2))

        # Pure Python fallback: Levenshtein distance ratio
        len1, len2 = len(s1), len(s2)
        if len1 == 0 or len2 == 0:
            return 0.0

        dp = [[0] * (len2 + 1) for _ in range(len1 + 1)]
        for i in range(len1 + 1):
            dp[i][0] = i
        for j in range(len2 + 1):
            dp[0][j] = j

        for i in range(1, len1 + 1):
            for j in range(1, len2 + 1):
                cost = 0 if s1[i - 1] == s2[j - 1] else 1
                dp[i][j] = min(
                    dp[i - 1][j] + 1,      # deletion
                    dp[i][j - 1] + 1,      # insertion
                    dp[i - 1][j - 1] + cost  # substitution
                )

        distance = dp[len1][len2]
        max_len = max(len1, len2)
        ratio = (1.0 - (distance / max_len)) * 100.0
        return ratio

    @classmethod
    def match_player(
        cls,
        raw_name: str,
        master_players: List[MasterPlayer],
        normalized_cache: Optional[List[str]] = None,
        threshold: float = 85.0
    ) -> Tuple[Optional[MasterPlayer], float, Optional[int]]:
        """
        RapidFuzz evaluates the normalized uploaded name against the normalized database name (Threshold >= 85%).
        CRITICAL: When a match is found, maps the match index perfectly back to the UN-NORMALIZED master array.
        The math runs on "amonrastbrown", but the API must return "Amon-Ra St. Brown" to the frontend.

        Returns: (matched_player_or_none, score, match_index)
        """
        norm_query = cls._normalize_string(raw_name)
        if not norm_query or not master_players:
            return None, 0.0, None

        # Build normalized names list if not precomputed
        if normalized_cache is None or len(normalized_cache) != len(master_players):
            norm_db = [cls._normalize_string(p.full_name) for p in master_players]
        else:
            norm_db = normalized_cache

        # 1. Exact match pass on normalized strings (fastest)
        try:
            exact_idx = norm_db.index(norm_query)
            # Map index directly back to UN-NORMALIZED master array
            return master_players[exact_idx], 100.0, exact_idx
        except ValueError:
            pass

        # 2. RapidFuzz fuzzy match pass against normalized DB
        best_score = 0.0
        best_idx: Optional[int] = None

        for idx, norm_target in enumerate(norm_db):
            score = cls._calculate_similarity(norm_query, norm_target)
            if score > best_score:
                best_score = score
                best_idx = idx

        if best_idx is not None and best_score >= threshold:
            # Map index directly back to UN-NORMALIZED master array
            return master_players[best_idx], best_score, best_idx

        return None, best_score, None

    @classmethod
    def batch_match(
        cls,
        raw_names: List[str],
        master_players: List[MasterPlayer],
        threshold: float = 85.0
    ) -> List[FuzzyMatchCandidate]:
        """
        Batch resolves raw input names against master player records.
        """
        norm_db = [cls._normalize_string(p.full_name) for p in master_players]
        results: List[FuzzyMatchCandidate] = []

        for raw_name in raw_names:
            norm_input = cls._normalize_string(raw_name)
            matched_player, score, _ = cls.match_player(
                raw_name=raw_name,
                master_players=master_players,
                normalized_cache=norm_db,
                threshold=threshold
            )
            candidate = FuzzyMatchCandidate(
                raw_input=raw_name,
                normalized_input=norm_input,
                matched_player_id=matched_player.id if matched_player else None,
                matched_player_name=matched_player.full_name if matched_player else None,
                similarity_score=round(score, 2),
                is_match=matched_player is not None
            )
            results.append(candidate)

        return results
