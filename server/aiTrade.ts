/**
 * AI trade ideas via Gemini. Falls back to the in-browser algorithmic engine when no key is set.
 */
import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import type { DraftPick, MasterPlayer } from '../src/types';
import { SEASON } from '../src/lib/season';

export const aiTradeRouter = Router();
const router = aiTradeRouter;

router.post(['/api/trade/ai-suggest', '/api/ai-trade-finder'], async (req: Request, res: Response) => {
  try {
    const { userTeam, opponentTeam, leagueTeams, shopPlayerId, targetPlayerId, strategyMode } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.json({ fallback: true, message: 'No GEMINI_API_KEY set, relying on algorithmic trade engine' });
    }

    const ai = new GoogleGenAI({ apiKey });

    const userPlayers = (userTeam?.players || []).map((p: any) => `${p.full_name} (${p.position}, age ${p.age}, value: ${p.market_value})`).join(', ');
    const userPicks = (userTeam?.draft_picks || []).map((p: any) => `${p.description} (value: ${p.market_value})`).join(', ');

    const oppPlayers = (opponentTeam?.players || []).map((p: any) => `${p.full_name} (${p.position}, age ${p.age}, value: ${p.market_value})`).join(', ');
    const oppPicks = (opponentTeam?.draft_picks || []).map((p: any) => `${p.description} (value: ${p.market_value})`).join(', ');

    const prompt = `You are an elite Dynasty Fantasy Football General Manager and Trade Architect.
Values are consensus dynasty market values (DynastyProcess / FantasyPros ECR scale, roughly 0-10,000).
Current season: ${SEASON.seasonYear}. The next rookie draft is ${SEASON.upcomingDraftYear}.

User Franchise: "${userTeam?.franchise_name || 'My Team'}"
User Players: ${userPlayers || 'None listed'}
User Draft Capital: ${userPicks || 'None listed'}

Trade Partner: "${opponentTeam?.franchise_name || 'Rival Team'}"
Partner Players: ${oppPlayers || 'None listed'}
Partner Draft Capital: ${oppPicks || 'None listed'}

Selected Shop Player (from user roster): ${shopPlayerId || 'None'}
Selected Target Player (from partner roster): ${targetPlayerId || 'None'}
Strategy Stance: ${strategyMode || 'BALANCED'}

Generate 3 balanced, realistic trade proposals in valid JSON format:
{
  "proposals": [
    {
      "id": "gemini-prop-1",
      "title": "Descriptive Package Title",
      "blueprint_type": "FAIR_EQUILIBRIUM" | "TIER_UP_SWEETENER" | "FLEX_FOR_FIRST" | "REBUILD_PIVOT" | "WIN_NOW_BOOST",
      "summary": "1-2 sentence executive summary of the deal",
      "partner_franchise_id": "${opponentTeam?.franchise_id || 'partner'}",
      "partner_franchise_name": "${opponentTeam?.franchise_name || 'Trade Partner'}",
      "send_player_names": ["Exact Name"],
      "send_pick_descriptions": ["2027 Round 1"],
      "receive_player_names": ["Exact Name"],
      "receive_pick_descriptions": ["2027 Round 2"],
      "total_ktc_sent": 5200,
      "total_ktc_received": 5350,
      "ktc_difference": 150,
      "fairness_verdict": "FAIR",
      "fairness_score_pct": 98,
      "predicted_gross_liquidity_delta": 0.7,
      "rationale_for_you": "Why this benefits user roster DNA and Gross Liquidity",
      "rationale_for_partner": "Why partner accepts based on their roster needs"
    }
  ]
}
Respond ONLY with pure JSON. Do not include markdown codeblocks.`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      contents: prompt,
    });

    const text = response.text || '';
    const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    // Map names back to actual player and pick objects
    const allUserPlayers: MasterPlayer[] = userTeam?.players || [];
    const allPartnerPlayers: MasterPlayer[] = opponentTeam?.players || [];
    const allUserPicks: DraftPick[] = userTeam?.draft_picks || [];
    const allPartnerPicks: DraftPick[] = opponentTeam?.draft_picks || [];

    const formattedProposals = (parsed.proposals || []).map((p: any, idx: number) => {
      const sendPlayers = (p.send_player_names || []).map((name: string) =>
        allUserPlayers.find((up) => up.full_name.toLowerCase() === name.toLowerCase()) || {
          id: `p-ai-${idx}-${name.toLowerCase().replace(/\s+/g, '_')}`,
          full_name: name,
          position: 'WR',
          nfl_team: 'FA',
          age: 24,
          market_value: 2500,
          consensus_rank: 50,
        }
      );

      const receivePlayers = (p.receive_player_names || []).map((name: string) =>
        allPartnerPlayers.find((pp) => pp.full_name.toLowerCase() === name.toLowerCase()) || {
          id: `p-ai-rec-${idx}-${name.toLowerCase().replace(/\s+/g, '_')}`,
          full_name: name,
          position: 'RB',
          nfl_team: 'FA',
          age: 25,
          market_value: 3000,
          consensus_rank: 40,
        }
      );

      const sendPicks = (p.send_pick_descriptions || []).map((desc: string) =>
        allUserPicks.find((pk) => pk.description.toLowerCase().includes(desc.toLowerCase())) || {
          id: `pk-ai-${idx}`,
          year: 2027,
          round: 1,
          description: desc,
          market_value: 5200,
          original_owner_id: userTeam?.franchise_id || 'user',
          current_owner_id: userTeam?.franchise_id || 'user',
        }
      );

      const receivePicks = (p.receive_pick_descriptions || []).map((desc: string) =>
        allPartnerPicks.find((pk) => pk.description.toLowerCase().includes(desc.toLowerCase())) || {
          id: `pk-ai-rec-${idx}`,
          year: 2027,
          round: 2,
          description: desc,
          market_value: 2200,
          original_owner_id: opponentTeam?.franchise_id || 'partner',
          current_owner_id: opponentTeam?.franchise_id || 'partner',
        }
      );

      return {
        id: p.id || `gemini-prop-${idx}-${Date.now()}`,
        title: p.title || 'AI Optimized Trade Proposal',
        blueprint_type: p.blueprint_type || 'FAIR_EQUILIBRIUM',
        summary: p.summary || '',
        partner_franchise_id: opponentTeam?.franchise_id || 'partner',
        partner_franchise_name: opponentTeam?.franchise_name || 'Trade Partner',
        send_players: sendPlayers,
        send_picks: sendPicks,
        receive_players: receivePlayers,
        receive_picks: receivePicks,
        total_ktc_sent: p.total_ktc_sent || 0,
        total_ktc_received: p.total_ktc_received || 0,
        ktc_difference: p.ktc_difference || 0,
        fairness_verdict: p.fairness_verdict || 'FAIR',
        fairness_score_pct: p.fairness_score_pct || 95,
        predicted_gross_liquidity_delta: p.predicted_gross_liquidity_delta || 0,
        rationale_for_you: p.rationale_for_you || '',
        rationale_for_partner: p.rationale_for_partner || '',
      };
    });

    res.json({ success: true, proposals: formattedProposals });
  } catch (err: any) {
    console.warn('Gemini trade suggestion error, returning fallback signal:', err.message);
    res.json({ fallback: true, error: err.message });
  }
});

