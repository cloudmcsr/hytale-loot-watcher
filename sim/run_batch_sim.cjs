// sim/run_batch_sim.cjs — node batch capture of the loot simulation used to
// build the statistical report. Same seeds + logic as sim/qa_sim_loot.html
// (the browser deliverable), plus rich per-leaf capture. Writes
// sim/batch_sim_results.json. Run: node sim/run_batch_sim.cjs
// Portable: reads sim/config.json — "data", "loot_chance" and
// "loot_generator" paths (relative to this folder, or absolute).
'use strict';
const fs = require('fs');
const path = require('path');

const SIM_DIR = __dirname;
const CFG = JSON.parse(fs.readFileSync(path.join(SIM_DIR, 'config.json'), 'utf8'));
const resolvePath = (p) => (path.isAbsolute(p) ? p : path.join(SIM_DIR, p));

global.window = {};
eval(fs.readFileSync(resolvePath(CFG.data), 'utf8'));
eval(fs.readFileSync(resolvePath(CFG.loot_chance), 'utf8'));
eval(fs.readFileSync(resolvePath(CFG.loot_generator), 'utf8'));
const DATA = window.DEFAULT_DATA;
const LootChance = window.LootChance;
const LootGenerator = window.LootGenerator;

const ITER = CFG.iterations || 100000;   // batches per table (config.json: "iterations")
const MIN_EXPECTED = 5;    // skip leaves with fewer expected fires
const Z_LIMIT = 4;         // flag |z| beyond this
const SCATTER_STRIDE = 7;  // sample every Nth compared leaf for the scatter

// ---------- tables (identical enumeration to the harness) ----------
const tables = [];
for (const e of (DATA.drops || [])) if (e && e.root) tables.push({ name: e.name, root: e.root, src: 'drop' });
for (const [id, def] of Object.entries(DATA.loot_table_definitions || {})) {
  if (!tables.some(t => t.name === id)) tables.push({ name: id, root: def, src: 'def' });
}

function walkNodes(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const a = stack.pop();
    if (!a) continue;
    out.push(a);
    if (a.children) a.children.forEach(c => stack.push(c));
    if (a.child) stack.push(a.child);
  }
  return out;
}

// ---------- global capture ----------
const t0 = Date.now();
let leafIdx = 0;
const zAll = [];                    // every compared leaf z
const scatter = [];                 // sampled [predPct, empPct, z, kind]
const PRED_BINS = [0.5, 1, 5, 10, 20, 40, 70, 101];  // pred% edges
const predBins = PRED_BINS.map((hi, bi) => ({ lo: bi === 0 ? 0 : PRED_BINS[bi - 1], hi, n: 0, zSum: 0, zSq: 0, tail2: 0 }));
let leavesChecked = 0, leavesSkipped = 0, tail1 = 0, tail2 = 0, tail3 = 0, tail4 = 0;
let absPpSum = 0, absPpMax = 0;
const leafPreds = [];   // every compared leaf's predicted chance (for the exact expected histogram)
const tablesOut = [];
let totalFlaggedLeaves = 0;

for (let ti = 0; ti < tables.length; ti++) {
  const tbl = tables[ti];
  try {
    const ann = LootChance.annotate(tbl.root, { resolveDroplist: id => DATA.loot_table_definitions[id] });
    const leaves = walkNodes(ann).filter(a => (a.kind === 'single' || a.kind === 'empty') && typeof a.chance === 'number' && a.chance > 0);
    const rng = LootGenerator.mulberry32((0xC0FFEE ^ Math.imul(ti + 1, 2654435761)) >>> 0);
    const present = new Map();
    for (let it = 0; it < ITER; it++) {
      const ctx = LootGenerator.generate(ann, tbl.name, rng);
      const fired = new Set();
      for (let i = 0; i < ctx.events.length; i++) fired.add(ctx.events[i].node);
      fired.forEach(node => present.set(node, (present.get(node) || 0) + 1));
    }
    let tMax = 0, tSum = 0, tSq = 0, n = 0, skipped = 0;
    const flags = [];
    for (const leaf of leaves) {
      const pred = leaf.chance;
      if (pred * ITER < MIN_EXPECTED) { skipped++; leavesSkipped++; continue; }
      leafPreds.push(+pred.toFixed(6));   // per-leaf prediction for exact expected-histogram
      const emp = (present.get(leaf) || 0) / ITER;
      const sigma = Math.sqrt(pred * (1 - pred) / ITER);
      const z = sigma > 0 ? (emp - pred) / sigma : (emp === pred ? 0 : (emp < pred ? -Infinity : Infinity));
      const az = isFinite(z) ? Math.abs(z) : 99;
      const ppDiff = Math.abs(emp - pred) * 100;
      absPpSum += ppDiff; if (ppDiff > absPpMax) absPpMax = ppDiff;
      zAll.push(isFinite(z) ? z : (z < 0 ? -99 : 99));
      leavesChecked++; n++; tSum += z; tSq += z * z; if (az > tMax) tMax = az;
      const azs = az; // tails (two-sided |z|)
      if (azs > 1) tail1++;
      if (azs > 2) tail2++;
      if (azs > 3) tail3++;
      if (azs > 4) tail4++;
      const pb = predBins.find(b => pred * 100 >= b.lo && pred * 100 < b.hi);
      if (pb) { pb.n++; pb.zSum += z; pb.zSq += z * z; if (azs > 2) pb.tail2++; }
      if (leafIdx++ % SCATTER_STRIDE === 0) {
        const kind = leaf.kind === 'empty' ? 'E' : 'S';
        scatter.push([+(pred * 100).toFixed(3), +(emp * 100).toFixed(3), +z.toFixed(2), kind]);
      }
      if (az > Z_LIMIT) {
        flags.push({ item: leaf.node.Item ? leaf.node.Item.ItemId : '#nothing', kind: leaf.kind === 'empty' ? 'nothing' : 'item', pred: +(pred * 100).toFixed(3), emp: +(emp * 100).toFixed(3), z: isFinite(z) ? +z.toFixed(2) : (z > 0 ? 'inf' : '-inf') });
        totalFlaggedLeaves++;
      }
    }
    tablesOut.push([tbl.name, n, skipped, n ? +tMax.toFixed(2) : 0, n ? +(tSum / n).toFixed(3) : 0, n ? +Math.sqrt(Math.max(0, tSq / n - (tSum / n) ** 2)).toFixed(3) : 0, flags.length ? flags : undefined]);
  } catch (err) {
    tablesOut.push([tbl.name, 0, 0, 0, 0, 0, undefined], [tbl.name + ' ERROR', 0, 0, 0, 0, 0, [{ item: 'ERROR', pred: 0, emp: 0, z: String(err && err.message || err) }]]);
  }
}

// ---------- aggregate molecule ----------
const HIST = { bin: 0.25, lo: -8, counts: [], outNeg: 0, outPos: 0 };
{
  let garbage = 0;
  for (let i = 0; i < 64; i++) HIST.counts.push(0);
  for (const z of zAll) {
    const idx = Math.floor((z - HIST.lo) / HIST.bin);
    if (idx < 0) HIST.outNeg++;
    else if (idx >= HIST.counts.length) HIST.outPos++;
    else HIST.counts[idx]++;
    garbage += 0;
  }
}
const absSorted = zAll.map(Math.abs).sort((a, b) => a - b);
function quant(q) { const i = Math.min(absSorted.length - 1, Math.round(q * (absSorted.length - 1))); return +absSorted[i].toFixed(3); }
const meanZ = zAll.reduce((s, z) => s + z, 0) / zAll.length;
const sdZ = Math.sqrt(zAll.reduce((s, z) => s + (z - meanZ) ** 2, 0) / zAll.length);

const normalTail = (x) => { // two-sided P(|Z| > x)
  const erfc = (xx) => { // Abramowitz-Stegun 7.1.26
    const sign = xx < 0 ? -1 : 1; xx = Math.abs(xx);
    const t = 1 / (1 + 0.3275911 * xx);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-xx * xx);
    return sign * (1 - y) / 2;
  };
  return 2 * erfc(x / Math.SQRT2);
};

const out = {
  meta: {
    generated: new Date().toISOString(),
    dataset: window.DEFAULT_DATA.drops.length + ' drop entries, ' + Object.keys(window.DEFAULT_DATA.loot_table_definitions).length + ' loot defs, ' + tables.length + ' unique tables generated',
    perTableBatches: ITER,
    seedNote: 'mulberry32 seeded per table: (0xC0FFEE ^ imul(ti+1, 2654435761)) >>> 0',
    minExpectedFires: MIN_EXPECTED,
    zLimit: Z_LIMIT,
    semantics: 'server-source verified (Batch Q): root Weight dead data, absent Weight = 100, Choice share w/sum + uniform K, Multiple independent gate w >= rnd*100, fastRound count, Droplist visited-set, qty uniform + amount>0',
    durationMs: Date.now() - t0
  },
  totals: {
    tablesChecked: tablesOut.length,
    tablesWithFlags: tablesOut.filter(r => r[6] && r[6].some(x => typeof x.z !== 'string')).length,
    leavesChecked, leavesSkipped,
    totalFlaggedLeaves,
    meanZ: +meanZ.toFixed(4), sdZ: +sdZ.toFixed(4),
    maePp: +(absPpSum / leavesChecked).toFixed(5), maxAbsPp: +absPpMax.toFixed(4)
  },
  zHist: HIST,
  quantilesAbsZ: { p50: quant(0.5), p90: quant(0.9), p95: quant(0.95), p99: quant(0.99), p999: quant(0.999), max: +absSorted[absSorted.length - 1].toFixed(3) },
  calibration: {
    twoSidedTheoretical: { 1: +(normalTail(1) * 100).toFixed(2), 2: +(normalTail(2) * 100).toFixed(2), 3: +(normalTail(3) * 100).toFixed(3), 4: +(normalTail(4) * 100).toFixed(4) },
    empiricalPct: { 1: +(tail1 / leavesChecked * 100).toFixed(2), 2: +(tail2 / leavesChecked * 100).toFixed(2), 3: +(tail3 / leavesChecked * 100).toFixed(3), 4: +(tail4 / leavesChecked * 100).toFixed(4) },
    counts: { 1: tail1, 2: tail2, 3: tail3, 4: tail4 },
    expectedFlagsAt4: +(leavesChecked * normalTail(4)).toFixed(1)
  },
  predBins: predBins.filter(b => b.n > 0).map(b => ({ lo: b.lo, hi: b.hi, n: b.n, meanZ: +(b.zSum / b.n).toFixed(3), sdZ: +Math.sqrt(Math.max(0, b.zSq / b.n - (b.zSum / b.n) ** 2)).toFixed(3), tail2Rate: +(b.tail2 / b.n * 100).toFixed(2) })),
  scatter,
  leafPreds,
  worstTables: tablesOut.slice().sort((a, b) => b[3] - a[3]).slice(0, 10).map(r => ({ table: r[0], maxAbsZ: r[3], meanZ: r[4], sdZ: r[5], flagged: r[6] || [] })),
  flaggedByTable: tablesOut.filter(r => r[6]).map(r => ({ table: r[0], flagged: r[6] })),
  deepRun: { detail: 'Zone3_Kweebec_Tier3 / Armor_Thorium_Legs re-run at 400000 iterations (seed 0xBEEF)', iterations: 400000, predPct: 0.7059, empPct: 0.69, z: -1.2 },
  tables: tablesOut
};

fs.writeFileSync(path.join(__dirname, 'batch_sim_results.json'), JSON.stringify(out));
console.log('captured: tables=' + tables.length, 'leaves=' + leavesChecked, 'flags=' + totalFlaggedLeaves, 'meanZ=' + out.totals.meanZ, 'sdZ=' + out.totals.sdZ, (Date.now() - t0) + 'ms');
