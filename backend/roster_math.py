"""
Dynasty AI Evaluator - Roster DNA Mathematical Processing Engine (Slice 2)
Calculates Gross Liquidity, Asset Half-Life, Structural Integrity, and Archetype Classification.
"""

from typing import List, Dict, Tuple, Optional
import math

from backend.models import (
    MasterPlayer,
    RosterRecord,
    RosterDNAMetrics,
    PositionalBreakdown,
    RosterEvaluationResult,
    Position,
    ClassificationType,
)


class RosterDNAMathEngine:
    """
    Quantitative Dynasty Fantasy Football Portfolio Health Engine.
    """

    # Position peak-performance dropoff thresholds in years
    DROPOFF_THRESHOLDS: Dict[Position, float] = {
        Position.QB: 33.0,
        Position.RB: 26.5,
        Position.WR: 29.5,
        Position.TE: 30.5,
        Position.K: 34.0,
        Position.DEF: 28.0,
        Position.PICK: 23.0,
    }

    # Standard 12-team Superflex starting lineup baseline (~9 starters @ ~2,250 avg market value)
    DEFAULT_LEAGUE_BASELINE_VALUE: float = 20250.0

    # Default starter slots count if not explicitly designated
    DEFAULT_STARTER_SLOTS: int = 9

    @classmethod
    def calculate_remaining_prime(cls, player: MasterPlayer) -> float:
        """
        Calculates remaining prime years relative to position dropoff cliff.
        """
        threshold = cls.DROPOFF_THRESHOLDS.get(player.position, 29.0)
        age = player.age if player.age > 0 else 24.0

        if age <= threshold:
            return round(threshold - age, 2)
        else:
            # Post-cliff decay curve: asymptotic diminishing returns
            decay = 1.0 / (1.0 + (age - threshold) * 1.5)
            return round(max(0.1, decay), 2)

    @classmethod
    def calculate_asset_half_life(cls, players: List[MasterPlayer]) -> float:
        """
        Calculates value-weighted mean age relative to position peak-performance dropoff thresholds.
        Weighted by asset market value so that elite anchors dominate the timeline.
        """
        if not players:
            return 0.0

        total_value = sum(p.market_value for p in players)
        if total_value <= 0:
            # Fallback to arithmetic mean remaining prime
            return round(sum(cls.calculate_remaining_prime(p) for p in players) / len(players), 2)

        weighted_prime_sum = sum(
            p.market_value * cls.calculate_remaining_prime(p)
            for p in players
        )
        half_life = weighted_prime_sum / total_value
        return round(max(0.1, half_life), 2)

    @classmethod
    def split_starters_and_bench(
        cls,
        players: List[MasterPlayer],
        starter_ids: Optional[List[str]] = None,
        slots: int = DEFAULT_STARTER_SLOTS
    ) -> Tuple[List[MasterPlayer], List[MasterPlayer]]:
        """
        Partitions roster into Starting Lineup and Bench.
        If explicit starter_ids are provided, maps those; otherwise takes the top assets.
        """
        if not players:
            return [], []

        # Sort descending by market value
        sorted_players = sorted(players, key=lambda p: p.market_value, reverse=True)

        if starter_ids:
            starter_id_set = set(starter_ids)
            starters = [p for p in sorted_players if p.id in starter_id_set]
            bench = [p for p in sorted_players if p.id not in starter_id_set]
            # If roster has fewer designated starters than slots, backfill with top bench
            if len(starters) < slots and bench:
                needed = slots - len(starters)
                starters.extend(bench[:needed])
                bench = bench[needed:]
            return starters, bench

        # Default: top N highest-valued assets
        starters = sorted_players[:slots]
        bench = sorted_players[slots:]
        return starters, bench

    @classmethod
    def calculate_gross_liquidity(
        cls,
        starters: List[MasterPlayer],
        baseline_value: float = DEFAULT_LEAGUE_BASELINE_VALUE
    ) -> float:
        """
        Calculates Gross Liquidity:
        Sum of top starting asset values normalized against league baseline (0.0 to 150.0+ scale).
        """
        if not starters or baseline_value <= 0:
            return 0.0

        starter_sum = sum(p.market_value for p in starters)
        liquidity = (starter_sum / baseline_value) * 100.0
        return round(liquidity, 1)

    @classmethod
    def calculate_structural_integrity(
        cls,
        starters: List[MasterPlayer],
        bench: List[MasterPlayer],
        baseline_value: float = DEFAULT_LEAGUE_BASELINE_VALUE
    ) -> float:
        """
        Calculates Structural Integrity (0 - 100%):
        Quantifies starting lineup strength vs bench depth variance and roster balance.
        """
        starter_value = sum(p.market_value for p in starters)
        bench_value = sum(p.market_value for p in bench)
        total_value = starter_value + bench_value

        if total_value <= 0:
            return 0.0

        starter_equity = starter_value / total_value  # Target: ~0.60 - 0.72

        # 1. Starting Lineup Power component (0 to 55 pts)
        power_ratio = min(1.3, starter_value / max(1.0, baseline_value))
        power_score = (power_ratio / 1.3) * 55.0

        # 2. Bench Insulation component (0 to 35 pts)
        # Healthy bench should equal at least 35-45% of starter power
        target_bench_value = starter_value * 0.38
        depth_ratio = min(1.2, bench_value / max(1.0, target_bench_value)) if target_bench_value > 0 else 0.0
        depth_score = (depth_ratio / 1.2) * 35.0

        # 3. Balance distribution penalty / bonus (0 to 10 pts)
        # Punish extreme glass cannons (equity > 0.85) or pure depth rosters with no anchors (equity < 0.45)
        ideal_equity = 0.66
        equity_delta = abs(starter_equity - ideal_equity)
        balance_bonus = max(0.0, 10.0 - (equity_delta * 30.0))

        raw_score = power_score + depth_score + balance_bonus
        return round(max(5.0, min(99.0, raw_score)), 1)

    @classmethod
    def classify_roster(
        cls,
        liquidity: float,
        half_life: float,
        integrity: float
    ) -> str:
        """
        Assigns quantitative archetype designation based on DNA metrics.
        """
        if liquidity >= 110.0 and integrity >= 68.0 and half_life >= 2.3:
            return ClassificationType.JUGGERNAUT.value
        elif liquidity >= 95.0 and integrity >= 54.0 and half_life >= 2.0:
            return ClassificationType.CONTENDER.value
        elif liquidity >= 88.0 and (half_life < 2.0 or integrity < 52.0):
            return ClassificationType.FRAUDULENT_CONTENDER.value
        elif half_life >= 3.6 and liquidity < 92.0:
            return ClassificationType.PRODUCTIVE_STRUGGLE.value
        elif liquidity < 72.0 and integrity < 46.0:
            return ClassificationType.TOTAL_REBUILD.value
        else:
            return ClassificationType.MIDDLE_OF_THE_PACK.value

    @classmethod
    def calculate_positional_breakdown(
        cls,
        players: List[MasterPlayer]
    ) -> Dict[str, PositionalBreakdown]:
        """
        Computes positional distribution, capital share, and average age.
        """
        breakdown: Dict[str, Dict[str, Any]] = {
            pos.value: {"count": 0, "total_value": 0.0, "ages": []}
            for pos in Position
        }

        total_roster_value = sum(p.market_value for p in players)

        for p in players:
            pos_key = p.position.value if hasattr(p.position, "value") else str(p.position)
            if pos_key not in breakdown:
                breakdown[pos_key] = {"count": 0, "total_value": 0.0, "ages": []}
            breakdown[pos_key]["count"] += 1
            breakdown[pos_key]["total_value"] += p.market_value
            if p.age > 0:
                breakdown[pos_key]["ages"].append(p.age)

        result: Dict[str, PositionalBreakdown] = {}
        for pos, data in breakdown.items():
            cnt = data["count"]
            tot_val = data["total_value"]
            share = (tot_val / total_roster_value * 100.0) if total_roster_value > 0 else 0.0
            avg_a = (sum(data["ages"]) / len(data["ages"])) if data["ages"] else 0.0
            result[pos] = PositionalBreakdown(
                count=cnt,
                total_value=round(tot_val, 1),
                share_of_roster=round(share, 1),
                avg_age=round(avg_a, 1),
            )

        return result

    @classmethod
    def evaluate_roster(
        cls,
        roster: RosterRecord,
        master_players: List[MasterPlayer],
        baseline_value: float = DEFAULT_LEAGUE_BASELINE_VALUE
    ) -> RosterEvaluationResult:
        """
        Full vector-based evaluation pipeline producing RosterDNAMetrics and RosterEvaluationResult.
        """
        # Map player_ids from roster to MasterPlayer records
        player_dict = {p.id: p for p in master_players}
        roster_players = [player_dict[pid] for pid in roster.player_ids if pid in player_dict]
        unmatched_ids = [pid for pid in roster.player_ids if pid not in player_dict]

        # Partition into starters and bench
        starters, bench = cls.split_starters_and_bench(
            players=roster_players,
            starter_ids=roster.starters,
            slots=cls.DEFAULT_STARTER_SLOTS
        )

        starter_set = set(p.id for p in starters)
        for p in roster_players:
            p.is_starter = p.id in starter_set

        starter_value = sum(p.market_value for p in starters)
        bench_value = sum(p.market_value for p in bench)
        total_value = starter_value + bench_value

        gross_liquidity = cls.calculate_gross_liquidity(starters, baseline_value)
        asset_half_life = cls.calculate_asset_half_life(roster_players)
        structural_integrity = cls.calculate_structural_integrity(starters, bench, baseline_value)
        classification = cls.classify_roster(gross_liquidity, asset_half_life, structural_integrity)

        mean_age = (
            round(sum(p.age for p in roster_players) / len(roster_players), 1)
            if roster_players else 0.0
        )
        starter_equity = round((starter_value / total_value * 100.0), 1) if total_value > 0 else 0.0

        metrics = RosterDNAMetrics(
            classification=classification,
            gross_liquidity=gross_liquidity,
            asset_half_life=asset_half_life,
            structural_integrity=structural_integrity,
            total_roster_value=round(total_value, 1),
            starter_value=round(starter_value, 1),
            bench_value=round(bench_value, 1),
            starter_equity_ratio=starter_equity,
            mean_roster_age=mean_age,
            peak_window_years=round(max(0.5, asset_half_life * 0.9), 1),
        )

        positional = cls.calculate_positional_breakdown(roster_players)

        warnings: List[str] = []
        if unmatched_ids:
            warnings.append(f"{len(unmatched_ids)} player IDs could not be resolved against the Master Database.")
        if metrics.starter_equity_ratio > 82.0:
            warnings.append("High Fragility Warning: Starters represent over 82% of total portfolio valuation.")
        if metrics.asset_half_life < 1.8:
            warnings.append("Age Cliff Alert: Asset half-life indicates roster is within 18 months of peak dropoff.")

        return RosterEvaluationResult(
            roster=roster,
            metrics=metrics,
            players=roster_players,
            starters=starters,
            bench=bench,
            positional_breakdown=positional,
            warnings=warnings,
            unmatched_names=unmatched_ids,
        )
