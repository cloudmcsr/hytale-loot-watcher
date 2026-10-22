$rw = { param($m)
    $u = $m.Groups[2].Value
    if($u -match '^(https?:|data:|/|#[\w-]|JavaScript:)') { return $m.Value }
    return '{0}="{1}"' -f $m.Groups[1].Value, ($prefix + $u)
}
# config-driven (sim/config.json, paths relative to THIS folder or absolute)
$simDir = $PSScriptRoot
$cfg = Get-Content "$simDir\config.json" -Raw | ConvertFrom-Json
$resolveConfig = { param($p) if ([System.IO.Path]::IsPathRooted($p)) { $p } else { Join-Path $simDir $p } }
$idxPath = & $resolveConfig $cfg.app_index
if (-not (Test-Path $idxPath)) { Write-Output "APP INDEX NOT FOUND: $idxPath (config.json: app_index)"; exit 1 }
# relative prefix from sim/ to the app page's folder (e.g. "../")
$prefix = ([System.Uri]::new($simDir + '\')).MakeRelativeUri([System.Uri]::new((Split-Path $idxPath -Parent) + '\')).ToString()
if ($prefix -eq './') { $prefix = '' }
$h = [System.IO.File]::ReadAllText($idxPath)
$hb = [regex]::Replace($h, '(src|href)="([^"]+)"', $rw)

$runner = @'
<script>
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(1000);
  const ITER = 20000;
  const MIN_EXPECTED = 5;
  const Z_LIMIT = 4;

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

  const results = [];
  const tables = [];
  for (const e of (DATA.drops || [])) if (e && e.root) tables.push({ name: e.name, root: e.root });
  for (const [id, def] of Object.entries(DATA.loot_table_definitions || {})) {
    if (!tables.some(t => t.name === id)) tables.push({ name: id, root: def });
  }

  const statusEl = document.getElementById('sim-status');
  statusEl.textContent = '0 / ' + tables.length;

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
      const rows = [];
      let skipped = 0;
      for (const leaf of leaves) {
        const pred = leaf.chance;
        const E = pred * ITER;
        if (E < MIN_EXPECTED) { skipped++; continue; }
        const emp = (present.get(leaf) || 0) / ITER;
        const sigma = Math.sqrt(pred * (1 - pred) / ITER);
        // sigma == 0 => structurally certain chance (100%): verified by exact match
        const z = sigma > 0 ? (emp - pred) / sigma : (emp === pred ? 0 : (emp < pred ? -Infinity : Infinity));
        rows.push({ item: leaf.node.Item ? leaf.node.Item.ItemId : '#nothing', pred: pred * 100, emp: emp * 100, z: z });
      }
      const flagged = rows.filter(r => Math.abs(r.z) > Z_LIMIT).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
      results.push({
        name: tbl.name,
        leaves: rows.length, skipped: skipped,
        flagged: flagged.slice(0, 10).map(r => ({ item: r.item, pred: +r.pred.toFixed(2), emp: +r.emp.toFixed(2), z: +r.z.toFixed(1) })),
        maxAbsZ: rows.length ? +Math.max(...rows.map(r => Math.abs(r.z))).toFixed(2) : 0,
        totalFlagged: flagged.length
      });
    } catch (err) {
      results.push({ name: tbl.name, error: String(err && err.message || err) });
    }
    if (ti % 40 === 0) {
      statusEl.textContent = (ti + 1) + ' / ' + tables.length;
      await wait(0);
    }
  }

  const errored = results.filter(r => r.error);
  const withRows = results.filter(r => !r.error && r.leaves > 0);
  const flaggedTables = withRows.filter(r => r.totalFlagged > 0);
  const summary = {
    tables: tables.length, iterations: ITER, errored: errored.length,
    tablesChecked: withRows.length, tablesWithFlags: flaggedTables.length,
    totalFlaggedLeaves: withRows.reduce((s, r) => s + r.totalFlagged, 0),
    errors: errored.map(r => ({ table: r.name, error: r.error })).slice(0, 10),
    worst: withRows.slice().sort((a, b) => b.maxAbsZ - a.maxAbsZ).slice(0, 12)
              .map(r => ({ table: r.name, maxZ: r.maxAbsZ, flagged: r.flagged })),
    flaggedByTable: flaggedTables.slice(0, 20).map(r => ({ table: r.name, flagged: r.flagged }))
  };
  const out = JSON.stringify(summary);
  statusEl.textContent = 'done';
  document.getElementById('sim-output').textContent = out;
  console.log('QASIM:' + out);
})();
</script>
'@

# inject status bar right after <body...> and the runner before </body>;
# the predictor + generator come from the BUNDLED copies inside sim/
$html = $hb -replace '(<body[^>]*>)', ('$1<div id="sim-status">loading data...</div><pre id="sim-output" style="white-space:pre-wrap;font-size:11px"></pre>')
# the predictor comes from the BUNDLED copy inside sim/ (keep kit self-contained)
if ($prefix -ne '') {
  $preEsc = [regex]::Escape($prefix)
  $html = $html -replace ('(src|href)="' + $preEsc + 'loot_chance\.js"'), '$1="loot_chance.js"'
}
$html = $html.Replace('</body>', ('<script src="loot_generator.js"></script>' + $runner + '</body>'))

[System.IO.File]::WriteAllText("$simDir\qa_sim_loot.html", $html, [System.Text.UTF8Encoding]::new($true))
Write-Output ('written, size=' + (Get-Item "$simDir\qa_sim_loot.html").Length)
if ((Select-String -Path "$simDir\qa_sim_loot.html" -Pattern 'sim-status' -Quiet) -and (Select-String -Path "$simDir\qa_sim_loot.html" -Pattern 'loot_generator' -Quiet)) { 'pieces ok' } else { Write-Output 'MISSING PIECES' ; exit 1 }
