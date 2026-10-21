"""
Dynasty AI Evaluator - FastAPI Application (Slice 4)
Wires League Adapters (Sleeper, MFL) directly to the Normalization and Roster DNA Math Engines.
Endpoints:
  - POST /sync/sleeper & GET /sync/sleeper
  - POST /sync/mfl & GET /sync/mfl
  - POST /evaluate/roster
  - POST /match/fuzzy
  - GET /players
  - GET /health
"""

import sys
import os
from typing import Optional, List, Dict, Any

# Ensure parent directory is on python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    from fastapi import FastAPI, HTTPException, Query
    from fastapi.middleware.cors import CORSMiddleware
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

from backend.models import (
    Platform,
    SyncRequest,
    RosterRecord,
    RosterEvaluationResult,
    FuzzyMatchCandidate,
    MasterPlayer,
    ValuationMode,
)
from backend.normalization import NormalizationEngine
from backend.roster_math import RosterDNAMathEngine
from backend.adapters import SleeperAdapter, MFLAdapter, IngestionPipeline

# Initialize shared components
ingestion = IngestionPipeline()
sleeper_adapter = SleeperAdapter(auto_init_cache=True)
mfl_adapter = MFLAdapter()


def create_app() -> Any:
    if not HAS_FASTAPI:
        return None

    app = FastAPI(
        title="Dynasty AI Evaluator - Roster DNA API",
        description="Quantitative dynasty fantasy football portfolio health and roster DNA engine.",
        version="1.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health_check() -> Dict[str, Any]:
        return {
            "status": "healthy",
            "service": "Dynasty AI Evaluator API",
            "cached_master_players": len(ingestion.get_master_players()),
        }

    @app.get("/players", response_model=List[MasterPlayer])
    def get_master_players() -> List[MasterPlayer]:
        """Returns the consensus dynasty master players dataset."""
        return ingestion.get_master_players()

    @app.post("/sync/sleeper", response_model=RosterEvaluationResult)
    def sync_sleeper_post(request: SyncRequest) -> RosterEvaluationResult:
        """
        Synchronizes roster from Sleeper API and calculates Roster DNA portfolio metrics.
        """
        identifier = request.username or request.franchise_id or ""
        return process_sleeper_sync(request.league_id, identifier, request.valuation_mode)

    @app.get("/sync/sleeper", response_model=RosterEvaluationResult)
    def sync_sleeper_get(
        league_id: str = Query(..., description="Sleeper League ID"),
        username: Optional[str] = Query(None, description="Sleeper username or user_id"),
        franchise_id: Optional[str] = Query(None, description="Sleeper franchise or roster ID"),
        valuation_mode: ValuationMode = ValuationMode.AUCTION_DESC,
    ) -> RosterEvaluationResult:
        """
        GET wrapper for Sleeper sync.
        """
        identifier = username or franchise_id or ""
        return process_sleeper_sync(league_id, identifier, valuation_mode)

    @app.post("/sync/mfl", response_model=RosterEvaluationResult)
    def sync_mfl_post(request: SyncRequest) -> RosterEvaluationResult:
        """
        Synchronizes roster from MyFantasyLeague (MFL) using SSL bypass and &JSON=1,
        evaluating complete portfolio health.
        """
        identifier = request.franchise_id or request.username or "0001"
        return process_mfl_sync(request.league_id, identifier, request.valuation_mode)

    @app.get("/sync/mfl", response_model=RosterEvaluationResult)
    def sync_mfl_get(
        league_id: str = Query(..., description="MFL League ID (e.g., 54321)"),
        franchise_id: Optional[str] = Query(None, description="MFL 4-digit franchise ID (e.g. 0001)"),
        username: Optional[str] = Query(None, description="Franchise moniker"),
        valuation_mode: ValuationMode = ValuationMode.AUCTION_DESC,
    ) -> RosterEvaluationResult:
        """
        GET wrapper for MyFantasyLeague sync.
        """
        identifier = franchise_id or username or "0001"
        return process_mfl_sync(league_id, identifier, valuation_mode)

    @app.post("/evaluate/roster", response_model=RosterEvaluationResult)
    def evaluate_roster(roster: RosterRecord) -> RosterEvaluationResult:
        """
        Direct mathematical evaluation of an arbitrary RosterRecord against the Master Benchmark.
        """
        master_players = ingestion.get_master_players()
        return RosterDNAMathEngine.evaluate_roster(roster, master_players)

    @app.post("/match/fuzzy", response_model=List[FuzzyMatchCandidate])
    def fuzzy_match_names(names: List[str]) -> List[FuzzyMatchCandidate]:
        """
        Aggressive String Normalization + RapidFuzz matching against Master Player database.
        """
        master_players = ingestion.get_master_players()
        return NormalizationEngine.batch_match(names, master_players, threshold=85.0)

    return app


def process_sleeper_sync(
    league_id: str,
    identifier: str,
    valuation_mode: ValuationMode = ValuationMode.AUCTION_DESC
) -> RosterEvaluationResult:
    """
    Core business logic wiring Sleeper adapter to the Math engine.
    """
    try:
        roster, resolved_players = ingestion.resolve_roster_record(
            platform=Platform.SLEEPER,
            league_id=league_id,
            identifier=identifier
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Sleeper Sync Error: {str(exc)}")

    roster.valuation_mode = valuation_mode
    master_players = ingestion.get_master_players()
    all_player_candidates = {p.id: p for p in (master_players + resolved_players)}

    result = RosterDNAMathEngine.evaluate_roster(
        roster=roster,
        master_players=list(all_player_candidates.values())
    )
    return result


def process_mfl_sync(
    league_id: str,
    identifier: str,
    valuation_mode: ValuationMode = ValuationMode.AUCTION_DESC
) -> RosterEvaluationResult:
    """
    Core business logic wiring MFL adapter to the Math engine.
    """
    try:
        roster, resolved_players = ingestion.resolve_roster_record(
            platform=Platform.MFL,
            league_id=league_id,
            identifier=identifier
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"MFL Sync Error: {str(exc)}")

    roster.valuation_mode = valuation_mode
    master_players = ingestion.get_master_players()
    all_player_candidates = {p.id: p for p in (master_players + resolved_players)}

    result = RosterDNAMathEngine.evaluate_roster(
        roster=roster,
        master_players=list(all_player_candidates.values())
    )
    return result


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
