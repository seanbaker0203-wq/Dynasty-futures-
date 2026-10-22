#!/usr/bin/env node
/**
 * Builds data/expert-history.json from a local clone of github.com/dynastyprocess/data:
 * one snapshot per weekly commit of files/values-players.csv.
 *
 * Usage: node scripts/build-expert-history.mjs <path-to-dynastyprocess-data-clone> [weeks=26]
 * (clone with enough depth, e.g. `git fetch --depth=400 origin master`)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [repo, weeksArg] = process.argv.slice(2);
if (!repo) {
  console.error('Usage: node scripts/build-expert-history.mjs <dynastyprocess-data-dir> [weeks]');
  process.exit(1);
}
const WEEKS = Number(weeksArg) || 26;
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [h, ...b] = rows;
  return b.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}

const log = git('log', '--format=%H %cs', 'HEAD', '--', 'files/values-players.csv').trim().split('\n');
const seen = new Set();
const commits = [];
for (const line of log) {
  const [sha, date] = line.split(' ');
  if (seen.has(date)) continue;
  seen.add(date);
  commits.push({ sha, date });
  if (commits.length >= WEEKS) break;
}

const players = {};
const dates = [];
for (const { sha, date } of commits.reverse()) {
  const rows = parseCsv(git('show', `${sha}:files/values-players.csv`));
  dates.push(date);
  for (const r of rows) {
    if (!r.fp_id) continue;
    (players[r.fp_id] ??= []).push([date, Number(r.value_1qb) || 0, Number(r.value_2qb) || 0]);
  }
}

const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'expert-history.json');
fs.writeFileSync(out, JSON.stringify({ source: 'DynastyProcess values-players.csv commit history', dates, players }));
console.log(`expert-history.json: ${dates.length} snapshots (${dates[0]} to ${dates[dates.length - 1]}), ${Object.keys(players).length} players`);
