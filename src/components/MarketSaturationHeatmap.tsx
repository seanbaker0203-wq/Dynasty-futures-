/**
 * Dynasty AI Evaluator - Market Saturation & Performance Tier Heatmap (D3)
 * Maps league-wide player trade values relative to the rest of the league,
 * visualizing market saturation, liquidity bottlenecks, and player performance tiers.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { MasterPlayer, DraftPick, LeagueTeamSummary } from '../types';
import { generateDemoLeagueTeams } from '../lib/demoLeague';
import {
  Flame,
  Layers,
  Sparkles,
  BarChart3,
  TrendingUp,
  Info,
  ArrowRight,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
  Target,
  ExternalLink,
  Users,
} from 'lucide-react';

export interface HeatmapPlayerRecord {
  player: MasterPlayer;
  ownerFranchiseId: string;
  ownerFranchiseName: string;
  isUser: boolean;
  isTargetOpponent: boolean;
  tierId: string;
  tierName: string;
  segmentId: string;
  segmentName: string;
}

export interface HeatmapCellData {
  tierId: string;
  tierName: string;
  tierIndex: number;
  segmentId: string;
  segmentName: string;
  segmentIndex: number;
  players: HeatmapPlayerRecord[];
  totalPlayers: number;
  userPlayersCount: number;
  opponentPlayersCount: number;
  totalMarketValue: number;
  avgMarketValue: number;
  saturationIndex: number; // 100 = league average equilibrium; > 120 = saturated; < 80 = scarce
  userDominancePct: number; // percentage of this cell owned by user
}

interface MarketSaturationHeatmapProps {
  userTeam: {
    franchise_id: string;
    franchise_name?: string;
    players: MasterPlayer[];
    draft_picks?: DraftPick[];
  };
  opponentTeam?: {
    franchise_id: string;
    franchise_name?: string;
    players: MasterPlayer[];
    draft_picks?: DraftPick[];
  };
  leagueTeams?: LeagueTeamSummary[];
  onSelectSendPlayer?: (player: MasterPlayer) => void;
  onSelectReceivePlayer?: (player: MasterPlayer) => void;
  onLaunchAITrade?: (shopPlayer?: MasterPlayer, targetPlayer?: MasterPlayer) => void;
  onBackToBuilder?: () => void;
}

export const MarketSaturationHeatmap: React.FC<MarketSaturationHeatmapProps> = ({
  userTeam,
  opponentTeam,
  leagueTeams,
  onSelectSendPlayer,
  onSelectReceivePlayer,
  onLaunchAITrade,
  onBackToBuilder,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Dimension Modes: By Position or By Valuation / Liquidity Bands
  const [dimensionMode, setDimensionMode] = useState<'POSITION' | 'LIQUIDITY_BAND'>('POSITION');
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [heatmapMetric, setHeatmapMetric] = useState<'SATURATION' | 'PLAYER_COUNT' | 'VALUE_DENSITY' | 'USER_SHARE'>('SATURATION');
  const [selectedCell, setSelectedCell] = useState<HeatmapCellData | null>(null);
  const [hoveredCell, setHoveredCell] = useState<HeatmapCellData | null>(null);

  // Guarantee a complete 10-12 team league ecosystem for market saturation calculations
  const effectiveLeagueTeams = useMemo(() => {
    if (leagueTeams && leagueTeams.length >= 4) {
      return leagueTeams;
    }
    const demo = generateDemoLeagueTeams(userTeam.franchise_name || 'Your Team');
    return demo.league_teams;
  }, [leagueTeams, userTeam.franchise_name]);

  // Aggregate all players across the entire league with ownership metadata
  const allLeaguePlayers = useMemo(() => {
    const list: HeatmapPlayerRecord[] = [];
    const seenPlayerIds = new Set<string>();

    // 1. User Roster Players
    userTeam.players.forEach((p) => {
      seenPlayerIds.add(p.id);
      list.push({
        player: p,
        ownerFranchiseId: userTeam.franchise_id,
        ownerFranchiseName: userTeam.franchise_name || 'Your Team',
        isUser: true,
        isTargetOpponent: false,
        tierId: '',
        tierName: '',
        segmentId: '',
        segmentName: '',
      });
    });

    // 2. Opponent & League Teams
    effectiveLeagueTeams.forEach((team) => {
      const isOpponent = opponentTeam ? team.franchise_id === opponentTeam.franchise_id : false;
      const isUserTeam = team.franchise_id === userTeam.franchise_id;
      if (isUserTeam) return;

      const teamRoster = [...(team.starters || []), ...(team.bench || [])];
      teamRoster.forEach((p) => {
        if (!seenPlayerIds.has(p.id)) {
          seenPlayerIds.add(p.id);
          list.push({
            player: p,
            ownerFranchiseId: team.franchise_id,
            ownerFranchiseName: team.franchise_name,
            isUser: false,
            isTargetOpponent: isOpponent,
            tierId: '',
            tierName: '',
            segmentId: '',
            segmentName: '',
          });
        }
      });
    });

    return list;
  }, [userTeam, opponentTeam, effectiveLeagueTeams]);

  // Performance Tiers Definitions (Y-Axis)
  const performanceTiers = useMemo(
    () => [
      {
        id: 'tier-1',
        name: 'Tier 1: Apex Cornerstone',
        shortName: 'T1 Apex',
        desc: 'Elite Game-Changers (Value ≥ 7,000 or PPG ≥ 18.0)',
        minVal: 7000,
        maxVal: 10000,
      },
      {
        id: 'tier-2',
        name: 'Tier 2: Premium Starter',
        shortName: 'T2 Premium',
        desc: 'High-Ceiling Starters (Value 5,000 – 6,999 or PPG 14.5 – 18.0)',
        minVal: 5000,
        maxVal: 6999,
      },
      {
        id: 'tier-3',
        name: 'Tier 3: Quality Flex',
        shortName: 'T3 Flex',
        desc: 'Weekly Flex Contributors (Value 3,200 – 4,999 or PPG 11.0 – 14.5)',
        minVal: 3200,
        maxVal: 4999,
      },
      {
        id: 'tier-4',
        name: 'Tier 4: Roster Depth',
        shortName: 'T4 Depth',
        desc: 'Rotational & Handcuffs (Value 1,600 – 3,199 or PPG 7.5 – 11.0)',
        minVal: 1600,
        maxVal: 3199,
      },
      {
        id: 'tier-5',
        name: 'Tier 5: Stash & Prospects',
        shortName: 'T5 Stash',
        desc: 'Speculative Upside (Value < 1,600 or PPG < 7.5)',
        minVal: 0,
        maxVal: 1599,
      },
    ],
    []
  );

  // Market Segments (X-Axis) based on dimensionMode
  const marketSegments = useMemo(() => {
    if (dimensionMode === 'POSITION') {
      return [
        { id: 'QB', name: 'Quarterbacks (QB)', shortName: 'QB' },
        { id: 'RB', name: 'Running Backs (RB)', shortName: 'RB' },
        { id: 'WR', name: 'Wide Receivers (WR)', shortName: 'WR' },
        { id: 'TE', name: 'Tight Ends (TE)', shortName: 'TE' },
      ];
    } else {
      return [
        { id: 'micro', name: 'Micro Liquidity (< 2k)', shortName: '< 2k' },
        { id: 'mid', name: 'Mid Liquidity (2k - 4k)', shortName: '2k-4k' },
        { id: 'core', name: 'Liquid Core (4k - 6k)', shortName: '4k-6k' },
        { id: 'premium', name: 'Premium Tier (6k - 8k)', shortName: '6k-8k' },
        { id: 'apex', name: 'Apex Blue Chip (8k+)', shortName: '8k+' },
      ];
    }
  }, [dimensionMode]);

  // Compute Heatmap Matrix Data
  const heatmapData = useMemo(() => {
    // Filter players by position if in LIQUIDITY_BAND mode
    const filteredPlayers = allLeaguePlayers.filter((item) => {
      if (dimensionMode === 'LIQUIDITY_BAND' && positionFilter !== 'ALL') {
        return item.player.position === positionFilter;
      }
      return true;
    });

    const totalEligible = filteredPlayers.length || 1;
    const cells: HeatmapCellData[] = [];

    // Helper: Determine Tier ID for player
    const getPlayerTier = (p: MasterPlayer) => {
      const val = p.market_value || 0;
      if (val >= 7000) return performanceTiers[0];
      if (val >= 5000) return performanceTiers[1];
      if (val >= 3200) return performanceTiers[2];
      if (val >= 1600) return performanceTiers[3];
      return performanceTiers[4];
    };

    // Helper: Determine Segment ID for player
    const getPlayerSegment = (p: MasterPlayer) => {
      if (dimensionMode === 'POSITION') {
        return marketSegments.find((s) => s.id === p.position) || null;
      } else {
        const val = p.market_value || 0;
        if (val < 2000) return marketSegments[0];
        if (val < 4000) return marketSegments[1];
        if (val < 6000) return marketSegments[2];
        if (val < 8000) return marketSegments[3];
        return marketSegments[4];
      }
    };

    // Assign tier & segment to each player record
    const classifiedPlayers = filteredPlayers.map((item) => {
      const tier = getPlayerTier(item.player);
      const segment = getPlayerSegment(item.player);
      return {
        ...item,
        tierId: tier.id,
        tierName: tier.name,
        segmentId: segment ? segment.id : 'unknown',
        segmentName: segment ? segment.name : 'Unknown',
      };
    });

    // Expected equilibrium density per cell = 100 / (tiers * segments)
    const expectedPerCell = totalEligible / (performanceTiers.length * marketSegments.length);

    performanceTiers.forEach((tier, tIdx) => {
      marketSegments.forEach((seg, sIdx) => {
        const cellPlayers = classifiedPlayers.filter(
          (p) => p.tierId === tier.id && p.segmentId === seg.id
        );

        const totalPlayers = cellPlayers.length;
        const userPlayersCount = cellPlayers.filter((p) => p.isUser).length;
        const opponentPlayersCount = cellPlayers.filter((p) => p.isTargetOpponent).length;
        const totalMarketValue = cellPlayers.reduce((sum, p) => sum + (p.player.market_value || 0), 0);
        const avgMarketValue = totalPlayers > 0 ? Math.round(totalMarketValue / totalPlayers) : 0;

        // Saturation index: relative to expected uniform distribution
        // 100 = baseline; 150 = 50% surplus concentration; 50 = scarce
        const saturationIndex =
          expectedPerCell > 0
            ? Math.round((totalPlayers / expectedPerCell) * 100)
            : 0;

        const userDominancePct =
          totalPlayers > 0 ? Math.round((userPlayersCount / totalPlayers) * 100) : 0;

        cells.push({
          tierId: tier.id,
          tierName: tier.name,
          tierIndex: tIdx,
          segmentId: seg.id,
          segmentName: seg.name,
          segmentIndex: sIdx,
          players: cellPlayers,
          totalPlayers,
          userPlayersCount,
          opponentPlayersCount,
          totalMarketValue,
          avgMarketValue,
          saturationIndex,
          userDominancePct,
        });
      });
    });

    return cells;
  }, [allLeaguePlayers, performanceTiers, marketSegments, dimensionMode, positionFilter]);

  // Aggregate Market Stats
  const marketSummary = useMemo(() => {
    const totalAssets = heatmapData.reduce((sum, c) => sum + c.totalPlayers, 0);
    const userTotalAssets = heatmapData.reduce((sum, c) => sum + c.userPlayersCount, 0);
    const userMarketSharePct = totalAssets > 0 ? Math.round((userTotalAssets / totalAssets) * 100) : 0;

    // Find most saturated cell
    const sortedBySat = [...heatmapData].sort((a, b) => b.saturationIndex - a.saturationIndex);
    const mostSaturated = sortedBySat[0];

    // Find highest scarcity cell in T1 or T2
    const topTiers = heatmapData.filter((c) => c.tierIndex <= 1);
    const highestScarcity = [...topTiers].sort((a, b) => a.totalPlayers - b.totalPlayers)[0];

    // Find user surplus cell (highest user count)
    const sortedUser = [...heatmapData].sort((a, b) => b.userPlayersCount - a.userPlayersCount);
    const userSurplus = sortedUser[0];

    return {
      totalAssets,
      userTotalAssets,
      userMarketSharePct,
      mostSaturated,
      highestScarcity,
      userSurplus,
    };
  }, [heatmapData]);

  // Select default cell for drilldown when none selected or data changes
  useEffect(() => {
    if (!selectedCell && heatmapData.length > 0) {
      // Pick a cell with user players if available
      const cellWithUser = heatmapData.find((c) => c.userPlayersCount > 0) || heatmapData[0];
      setSelectedCell(cellWithUser);
    }
  }, [heatmapData, selectedCell]);

  // D3 Heatmap Rendering
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || heatmapData.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const containerWidth = containerRef.current.clientWidth || 800;
    const margin = { top: 40, right: 30, bottom: 60, left: 160 };
    const width = Math.max(containerWidth, 680) - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    svg
      .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .attr('width', '100%')
      .attr('height', '100%');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // X Scale: Market Segments
    const x = d3
      .scaleBand()
      .range([0, width])
      .domain(marketSegments.map((s) => s.id))
      .padding(0.06);

    // Y Scale: Performance Tiers
    const y = d3
      .scaleBand()
      .range([0, height])
      .domain(performanceTiers.map((t) => t.id))
      .padding(0.06);

    // Dynamic Color Scale based on selected heatmapMetric
    let colorScale: (val: number) => string;

    if (heatmapMetric === 'SATURATION') {
      // Saturation index: 0 = cyan scarcity, 100 = emerald parity, 150 = amber, 200+ = rose saturation
      colorScale = (val: number) => {
        if (val === 0) return '#18181b'; // zinc-900 empty
        if (val < 60) return '#083344'; // deep cyan (scarce)
        if (val < 90) return '#0e7490'; // light cyan
        if (val <= 115) return '#059669'; // emerald (healthy parity)
        if (val <= 150) return '#d97706'; // amber (elevated saturation)
        return '#e11d48'; // rose (heavy market congestion / glut)
      };
    } else if (heatmapMetric === 'PLAYER_COUNT') {
      const maxCount = d3.max(heatmapData, (d) => d.totalPlayers) || 10;
      colorScale = (val: number) => {
        const t = Math.min(val / maxCount, 1);
        return d3.interpolateCividis(t);
      };
    } else if (heatmapMetric === 'USER_SHARE') {
      colorScale = (val: number) => {
        if (val === 0) return '#18181b';
        if (val < 25) return '#1e293b';
        if (val < 50) return '#0284c7';
        if (val < 75) return '#059669';
        return '#f59e0b'; // golden monopoly
      };
    } else {
      // VALUE_DENSITY
      const maxVal = d3.max(heatmapData, (d) => d.totalMarketValue) || 50000;
      colorScale = (val: number) => {
        const t = Math.min(val / maxVal, 1);
        return d3.interpolateViridis(t);
      };
    }

    // Render X Axis (Top & Bottom)
    const xAxis = d3.axisTop(x).tickFormat((d) => {
      const seg = marketSegments.find((s) => s.id === d);
      return seg ? seg.shortName : d;
    });

    g.append('g')
      .attr('class', 'x-axis')
      .call(xAxis)
      .selectAll('text')
      .style('fill', '#e4e4e7')
      .style('font-family', 'ui-monospace, monospace')
      .style('font-size', '11px')
      .style('font-weight', 'bold');

    g.selectAll('.x-axis path, .x-axis line').style('stroke', '#3f3f46');

    // Render Y Axis (Left)
    const yAxis = d3.axisLeft(y).tickFormat((d) => {
      const tier = performanceTiers.find((t) => t.id === d);
      return tier ? tier.shortName : d;
    });

    g.append('g')
      .attr('class', 'y-axis')
      .call(yAxis)
      .selectAll('text')
      .style('fill', '#cbd5e1')
      .style('font-family', 'ui-monospace, monospace')
      .style('font-size', '11px')
      .style('font-weight', 'bold');

    g.selectAll('.y-axis path, .y-axis line').style('stroke', '#3f3f46');

    // Draw Heatmap Cells
    const cellGroups = g
      .selectAll('.cell-group')
      .data(heatmapData)
      .enter()
      .append('g')
      .attr('class', 'cell-group')
      .attr('transform', (d) => `translate(${x(d.segmentId)},${y(d.tierId)})`)
      .style('cursor', 'pointer')
      .on('click', (_, d) => {
        setSelectedCell(d);
      })
      .on('mouseenter', (_, d) => {
        setHoveredCell(d);
      })
      .on('mouseleave', () => {
        setHoveredCell(null);
      });

    // Cell Background Rect
    cellGroups
      .append('rect')
      .attr('width', x.bandwidth())
      .attr('height', y.bandwidth())
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('fill', (d) => {
        if (heatmapMetric === 'SATURATION') return colorScale(d.saturationIndex);
        if (heatmapMetric === 'PLAYER_COUNT') return colorScale(d.totalPlayers);
        if (heatmapMetric === 'USER_SHARE') return colorScale(d.userDominancePct);
        return colorScale(d.totalMarketValue);
      })
      .attr('stroke', (d) => {
        const isSelected = selectedCell?.tierId === d.tierId && selectedCell?.segmentId === d.segmentId;
        if (isSelected) return '#38bdf8'; // sky blue halo
        if (d.userPlayersCount > 0) return '#10b981'; // green accent
        return '#27272a';
      })
      .attr('stroke-width', (d) => {
        const isSelected = selectedCell?.tierId === d.tierId && selectedCell?.segmentId === d.segmentId;
        return isSelected ? 2.5 : d.userPlayersCount > 0 ? 1.5 : 1;
      })
      .style('transition', 'all 0.2s ease');

    // Primary Text: Asset Count / Saturation %
    cellGroups
      .append('text')
      .attr('x', x.bandwidth() / 2)
      .attr('y', y.bandwidth() / 2 - 4)
      .attr('text-anchor', 'middle')
      .style('fill', '#ffffff')
      .style('font-family', 'ui-monospace, monospace')
      .style('font-size', '13px')
      .style('font-weight', '900')
      .text((d) => {
        if (heatmapMetric === 'SATURATION') {
          return `${d.saturationIndex}%`;
        }
        if (heatmapMetric === 'USER_SHARE') {
          return `${d.userDominancePct}%`;
        }
        return `${d.totalPlayers} ${d.totalPlayers === 1 ? 'asset' : 'assets'}`;
      });

    // Subtitle Text: User Ownership Pill
    cellGroups
      .append('text')
      .attr('x', x.bandwidth() / 2)
      .attr('y', y.bandwidth() / 2 + 14)
      .attr('text-anchor', 'middle')
      .style('fill', (d) => (d.userPlayersCount > 0 ? '#34d399' : '#a1a1aa'))
      .style('font-family', 'ui-monospace, monospace')
      .style('font-size', '10px')
      .style('font-weight', (d) => (d.userPlayersCount > 0 ? 'bold' : 'normal'))
      .text((d) => {
        if (d.userPlayersCount > 0) {
          return `★ ${d.userPlayersCount} on Yours`;
        }
        if (d.totalPlayers === 0) {
          return 'Empty Zone';
        }
        return `~${(d.avgMarketValue / 1000).toFixed(1)}k value`;
      });
  }, [heatmapData, marketSegments, performanceTiers, selectedCell, heatmapMetric]);

  return (
    <div className="w-full space-y-6">
      {/* 1. Header & Heatmap Navigation Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-400">
              <Flame className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  League Market Saturation & Performance Heatmap
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/60 font-semibold">
                  D3 DENSITY ENGINE
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Visualizes trade value distribution across performance tiers relative to the entire league to identify liquidity bottlenecks and trade arbitrage zones.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onBackToBuilder && (
              <button
                type="button"
                onClick={onBackToBuilder}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-medium transition-colors cursor-pointer"
              >
                &larr; Back to Active Simulator
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Strategic Trade Radar Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Your League Market Share */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono font-semibold text-zinc-400 uppercase">
              Your Roster Share
            </span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2 py-1">
            <span className="text-2xl font-black font-mono text-emerald-400">
              {marketSummary.userMarketSharePct}%
            </span>
            <span className="text-xs font-mono text-zinc-500">
              ({marketSummary.userTotalAssets} of {marketSummary.totalAssets} assets)
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 border-t border-zinc-800 pt-2 mt-1">
            Total share of tracked rostered talent across all performance tiers.
          </p>
        </div>

        {/* Card 2: Highest Scarcity Chokepoint (Target Zone) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono font-semibold text-cyan-400 uppercase flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" />
              Scarcity Leverage Zone
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
              SELLER MARKET
            </span>
          </div>
          <div className="py-1">
            <span className="text-sm font-black font-mono text-white block">
              {marketSummary.highestScarcity?.tierName.split(':')[0]} • {marketSummary.highestScarcity?.segmentName}
            </span>
            <span className="text-xs font-mono text-cyan-300">
              Only {marketSummary.highestScarcity?.totalPlayers || 0} active player(s) league-wide
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 border-t border-zinc-800 pt-2 mt-1">
            Extreme asset deficit. Rival contenders pay maximum premium in this tier.
          </p>
        </div>

        {/* Card 3: Most Saturated Segment (Market Glut) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono font-semibold text-rose-400 uppercase flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Market Congestion Glut
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
              BUYER MARKET
            </span>
          </div>
          <div className="py-1">
            <span className="text-sm font-black font-mono text-white block">
              {marketSummary.mostSaturated?.tierName.split(':')[0]} • {marketSummary.mostSaturated?.segmentName}
            </span>
            <span className="text-xs font-mono text-rose-300 font-bold">
              {marketSummary.mostSaturated?.saturationIndex || 100}% Saturation ({marketSummary.mostSaturated?.totalPlayers || 0} players)
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 border-t border-zinc-800 pt-2 mt-1">
            High competition for flex spots. Ideal zone to package 2-for-1 to upgrade.
          </p>
        </div>

        {/* Card 4: Your Surplus Cluster */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono font-semibold text-amber-400 uppercase flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              Your Surplus Leverage
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
              TRADE SURPLUS
            </span>
          </div>
          <div className="py-1">
            <span className="text-sm font-black font-mono text-white block">
              {marketSummary.userSurplus?.tierName.split(':')[0]} • {marketSummary.userSurplus?.segmentName}
            </span>
            <span className="text-xs font-mono text-amber-300 font-bold">
              You own {marketSummary.userSurplus?.userPlayersCount || 0} ({marketSummary.userSurplus?.userDominancePct || 0}% share)
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 border-t border-zinc-800 pt-2 mt-1">
            Primary depth to shop for future 1sts via the "Flex for a 1st" strategy.
          </p>
        </div>
      </div>

      {/* 3. Heatmap View Controls & Dimension Switchers */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono text-xs">
        {/* Dimension Toggle: Positions vs Liquidity Bands */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-400 flex items-center gap-1.5 font-bold">
            <Layers className="w-3.5 h-3.5 text-zinc-500" />
            Grid Dimension:
          </span>
          <button
            type="button"
            onClick={() => setDimensionMode('POSITION')}
            className={`px-3 py-1 rounded transition-colors cursor-pointer ${
              dimensionMode === 'POSITION'
                ? 'bg-cyan-500 text-zinc-950 font-bold shadow'
                : 'text-zinc-400 hover:text-white bg-zinc-950 border border-zinc-800'
            }`}
          >
            Positional Saturation (QB / RB / WR / TE)
          </button>
          <button
            type="button"
            onClick={() => setDimensionMode('LIQUIDITY_BAND')}
            className={`px-3 py-1 rounded transition-colors cursor-pointer ${
              dimensionMode === 'LIQUIDITY_BAND'
                ? 'bg-cyan-500 text-zinc-950 font-bold shadow'
                : 'text-zinc-400 hover:text-white bg-zinc-950 border border-zinc-800'
            }`}
          >
            Value Quintile Bands (&lt;2k, 4k, 6k, 8k+)
          </button>
        </div>

        {/* Metric Coloring Mode */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-400 font-bold">Color Metric:</span>
          {(['SATURATION', 'USER_SHARE', 'PLAYER_COUNT', 'VALUE_DENSITY'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setHeatmapMetric(mode)}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                heatmapMetric === mode
                  ? 'bg-zinc-800 text-rose-300 font-bold border border-rose-500/50'
                  : 'text-zinc-400 hover:text-white bg-zinc-950 border border-zinc-800/80'
              }`}
            >
              {mode === 'SATURATION'
                ? 'Saturation Index'
                : mode === 'USER_SHARE'
                ? 'Your Team %'
                : mode === 'PLAYER_COUNT'
                ? 'Asset Count'
                : 'Value Density'}
            </button>
          ))}
        </div>
      </div>

      {/* 4. D3 SVG Heatmap Canvas Container */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-2xl relative">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-xs font-mono font-bold uppercase text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Dynamic Heatmap Grid (Click Cell to Inspect Players)
            </h4>
            <span className="text-[11px] text-zinc-500 font-mono">
              Y-Axis: Performance Tiers &nbsp;•&nbsp; X-Axis: Market Segments &nbsp;•&nbsp; Green Borders: Cells with Your Players
            </span>
          </div>

          {hoveredCell && (
            <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-300">
              <span className="text-cyan-400 font-bold">{hoveredCell.segmentName}</span>
              <span>•</span>
              <span className="text-white font-bold">{hoveredCell.tierName.split(':')[0]}</span>
              <span>•</span>
              <span className="text-rose-400 font-bold">{hoveredCell.saturationIndex}% Saturation</span>
            </div>
          )}
        </div>

        {/* SVG Container */}
        <div ref={containerRef} className="w-full overflow-x-auto">
          <svg ref={svgRef} className="w-full h-80 sm:h-96 min-w-[640px]" />
        </div>

        {/* Heatmap Legend Bar */}
        <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] font-mono text-zinc-400">
          <div className="flex items-center gap-2">
            <span>Color Scale:</span>
            <div className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded bg-[#083344] border border-cyan-800" title="Scarcity Deficit (< 70%)" />
              <span className="text-[10px] text-cyan-400">Scarcity (&lt;70%)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded bg-[#059669] border border-emerald-700" title="Market Equilibrium (100%)" />
              <span className="text-[10px] text-emerald-400">Equilibrium (100%)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded bg-[#d97706] border border-amber-700" title="High Density (130%)" />
              <span className="text-[10px] text-amber-400">Dense (130%)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded bg-[#e11d48] border border-rose-700" title="Hyper-Saturated Glut (> 160%)" />
              <span className="text-[10px] text-rose-400">Saturated Glut (&gt;160%)</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-zinc-500">
            <span>Selected:</span>
            <strong className="text-white font-mono">
              {selectedCell ? `${selectedCell.tierName.split(':')[0]} • ${selectedCell.segmentName}` : 'None'}
            </strong>
          </div>
        </div>
      </div>

      {/* 5. Selected Cell Roster Drilldown & Trade Action Drawer */}
      {selectedCell && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-white uppercase flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-emerald-400" />
                  Roster Drilldown: {selectedCell.tierName} &bull; {selectedCell.segmentName}
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                    selectedCell.saturationIndex > 140
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : selectedCell.saturationIndex < 80
                      ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}
                >
                  {selectedCell.saturationIndex}% Saturation Index
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Showing {selectedCell.players.length} player(s) across the league in this cell ({selectedCell.userPlayersCount} on your roster, {selectedCell.opponentPlayersCount} on target opponent).
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div>
                <span className="text-zinc-500 text-[10px] block">Avg Value</span>
                <span className="font-bold text-amber-300">{selectedCell.avgMarketValue.toLocaleString()} pts</span>
              </div>
              <div className="w-px h-6 bg-zinc-800" />
              <div>
                <span className="text-zinc-500 text-[10px] block">Total Tier Liquidity</span>
                <span className="font-bold text-white">{selectedCell.totalMarketValue.toLocaleString()} pts</span>
              </div>
            </div>
          </div>

          {/* Player Cards Grid */}
          {selectedCell.players.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-xs font-mono bg-zinc-950/60 rounded-xl border border-zinc-800">
              No players currently occupy this tier and segment in the league.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {selectedCell.players.map((item) => {
                const { player, isUser, isTargetOpponent, ownerFranchiseName } = item;

                return (
                  <div
                    key={`${player.id}-${ownerFranchiseName}`}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                      isUser
                        ? 'bg-emerald-950/20 border-emerald-500/50 hover:border-emerald-400'
                        : isTargetOpponent
                        ? 'bg-amber-950/20 border-amber-500/50 hover:border-amber-400'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                              player.position === 'QB'
                                ? 'bg-rose-950 text-rose-400'
                                : player.position === 'RB'
                                ? 'bg-emerald-950 text-emerald-400'
                                : player.position === 'WR'
                                ? 'bg-cyan-950 text-cyan-400'
                                : 'bg-amber-950 text-amber-400'
                            }`}
                          >
                            {player.position}
                          </span>
                          <span className="text-xs font-bold text-white truncate max-w-[140px]">
                            {player.full_name}
                          </span>
                        </div>

                        <span className="text-xs font-mono font-extrabold text-amber-300">
                          {player.market_value.toLocaleString()} <span className="text-[9px] font-normal text-zinc-500">value</span>
                        </span>
                      </div>

                      <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between">
                        <span>
                          {player.nfl_team} &bull; Age {player.age.toFixed(1)}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            isUser
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : isTargetOpponent
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {isUser ? 'Your Roster' : ownerFranchiseName}
                        </span>
                      </div>
                    </div>

                    {/* Interactive Action Buttons */}
                    <div className="pt-2 border-t border-zinc-800/80 flex items-center gap-2 text-xs font-mono">
                      {isUser ? (
                        <>
                          {onSelectSendPlayer && (
                            <button
                              type="button"
                              onClick={() => onSelectSendPlayer(player)}
                              className="flex-1 py-1 px-2 rounded bg-cyan-950 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                              title="Add to Outgoing Trade in Simulator"
                            >
                              <span>Send in Trade &rarr;</span>
                            </button>
                          )}
                          {onLaunchAITrade && (
                            <button
                              type="button"
                              onClick={() => onLaunchAITrade(player, undefined)}
                              className="py-1 px-2.5 rounded bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                              title="Shop this player in AI Trade Architect"
                            >
                              <Sparkles className="w-3 h-3 text-emerald-400" />
                              <span>Shop AI</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          {onSelectReceivePlayer && (
                            <button
                              type="button"
                              onClick={() => onSelectReceivePlayer(player)}
                              className="flex-1 py-1 px-2 rounded bg-amber-950 hover:bg-amber-900 border border-amber-800 text-amber-300 text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                              title="Add to Incoming Trade in Simulator"
                            >
                              <span>Target in Trade &rarr;</span>
                            </button>
                          )}
                          {onLaunchAITrade && (
                            <button
                              type="button"
                              onClick={() => onLaunchAITrade(undefined, player)}
                              className="py-1 px-2.5 rounded bg-amber-950 hover:bg-amber-900 border border-amber-800 text-amber-300 text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                              title="Target this player in AI Trade Architect"
                            >
                              <Sparkles className="w-3 h-3 text-amber-400" />
                              <span>Target AI</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
