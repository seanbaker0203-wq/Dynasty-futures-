"""
Dynasty AI Evaluator - Core Pydantic Data Models (Slice 1)
Defines MasterPlayer, RosterRecord, RosterDNAMetrics, and Platform Enums.
"""

from __future__ import annotations
from enum import Enum
from typing import List, Optional, Dict, Any

try:
    from pydantic import BaseModel, Field, ConfigDict
except ImportError:
    # Graceful fallback shim for pure Python environments without Pydantic installed
    class BaseModel:  # type: ignore
        def __init__(self, **kwargs: Any) -> None:
            for k, v in kwargs.items():
                setattr(self, k, v)

        def model_dump(self) -> Dict[str, Any]:
            return self.__dict__

        def dict(self) -> Dict[str, Any]:
            return self.__dict__

    def Field(*args: Any, **kwargs: Any) -> Any:  # type: ignore
        default = kwargs.get("default", None) if "default" in kwargs else (args[0] if args else None)
        return default

    ConfigDict = None  # type: ignore


class Position(str, Enum):
    QB = "QB"
    RB = "RB"
    WR = "WR"
    TE = "TE"
    K = "K"
    DEF = "DEF"
    PICK = "PICK"


class Platform(str, Enum):
    SLEEPER = "sleeper"
    MFL = "mfl"
    CSV = "csv"
    MANUAL = "manual"


class ValuationMode(str, Enum):
    RANKINGS_ASC = "rankings_asc"
    AUCTION_DESC = "auction_desc"


class ClassificationType(str, Enum):
    JUGGERNAUT = "Juggernaut"
    CONTENDER = "Contender"
    PRODUCTIVE_STRUGGLE = "Productive Struggle"
    FRAUDULENT_CONTENDER = "Fraudulent Contender"
    TOTAL_REBUILD = "Total Rebuild"
    MIDDLE_OF_THE_PACK = "Middle of the Pack"


class MasterPlayer(BaseModel):
    """
    Normalized core asset record across dynasty rankings, Sleeper, and MFL databases.
    """
    id: str = Field(description="Unique player identifier (Sleeper ID, MFL ID, or slug)")
    full_name: str = Field(description="Official un-normalized player display name (e.g. Amon-Ra St. Brown)")
    position: Position = Field(description="Fantasy position designation")
    nfl_team: str = Field(description="Current NFL franchise abbreviation or FA")
    age: float = Field(description="Player chronological age in fractional years")
    consensus_rank: int = Field(description="Overall dynasty consensus rank (1-indexed)")
    market_value: float = Field(description="Market value asset currency (0 - 9999 pts)")
    
    # Supplementary fields for analytics & display
    tier: Optional[int] = Field(default=None, description="Consensus position tier")
    is_starter: Optional[bool] = Field(default=False, description="Whether currently projected in starting lineup")
    normalized_name: Optional[str] = Field(default=None, description="Aggressive lowercase alphanumeric sanitized name")


class RosterRecord(BaseModel):
    """
    Raw ingested fantasy roster representation linked to an external platform.
    """
    roster_id: str = Field(description="Internal roster session or database identifier")
    platform: Platform = Field(description="Data provider platform enum")
    external_league_id: str = Field(description="Origin platform league identifier")
    franchise_id: str = Field(description="Origin platform franchise/team identifier")
    player_ids: List[str] = Field(default_factory=list, description="List of player identifiers belonging to franchise")
    valuation_mode: ValuationMode = Field(default=ValuationMode.AUCTION_DESC, description="Valuation algorithm mode")
    
    # League contextual metadata
    league_name: Optional[str] = Field(default=None, description="Display name of the fantasy league")
    franchise_name: Optional[str] = Field(default=None, description="Owner/Team moniker")
    starters: Optional[List[str]] = Field(default_factory=list, description="Active starting lineup player IDs")
    taxi_ids: Optional[List[str]] = Field(default_factory=list, description="Taxi squad player IDs")
    reserve_ids: Optional[List[str]] = Field(default_factory=list, description="Injured Reserve player IDs")


class RosterDNAMetrics(BaseModel):
    """
    Calculated mathematical portfolio health metrics.
    """
    classification: str = Field(
        description="Archetype designation: Juggernaut, Contender, Total Rebuild, Productive Struggle, etc."
    )
    gross_liquidity: float = Field(
        description="Sum of top starting asset values normalized against league baseline (0.0 to 100.0+ index)"
    )
    asset_half_life: float = Field(
        description="Weighted mean age relative to position peak-performance dropoff thresholds (years remaining)"
    )
    structural_integrity: float = Field(
        description="0-100% score quantifying starting lineup strength vs bench depth variance"
    )

    # Granular sub-indexes
    total_roster_value: Optional[float] = Field(default=0.0, description="Gross portfolio aggregate market value")
    starter_value: Optional[float] = Field(default=0.0, description="Gross top starting lineup market value")
    bench_value: Optional[float] = Field(default=0.0, description="Gross bench depth market value")
    starter_equity_ratio: Optional[float] = Field(default=0.0, description="Ratio of starter value to total value")
    mean_roster_age: Optional[float] = Field(default=0.0, description="Arithmetic mean roster age")
    peak_window_years: Optional[float] = Field(default=0.0, description="Projected championship window in seasons")


class PositionalBreakdown(BaseModel):
    """
    Positional distribution and capital allocation.
    """
    count: int = Field(default=0)
    total_value: float = Field(default=0.0)
    share_of_roster: float = Field(default=0.0, description="Percentage of total portfolio value")
    avg_age: float = Field(default=0.0)


class RosterEvaluationResult(BaseModel):
    """
    Complete consolidated evaluation bundle returned to the frontend.
    """
    roster: RosterRecord
    metrics: RosterDNAMetrics
    players: List[MasterPlayer]
    starters: List[MasterPlayer]
    bench: List[MasterPlayer]
    positional_breakdown: Dict[str, PositionalBreakdown]
    warnings: List[str] = Field(default_factory=list)
    unmatched_names: List[str] = Field(default_factory=list)


class SyncRequest(BaseModel):
    """
    Payload for initiating a live API or manual sync.
    """
    platform: Platform
    league_id: str
    username: Optional[str] = None
    franchise_id: Optional[str] = None
    valuation_mode: ValuationMode = ValuationMode.AUCTION_DESC


class FuzzyMatchCandidate(BaseModel):
    """
    Entity resolution result between raw CSV/sync input and Master Database.
    """
    raw_input: str
    normalized_input: str
    matched_player_id: Optional[str] = None
    matched_player_name: Optional[str] = None
    similarity_score: float = 0.0
    is_match: bool = False
