sim/ — loot simulation, testing & report kit
============================================

Requirements / dependencies
---------------------------
  * Node.js — only for the two build scripts (run_batch_sim.cjs,
    build_report.cjs). NO npm packages, no install step: they use
    node's built-in fs/path only. Any reasonably current Node works.
  * Windows PowerShell 5.1+ — only to REBUILD the interactive harness
    (build_sim.ps1). Built-in cmdlets only, no modules.
  * Any modern browser — to open qa_loot_report.html (self-contained,
    works offline, no internet needed) and the harness pages.
  * Data — via config.json. Nothing else is required at runtime.
  * Optional dev checks I ran: headless Edge/Chrome with
    --allow-file-access-from-files --headless=new; these create
    throwaway profile dirs (e.g. sim/.edge-v, screenshots *.png) which
    are gitignored and safe to delete any time.

Self-contained folder: the scripts the simulation needs (loot_chance.js,
loot_generator.js) are bundled right here — pinned copies (root versions
are live for the app; see "Moving this folder"). Data paths configurable.

config.json
-----------
  data           - file defining window.DEFAULT_DATA (loot tables/drops,
                   loot_table_definitions). Default "../data.js" = the
                   project's app data. Point it at any export
                   (e.g. a fresh mapped_prefabs_data.json merged data.js)
                   Relative paths resolve against THIS folder; absolute
                   paths (even on other drives) are fine.
  loot_chance    - chance-prediction module (annotated tree + probabilities)
  loot_generator - faithful game-server loot generator port (Batch Q)
  app_index      - app index.html, only used by build_sim.ps1 to rebuild
                   the interactive harness page (qa_sim_loot.html)

Moving this folder
------------------
  * qa_loot_report.html  - fully standalone, works anywhere as-is.
  * node sim/run_batch_sim.cjs, node sim/build_report.cjs - read
    config.json, so they work wherever the folder is (just point the
    config paths at the data).
  * qa_sim_loot.html / build_sim.ps1 - generated from the app UI
    (app_index config), so they need the app page reachable at the
    configured path. "data" comes from config as well.
  * qa_unit_loot.html - app-renderer regression pins (40/40); it
    intentionally anchors to the app (style.css, script.js, data.js at
    ../). Reload it inside the project to run it.
  * loot_generator.js ALSO stays in the project root - the website
    itself will use it for loot-drop simulation later; the copy here is
    the simulation kit's pinned version.

Regenerating
------------
  node sim/run_batch_sim.cjs   -> sim/batch_sim_results.json  (~10 s)
  node sim/build_report.cjs    -> sim/qa_loot_report.html
  powershell sim/build_sim.ps1 -> sim/qa_sim_loot.html (harness rebuild)
