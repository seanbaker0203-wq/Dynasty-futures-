#!/usr/bin/env node
/**
 * Builds data/values.json from the DynastyProcess open data repo
 * (https://github.com/dynastyprocess/data, updated daily).
 *
 * Usage: node scripts/build-values.mjs <path-to-dynastyprocess-data-repo>
 *
 * Output: one record per valued player, keyed by our own id and carrying the
 * Sleeper and MFL ids so league rosters resolve by id, never by name.
 * No dependencies: runs on plain Node 18+.
 */
import fs from 'node:fs';
import path from 'node:path';

const repo = process.argv[2];
if (!repo) {
  console.error('Usage: node scripts/build-values.mjs <dynastyprocess-data-dir>');
  process.exit(1);
}
const filesDir = path.join(repo, 'files');

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, commas in quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const clean = (v) => (v === undefined || v === '' || v === 'NA' ? null : v);
const num = (v) => (clean(v) === null ? null : Number(v));

const read = (name) => parseCsv(fs.readFileSync(path.join(filesDir, name), 'utf8'));

const idRows = read('db_playerids.csv');
const byFp = new Map(idRows.filter((r) => clean(r.fantasypros_id)).map((r) => [r.fantasypros_id, r]));

const players = [];
const unmapped = [];
for (const r of read('values-players.csv')) {
  const ids = byFp.get(r.fp_id) || {};
  const rec = {
    id: `fp_${r.fp_id}`,
    name: r.player,
    position: r.pos,
    team: clean(r.team),
    age: num(r.age),
    draft_year: num(r.draft_year),
    value_1qb: num(r.value_1qb) ?? 0,
    value_sf: num(r.value_2qb) ?? 0,
    ecr_1qb: num(r.ecr_1qb),
    ecr_sf: num(r.ecr_2qb),
    sleeper_id: clean(ids.sleeper_id),
    mfl_id: clean(ids.mfl_id),
    ktc_id: clean(ids.ktc_id),
    birthdate: clean(ids.birthdate),
  };
  if (!rec.sleeper_id && !rec.mfl_id) unmapped.push(rec.name);
  players.push(rec);
}

// Pick values live in values.csv (players + picks share one value scale).
const picks = read('values.csv')
  .filter((r) => r.pos === 'PICK')
  .map((r) => ({ name: r.player, value_1qb: num(r.value_1qb) ?? 0, value_sf: num(r.value_2qb) ?? 0 }));

const scrapeDate = players.length ? read('values-players.csv')[0].scrape_date : null;
const out = {
  source: 'DynastyProcess (github.com/dynastyprocess/data), derived from FantasyPros ECR',
  scrape_date: scrapeDate,
  built_at: new Date().toISOString(),
  players,
  picks,
};

const outPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'values.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));

console.log(`values.json: ${players.length} players, ${picks.length} picks (scraped ${scrapeDate})`);
console.log(`with sleeper_id: ${players.filter((p) => p.sleeper_id).length}, with mfl_id: ${players.filter((p) => p.mfl_id).length}`);
if (unmapped.length) console.log(`no platform id: ${unmapped.join(', ')}`);
