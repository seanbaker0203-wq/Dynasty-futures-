"""
Dynasty AI Evaluator - League Adapters & Ingestion (Slice 3)
Implements the Universal Adapter Pattern for Sleeper & MyFantasyLeague (MFL),
including Sleeper 50MB player payload local minimized caching and MFL SSL bypass.
"""

from abc import ABC, abstractmethod
import json
import os
import re
import ssl
import sys
from typing import List, Dict, Any, Optional, Tuple

# CRITICAL MFL BUG FIX: MFL has an expired SSL certificate.
# Disable insecure request warnings globally at the top of the sync engine.
try:
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
except ImportError:
    pass

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    import urllib.request

from backend.models import (
    RosterRecord,
    Platform,
    ValuationMode,
    MasterPlayer,
    Position,
)
from backend.normalization import NormalizationEngine

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")
SLEEPER_CACHE_FILE = os.path.join(CACHE_DIR, "sleeper_players_min.json")
SEED_PLAYERS_FILE = os.path.join(os.path.dirname(__file__), "data", "seed_players.json")


def _http_get_json(url: str, verify_ssl: bool = True, timeout: int = 15) -> Dict[str, Any]:
    """
    Universal HTTP JSON fetcher supporting requests with verify flag,
    falling back to standard library urllib with custom SSL context.
    """
    if HAS_REQUESTS:
        response = requests.get(url, verify=verify_ssl, timeout=timeout)
        response.raise_for_status()
        return response.json()
    else:
        # Standard library fallback
        ctx = ssl.create_default_context()
        if not verify_ssl:
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Dynasty-AI-Evaluator/1.0"}
        )
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
            data = resp.read().decode("utf-8")
            return json.loads(data)


class LeagueAdapter(ABC):
    """
    The Universal Adapter Pattern (League Sync)
    Abstract base class establishing standard contract for fantasy platforms.
    """

    @abstractmethod
    def fetch_roster(self, league_id: str, identifier: str) -> RosterRecord:
        """
        Fetches single roster record matching league_id and user/franchise identifier.
        """
        pass

    @abstractmethod
    def fetch_league_rosters(self, league_id: str) -> List[RosterRecord]:
        """
        Fetches all rosters in the given league.
        """
        pass


class SleeperAdapter(LeagueAdapter):
    """
    Sleeper API League Adapter.
    Builds local minimized cache of the 50MB Sleeper players JSON on boot
    so requests never timeout.
    """

    _players_cache: Dict[str, Dict[str, Any]] = {}
    _cache_initialized: bool = False

    def __init__(self, auto_init_cache: bool = True) -> None:
        if auto_init_cache and not SleeperAdapter._cache_initialized:
            self.init_player_cache()

    @classmethod
    def init_player_cache(cls, force_refresh: bool = False) -> None:
        """
        MUST build a local, minimized cache of the 50MB Sleeper players JSON on boot
        so the API doesn't time out. Extracts only necessary fields:
        { player_id: { full_name, position, team, age } }
        """
        os.makedirs(CACHE_DIR, exist_ok=True)

        # 1. Load from disk cache if exists and not forcing refresh
        if not force_refresh and os.path.exists(SLEEPER_CACHE_FILE):
            try:
                with open(SLEEPER_CACHE_FILE, "r", encoding="utf-8") as f:
                    cls._players_cache = json.load(f)
                    cls._cache_initialized = True
                    return
            except Exception:
                pass

        # 2. Pre-seed from seed_players.json to guarantee immediate responsiveness
        if os.path.exists(SEED_PLAYERS_FILE):
            try:
                with open(SEED_PLAYERS_FILE, "r", encoding="utf-8") as f:
                    seeds = json.load(f)
                    for p in seeds:
                        pid = p["id"].replace("sleeper_", "")
                        cls._players_cache[pid] = {
                            "full_name": p["full_name"],
                            "position": p["position"],
                            "team": p["nfl_team"],
                            "age": p["age"],
                        }
            except Exception:
                pass

        # 3. Attempt downloading full 50MB Sleeper players JSON and compress
        try:
            url = "https://api.sleeper.app/v1/players/nfl"
            # Short timeout so boot is never blocked
            data = _http_get_json(url, verify_ssl=True, timeout=10)
            minimized: Dict[str, Dict[str, Any]] = {}
            for pid, p in data.items():
                if not isinstance(p, dict):
                    continue
                full_name = p.get("full_name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
                pos = p.get("position") or "WR"
                team = p.get("team") or "FA"
                age = float(p.get("age")) if p.get("age") else 24.0

                if full_name:
                    minimized[str(pid)] = {
                        "full_name": full_name,
                        "position": pos,
                        "team": team,
                        "age": age,
                    }

            if minimized:
                cls._players_cache.update(minimized)
                with open(SLEEPER_CACHE_FILE, "w", encoding="utf-8") as f:
                    json.dump(cls._players_cache, f)

        except Exception:
            # Fallback to seed players cache if Sleeper API is unreachable or times out
            pass
        finally:
            cls._cache_initialized = True

    @classmethod
    def get_player_data(cls, player_id: str) -> Optional[Dict[str, Any]]:
        return cls._players_cache.get(str(player_id))

    def fetch_league_rosters(self, league_id: str) -> List[RosterRecord]:
        """
        Fetches all rosters from Sleeper with associated user metadata.
        """
        rosters_url = f"https://api.sleeper.app/v1/league/{league_id}/rosters"
        users_url = f"https://api.sleeper.app/v1/league/{league_id}/users"
        league_url = f"https://api.sleeper.app/v1/league/{league_id}"

        rosters_raw = _http_get_json(rosters_url)
        users_raw = _http_get_json(users_url)
        league_info = _http_get_json(league_url)
        league_name = league_info.get("name", f"Sleeper League {league_id}")

        user_map: Dict[str, Dict[str, Any]] = {
            u.get("user_id"): u for u in users_raw if isinstance(u, dict)
        }

        records: List[RosterRecord] = []
        for r in rosters_raw:
            roster_id = str(r.get("roster_id", ""))
            owner_id = str(r.get("owner_id", ""))
            user = user_map.get(owner_id, {})
            franchise_name = (
                user.get("metadata", {}).get("team_name")
                or user.get("display_name")
                or f"Team {roster_id}"
            )

            players = [str(pid) for pid in r.get("players") or []]
            starters = [str(pid) for pid in r.get("starters") or []]
            taxi = [str(pid) for pid in r.get("taxi") or []]
            reserve = [str(pid) for pid in r.get("reserve") or []]

            record = RosterRecord(
                roster_id=roster_id,
                platform=Platform.SLEEPER,
                external_league_id=str(league_id),
                franchise_id=owner_id or roster_id,
                player_ids=players,
                valuation_mode=ValuationMode.AUCTION_DESC,
                league_name=league_name,
                franchise_name=franchise_name,
                starters=starters,
                taxi_ids=taxi,
                reserve_ids=reserve,
            )
            records.append(record)

        return records

    def fetch_roster(self, league_id: str, identifier: str) -> RosterRecord:
        """
        Finds a roster in Sleeper by username, display_name, owner_id, or roster_id.
        """
        all_rosters = self.fetch_league_rosters(league_id)
        if not all_rosters:
            raise ValueError(f"No rosters found for Sleeper League ID {league_id}")

        target_norm = NormalizationEngine._normalize_string(identifier)

        # 1. Direct match on franchise_id or roster_id
        for r in all_rosters:
            if r.franchise_id == identifier or r.roster_id == identifier:
                return r

        # 2. Normalized match on franchise name
        for r in all_rosters:
            if NormalizationEngine._normalize_string(r.franchise_name or "") == target_norm:
                return r

        # 3. Match against Sleeper username via API lookup
        try:
            user_info = _http_get_json(f"https://api.sleeper.app/v1/user/{identifier}")
            user_id = user_info.get("user_id")
            if user_id:
                for r in all_rosters:
                    if r.franchise_id == user_id:
                        return r
        except Exception:
            pass

        # Fallback to first roster if specified target cannot be resolved
        return all_rosters[0]


class MFLAdapter(LeagueAdapter):
    """
    MyFantasyLeague (MFL) API Adapter.
    CRITICAL MFL BUG FIX: MFL has an expired SSL certificate.
    Must use requests.get(url, verify=False) and disable warnings.
    Appends &JSON=1 to all calls because MFL defaults to XML.
    """

    DEFAULT_MFL_YEAR = "2024"

    def __init__(self, year: str = DEFAULT_MFL_YEAR) -> None:
        self.year = year

    def fetch_league_rosters(self, league_id: str) -> List[RosterRecord]:
        """
        Fetches all rosters from MyFantasyLeague.
        MFL uses XML by default, so append &JSON=1 to requests.
        CRITICAL: verify=False is strictly enforced.
        """
        rosters_url = f"https://api.myfantasyleague.com/{self.year}/export?TYPE=rosters&L={league_id}&JSON=1"
        league_url = f"https://api.myfantasyleague.com/{self.year}/export?TYPE=league&L={league_id}&JSON=1"

        # Using verify=False as required by MFL expired certificate
        rosters_data = _http_get_json(rosters_url, verify_ssl=False)
        league_data = _http_get_json(league_url, verify_ssl=False)

        league_name = (
            league_data.get("league", {}).get("name")
            or f"MFL League {league_id}"
        )

        franchise_map: Dict[str, str] = {}
        mfl_franchises = league_data.get("league", {}).get("franchises", {}).get("franchise", [])
        if isinstance(mfl_franchises, dict):
            mfl_franchises = [mfl_franchises]
        for f in mfl_franchises:
            fid = str(f.get("id", ""))
            fname = f.get("name", f"Franchise {fid}")
            franchise_map[fid] = fname

        records: List[RosterRecord] = []
        raw_roster_list = rosters_data.get("rosters", {}).get("franchise", [])
        if isinstance(raw_roster_list, dict):
            raw_roster_list = [raw_roster_list]

        for entry in raw_roster_list:
            fid = str(entry.get("id", ""))
            fname = franchise_map.get(fid, f"Franchise {fid}")

            # MFL player entries can be list or single dict
            raw_players = entry.get("player", [])
            if isinstance(raw_players, dict):
                raw_players = [raw_players]

            player_ids: List[str] = []
            starters: List[str] = []

            for p in raw_players:
                if isinstance(p, dict):
                    pid = str(p.get("id", ""))
                    status = p.get("status", "")
                    player_ids.append(pid)
                    if status.upper() in ("STARTER", "START"):
                        starters.append(pid)
                elif isinstance(p, (str, int)):
                    player_ids.append(str(p))

            record = RosterRecord(
                roster_id=fid,
                platform=Platform.MFL,
                external_league_id=str(league_id),
                franchise_id=fid,
                player_ids=player_ids,
                valuation_mode=ValuationMode.AUCTION_DESC,
                league_name=league_name,
                franchise_name=fname,
                starters=starters,
            )
            records.append(record)

        return records

    def fetch_roster(self, league_id: str, identifier: str) -> RosterRecord:
        """
        Fetches specific roster by Franchise ID (e.g. "0001") or Franchise Name.
        """
        all_rosters = self.fetch_league_rosters(league_id)
        if not all_rosters:
            raise ValueError(f"No rosters returned for MFL League ID {league_id}")

        norm_id = identifier.strip().zfill(4) if identifier.strip().isdigit() else identifier.strip()

        # 1. Direct franchise ID match (e.g., 0001 or 1)
        for r in all_rosters:
            if r.franchise_id == norm_id or r.franchise_id.lstrip("0") == identifier.lstrip("0"):
                return r

        # 2. Normalized name match
        norm_name = NormalizationEngine._normalize_string(identifier)
        for r in all_rosters:
            if NormalizationEngine._normalize_string(r.franchise_name or "") == norm_name:
                return r

        # Fallback to first franchise
        return all_rosters[0]


class IngestionPipeline:
    """
    Orchestrates ingestion across Sleeper, MFL, or CSV uploads,
    mapping raw identifiers into fully validated MasterPlayer rosters.
    """

    def __init__(self) -> None:
        self.sleeper_adapter = SleeperAdapter(auto_init_cache=True)
        self.mfl_adapter = MFLAdapter()
        self._master_cache: List[MasterPlayer] = []
        self._load_master_cache()

    def _load_master_cache(self) -> None:
        if os.path.exists(SEED_PLAYERS_FILE):
            with open(SEED_PLAYERS_FILE, "r", encoding="utf-8") as f:
                seeds = json.load(f)
                self._master_cache = [
                    MasterPlayer(
                        id=p["id"],
                        full_name=p["full_name"],
                        position=Position(p["position"]),
                        nfl_team=p["nfl_team"],
                        age=float(p["age"]),
                        consensus_rank=int(p["consensus_rank"]),
                        market_value=float(p["market_value"]),
                    )
                    for p in seeds
                ]

    def get_master_players(self) -> List[MasterPlayer]:
        return self._master_cache

    def resolve_roster_record(
        self,
        platform: Platform,
        league_id: str,
        identifier: str
    ) -> Tuple[RosterRecord, List[MasterPlayer]]:
        """
        Fetches roster from platform adapter and resolves raw player IDs to MasterPlayers.
        """
        if platform == Platform.SLEEPER:
            roster = self.sleeper_adapter.fetch_roster(league_id, identifier)
        elif platform == Platform.MFL:
            roster = self.mfl_adapter.fetch_roster(league_id, identifier)
        else:
            raise ValueError(f"Platform {platform} live adapter not supported.")

        # Resolve IDs to MasterPlayer
        # Master players map by id or normalized name
        id_map = {p.id: p for p in self._master_cache}
        # Also map without prefix e.g. "9226" -> "sleeper_9226"
        for p in self._master_cache:
            raw_id = p.id.replace("sleeper_", "").replace("mfl_", "")
            id_map[raw_id] = p

        resolved_players: List[MasterPlayer] = []
        for pid in roster.player_ids:
            if pid in id_map:
                resolved_players.append(id_map[pid])
            else:
                # Check Sleeper minimized cache
                cached_data = SleeperAdapter.get_player_data(pid)
                if cached_data:
                    # Fuzzy match cached name against master database
                    matched, _, _ = NormalizationEngine.match_player(
                        raw_name=cached_data["full_name"],
                        master_players=self._master_cache
                    )
                    if matched:
                        resolved_players.append(matched)
                    else:
                        # Construct a synthetic unranked player
                        pos_str = cached_data.get("position", "WR")
                        try:
                            pos_enum = Position(pos_str)
                        except ValueError:
                            pos_enum = Position.WR

                        fallback_p = MasterPlayer(
                            id=f"dynasty_{pid}",
                            full_name=cached_data["full_name"],
                            position=pos_enum,
                            nfl_team=cached_data.get("team", "FA"),
                            age=cached_data.get("age", 24.0),
                            consensus_rank=999,
                            market_value=350.0,
                        )
                        resolved_players.append(fallback_p)

        return roster, resolved_players
