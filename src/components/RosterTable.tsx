/**
 * Dynasty AI Evaluator - Roster Table with Active, IR, and Taxi Squad Grouping
 * Structures players into Active Roster (Starters + Bench), Injured Reserve (IR),
 * and Taxi Squad (Developmental), with contract salary, contract year, and market values.
 */

import React, { useState, useMemo } from 'react';
import { MasterPlayer, Position, DraftPick } from '../types';
import { RosterDNAMathEngine } from '../lib/rosterMath';
import {
  Search,
  CheckCircle,
  Clock,
  Shield,
  Layers,
  Sparkles,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  DollarSign,
  UserCheck,
  Flame,
  Coins,
} from 'lucide-react';

interface RosterTableProps {
  players: MasterPlayer[];
  starters: MasterPlayer[];
  bench?: MasterPlayer[];
  activeRoster?: MasterPlayer[];
  injuredReserve?: MasterPlayer[];
  taxiSquad?: MasterPlayer[];
  draftPicks?: DraftPick[];
  totalRosterValue: number;
}

type TabFilter = 'GROUPED' | 'ACTIVE' | 'IR' | 'TAXI' | 'PICKS' | 'ALL';
type SortField = 'market_value' | 'consensus_rank' | 'age' | 'full_name' | 'salary' | 'remaining_prime';
type SortOrder = 'asc' | 'desc';

export const RosterTable: React.FC<RosterTableProps> = ({
  players,
  starters,
  bench,
  activeRoster,
  injuredReserve,
  taxiSquad,
  draftPicks = [],
  totalRosterValue,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<TabFilter>('GROUPED');
  const [sortField, setSortField] = useState<SortField>('market_value');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Compute partitions if not passed directly
  const activePlayers = useMemo(() => {
    if (activeRoster && activeRoster.length > 0) return activeRoster;
    return players.filter((p) => p.roster_designation !== 'IR' && p.roster_designation !== 'TAXI');
  }, [players, activeRoster]);

  const irPlayers = useMemo(() => {
    if (injuredReserve && injuredReserve.length > 0) return injuredReserve;
    return players.filter((p) => p.roster_designation === 'IR');
  }, [players, injuredReserve]);

  const taxiPlayers = useMemo(() => {
    if (taxiSquad && taxiSquad.length > 0) return taxiSquad;
    return players.filter((p) => p.roster_designation === 'TAXI');
  }, [players, taxiSquad]);

  const starterIdSet = useMemo(() => new Set(starters.map((p) => p.id)), [starters]);

  const activeStarters = useMemo(() => {
    return activePlayers.filter((p) => starterIdSet.has(p.id));
  }, [activePlayers, starterIdSet]);

  const activeBench = useMemo(() => {
    return activePlayers.filter((p) => !starterIdSet.has(p.id));
  }, [activePlayers, starterIdSet]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'full_name' || field === 'consensus_rank' ? 'asc' : 'desc');
    }
  };

  const getPositionBadgeClass = (pos: Position | string) => {
    switch (pos) {
      case 'QB':
        return 'bg-rose-950/80 text-rose-300 border-rose-800/80';
      case 'RB':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80';
      case 'WR':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80';
      case 'TE':
        return 'bg-amber-950/80 text-amber-300 border-amber-800/80';
      case 'PK':
      case 'K':
        return 'bg-blue-950/80 text-blue-300 border-blue-800/80';
      case 'Def':
      case 'DEF':
        return 'bg-indigo-950/80 text-indigo-300 border-indigo-800/80';
      default:
        return 'bg-purple-950/80 text-purple-300 border-purple-800/80';
    }
  };

  const filterAndSort = (list: MasterPlayer[]) => {
    let result = [...list];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          p.full_name.toLowerCase().includes(term) ||
          p.nfl_team.toLowerCase().includes(term) ||
          p.position.toLowerCase().includes(term)
      );
    }

    if (positionFilter !== 'ALL') {
      result = result.filter((p) => p.position === positionFilter);
    }

    result.sort((a, b) => {
      let valA: any = a[sortField as keyof MasterPlayer];
      let valB: any = b[sortField as keyof MasterPlayer];

      if (sortField === 'remaining_prime') {
        valA = RosterDNAMathEngine.calculateRemainingPrime(a);
        valB = RosterDNAMathEngine.calculateRemainingPrime(b);
      } else if (sortField === 'salary') {
        valA = Number(a.salary || 0);
        valB = Number(b.salary || 0);
      }

      if (typeof valA === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortOrder === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
    });

    return result;
  };

  const renderPlayerTable = (playerList: MasterPlayer[], isStarterGroup = false) => {
    const list = filterAndSort(playerList);
    if (list.length === 0) {
      return (
        <div className="p-6 text-center text-xs font-mono text-zinc-500">
          No players match the current search or position filter.
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-950/70 text-[11px] text-zinc-400 font-semibold tracking-wider uppercase select-none">
              <th
                onClick={() => handleSort('full_name')}
                className="py-3 px-4 cursor-pointer hover:text-white transition-colors"
              >
                Player & Team
              </th>
              <th className="py-3 px-3 text-center">Pos</th>
              <th
                onClick={() => handleSort('age')}
                className="py-3 px-3 text-right cursor-pointer hover:text-white transition-colors"
              >
                Age
              </th>
              <th
                onClick={() => handleSort('remaining_prime')}
                className="py-3 px-3 text-right cursor-pointer hover:text-white transition-colors hidden sm:table-cell"
              >
                Prime Runway
              </th>
              <th
                onClick={() => handleSort('salary')}
                className="py-3 px-3 text-right cursor-pointer hover:text-white transition-colors hidden md:table-cell"
              >
                Salary / Contract
              </th>
              <th
                onClick={() => handleSort('market_value')}
                className="py-3 px-4 text-right cursor-pointer hover:text-white transition-colors"
              >
                Market Value
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {list.map((player) => {
              const remainingPrime = RosterDNAMathEngine.calculateRemainingPrime(player);
              const isStarter = starterIdSet.has(player.id);
              const isIR = player.roster_designation === 'IR';
              const isTaxi = player.roster_designation === 'TAXI';

              return (
                <tr
                  key={player.id}
                  className={`hover:bg-zinc-800/40 transition-colors ${
                    isStarter ? 'bg-cyan-950/10' : isIR ? 'bg-rose-950/10' : isTaxi ? 'bg-purple-950/10' : ''
                  }`}
                >
                  {/* Player & Status Badges */}
                  <td className="py-2.5 px-4 font-sans">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-zinc-100 text-sm">{player.full_name}</span>

                      {/* Status Tags */}
                      {isStarter && (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                          STARTER
                        </span>
                      )}
                      {isIR && (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                          IR
                        </span>
                      )}
                      {isTaxi && (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                          TAXI
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {player.nfl_team} • #{player.consensus_rank || 999} Overall
                    </span>
                  </td>

                  {/* Position */}
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 text-[11px] font-bold rounded border ${getPositionBadgeClass(
                        player.position
                      )}`}
                    >
                      {player.position}
                    </span>
                  </td>

                  {/* Age */}
                  <td className="py-2.5 px-3 text-right text-zinc-300 font-mono">
                    {player.age > 0 ? player.age.toFixed(1) : '24.0'}
                  </td>

                  {/* Remaining Prime Runway */}
                  <td className="py-2.5 px-3 text-right hidden sm:table-cell">
                    <span
                      className={`font-mono text-xs font-semibold ${
                        remainingPrime >= 3.0
                          ? 'text-emerald-400'
                          : remainingPrime >= 1.5
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {remainingPrime.toFixed(1)} yrs
                    </span>
                  </td>

                  {/* Contract Salary / Year */}
                  <td className="py-2.5 px-3 text-right text-zinc-400 font-mono hidden md:table-cell">
                    {player.salary ? (
                      <span>
                        ${player.salary}
                        {player.contract_year ? ` (Yr ${player.contract_year})` : ''}
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>

                  {/* Market Value */}
                  <td className="py-2.5 px-4 text-right">
                    <span className="font-bold text-white font-mono text-sm">
                      {player.market_value.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-zinc-500 block font-mono">pts</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl space-y-4">
      {/* Top Header & Filter Controls */}
      <div className="p-4 md:p-5 border-b border-zinc-800 bg-zinc-950/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              Roster Portfolio Ledger
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-bold">
                {players.length} Total Players
              </span>
            </h3>
          </div>
          <p className="text-xs text-zinc-400">
            Categorized by Active Roster, Injured Reserve (IR), and Taxi Squad.
          </p>
        </div>

        {/* View Filters & Position Tabs */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Section Tabs */}
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-1 text-xs font-mono">
            <button
              type="button"
              onClick={() => setActiveTab('GROUPED')}
              className={`px-3 py-1 rounded transition-all cursor-pointer font-bold ${
                activeTab === 'GROUPED'
                  ? 'bg-zinc-800 text-cyan-400 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Grouped View
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ACTIVE')}
              className={`px-3 py-1 rounded transition-all cursor-pointer font-semibold ${
                activeTab === 'ACTIVE'
                  ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Active ({activePlayers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('IR')}
              className={`px-3 py-1 rounded transition-all cursor-pointer font-semibold ${
                activeTab === 'IR'
                  ? 'bg-zinc-800 text-rose-400 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              IR ({irPlayers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('TAXI')}
              className={`px-3 py-1 rounded transition-all cursor-pointer font-semibold ${
                activeTab === 'TAXI'
                  ? 'bg-zinc-800 text-purple-400 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Taxi ({taxiPlayers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PICKS')}
              className={`px-3 py-1 rounded transition-all cursor-pointer font-semibold ${
                activeTab === 'PICKS'
                  ? 'bg-zinc-800 text-cyan-400 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Picks ({draftPicks.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1 rounded transition-all cursor-pointer font-semibold ${
                activeTab === 'ALL'
                  ? 'bg-zinc-800 text-zinc-200 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All Flat
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[170px]">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search player/team..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs rounded-lg pl-9 pr-3 py-1.5 outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Position Filter */}
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-cyan-500 font-mono cursor-pointer"
          >
            <option value="ALL">All Pos</option>
            <option value="QB">QB</option>
            <option value="RB">RB</option>
            <option value="WR">WR</option>
            <option value="TE">TE</option>
            <option value="K">K / PK</option>
            <option value="DEF">DEF</option>
          </select>
        </div>
      </div>

      {/* Main Content: Grouped by Section (DEFAULT) */}
      {activeTab === 'GROUPED' && (
        <div className="space-y-6 p-4 md:p-5 pt-0">
          {/* SECTION 1: ACTIVE ROSTER (Starters + Bench) */}
          <div className="border border-emerald-900/50 rounded-xl overflow-hidden bg-zinc-950/40">
            <div className="p-3.5 bg-emerald-950/30 border-b border-emerald-900/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                  <UserCheck className="w-3.5 h-3.5" />
                </span>
                <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                  Active Roster ({activePlayers.length} Players)
                </h4>
              </div>
              <span className="text-xs font-mono text-emerald-400 font-bold">
                {activeStarters.length} Starters • {activeBench.length} Bench Reserves
              </span>
            </div>

            {/* Sub-group: Starting Lineup */}
            <div className="border-b border-zinc-800/80">
              <div className="px-4 py-2 bg-zinc-900/70 text-[11px] font-mono text-cyan-300 font-bold flex items-center justify-between">
                <span>STARTING LINEUP ({activeStarters.length} SLOTS)</span>
                <span>Top Starting Power: {activeStarters.reduce((s, p) => s + p.market_value, 0).toLocaleString()} pts</span>
              </div>
              {renderPlayerTable(activeStarters, true)}
            </div>

            {/* Sub-group: Bench Depth */}
            <div>
              <div className="px-4 py-2 bg-zinc-900/50 text-[11px] font-mono text-zinc-400 font-bold flex items-center justify-between">
                <span>BENCH RESERVES ({activeBench.length} PLAYERS)</span>
                <span>Bench Insulation: {activeBench.reduce((s, p) => s + p.market_value, 0).toLocaleString()} pts</span>
              </div>
              {renderPlayerTable(activeBench, false)}
            </div>
          </div>

          {/* SECTION 2: INJURED RESERVE (IR) */}
          <div className="border border-rose-900/60 rounded-xl overflow-hidden bg-zinc-950/40">
            <div className="p-3.5 bg-rose-950/30 border-b border-rose-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-rose-950 text-rose-400 border border-rose-800">
                  <AlertOctagon className="w-3.5 h-3.5" />
                </span>
                <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                  Injured Reserve ({irPlayers.length} Players on IR)
                </h4>
              </div>
              <span className="text-xs font-mono text-rose-400 font-bold">
                Capital Stashed: {irPlayers.reduce((s, p) => s + p.market_value, 0).toLocaleString()} pts
              </span>
            </div>
            {renderPlayerTable(irPlayers, false)}
          </div>

          {/* SECTION 3: TAXI SQUAD (Developmental) */}
          <div className="border border-purple-900/60 rounded-xl overflow-hidden bg-zinc-950/40">
            <div className="p-3.5 bg-purple-950/30 border-b border-purple-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-purple-950 text-purple-400 border border-purple-800">
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
                <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                  Taxi Squad ({taxiPlayers.length} Developmental Rookies)
                </h4>
              </div>
              <span className="text-xs font-mono text-purple-400 font-bold">
                Taxi Valuation: {taxiPlayers.reduce((s, p) => s + p.market_value, 0).toLocaleString()} pts
              </span>
            </div>
            {renderPlayerTable(taxiPlayers, false)}
          </div>

          {/* SECTION 4: DRAFT CAPITAL PORTFOLIO */}
          <div className="border border-cyan-900/60 rounded-xl overflow-hidden bg-zinc-950/40">
            <div className="p-3.5 bg-cyan-950/30 border-b border-cyan-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  <Coins className="w-3.5 h-3.5" />
                </span>
                <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                  Draft Capital Portfolio ({draftPicks.length} Picks Owned)
                </h4>
              </div>
              <span className="text-xs font-mono text-cyan-400 font-bold">
                Pick Valuation: {draftPicks.reduce((s, p) => s + p.market_value, 0).toLocaleString()} pts
              </span>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {draftPicks.length === 0 ? (
                <div className="col-span-full py-4 text-center text-xs text-zinc-500 font-mono">
                  No draft picks recorded for this franchise.
                </div>
              ) : (
                draftPicks.map((pick) => (
                  <div
                    key={pick.id}
                    className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 flex items-center justify-between font-mono text-xs hover:border-cyan-500/40 transition-colors"
                  >
                    <div>
                      <div className="font-bold text-white text-xs">{pick.description}</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        Round {pick.round} • Class of {pick.year}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-cyan-400 font-bold">{pick.market_value.toLocaleString()}</span>
                      <span className="block text-[9px] text-zinc-500 uppercase">pts</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alternative View: Specific Tab Selected */}
      {activeTab === 'ACTIVE' && (
        <div className="p-4 md:p-5 pt-0">
          <div className="border border-emerald-900/50 rounded-xl overflow-hidden">
            {renderPlayerTable(activePlayers, false)}
          </div>
        </div>
      )}

      {activeTab === 'IR' && (
        <div className="p-4 md:p-5 pt-0">
          <div className="border border-rose-900/50 rounded-xl overflow-hidden">
            {renderPlayerTable(irPlayers, false)}
          </div>
        </div>
      )}

      {activeTab === 'TAXI' && (
        <div className="p-4 md:p-5 pt-0">
          <div className="border border-purple-900/50 rounded-xl overflow-hidden">
            {renderPlayerTable(taxiPlayers, false)}
          </div>
        </div>
      )}

      {activeTab === 'PICKS' && (
        <div className="p-4 md:p-5 pt-0">
          <div className="border border-cyan-900/50 rounded-xl overflow-hidden bg-zinc-950/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-mono uppercase text-zinc-400 font-bold">
                Owned Draft Picks ({draftPicks.length})
              </span>
              <span className="text-xs font-mono text-cyan-400 font-bold">
                Total Equity: {draftPicks.reduce((s, p) => s + p.market_value, 0).toLocaleString()} pts
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {draftPicks.map((pick) => (
                <div
                  key={pick.id}
                  className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-between font-mono text-xs"
                >
                  <div>
                    <div className="font-bold text-white">{pick.description}</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      Round {pick.round} • {pick.year}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-cyan-400 font-bold">{pick.market_value.toLocaleString()}</span>
                    <span className="block text-[9px] text-zinc-500 uppercase">pts</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ALL' && (
        <div className="p-4 md:p-5 pt-0">
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            {renderPlayerTable(players, false)}
          </div>
        </div>
      )}
    </div>
  );
};
