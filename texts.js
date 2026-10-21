/*
 * texts.js — every user-visible string of the app lives here so it can be
 * edited in one place. NO framework: plain globals, loaded before script.js.
 *
 * Contract for a replacement file (e.g. another language):
 *   - define window.TEXTS with the SAME keys (flat strings; some contain
 *     inline <strong>/<code>/<kbd> markup - keep the markup when translating)
 *   - define window.TEXT_ATTRS with the same shape (see below)
 *   - swap the <script src="texts.js"> tag in index.html to point at it
 *
 * Placeholders {likeThis} are replaced by script.js at runtime.
 */
window.TEXTS = {

    // ----- Sidebar / brand -----
    brandTitle: 'Loot Watcher',
    brandSub: 'Hytale Client',
    filterCategoriesTip: 'Filter categories',
    scrollHint: 'Shift+Scroll for horizontal scroll',

    // Category dropdown display labels (option VALUES stay canonical:
    // 'All' / 'Structures' / 'Loot Tables' / data categories)
    catAll: 'All',
    catStructures: 'Structures',
    catLootTables: 'Loot Tables',

    // ----- Buttons / search -----
    helpBtnTitle: 'Help',
    openFileBtnTitle: 'Open File',
    searchPlaceholder: 'Search names, ids, or items...',
    clearBtnTitle: 'Clear',
    funnelTip: 'Highlight searched item, and collapse other loot table cards.',

    // ----- Main view -----
    emptyState: 'Select a prefab to view loot tables',
    kickerStructure: 'Structure',
    kickerLootTable: 'Loot table',
    statChestsLabel: 'Chests',
    statTablesLabel: 'Loot tables',
    statChestsValue: '{n}x Chest',
    statTablesTip: 'Loot table tier breakdown of this prefab{tiers}',

    // ----- Cards / slots -----
    cardChests: 'Chest',
    cardChestsPlural: 'Chests',
    matchBadge: '{shown} / {total} match',
    rollLabel: 'ROLL (pick {range})',
    flatRollsLabel: 'INDIVIDUAL ROLLS ({count})',
    includedTitle: 'Included table',
    nothingSlotText: 'Nothing',

    // ----- Search -----
    searchResultsMany: 'Found {n} results for "{term}" ({names} by name, {items} by item)',
    searchResultsOne: 'Found {n} result for "{term}" ({names} by name, {items} by item)',
    noMatches: 'No matches found',

    // ----- Slot tooltip -----
    tooltipQuantity: 'Quantity',
    tooltipChance: 'Chance',

    // ----- Upload / errors -----
    uploadTitle: 'Hytale Loot Viewer',
    uploadDragDrop: 'Drag & Drop <code>mapped_prefabs_data.json</code> here',
    uploadSelectFile: 'Select File',
    invalidFileAlert: 'Invalid JSON file',
    defNotFound: 'Definition not found',
    extractSourceError: 'Could not load scripts/extract_loot_tables.py (fetch unavailable when opened via file://). Open the file directly from the repository instead.',

    // ----- Help modal -----
    modalTitle: 'Loot Table Viewer',
    helpKicker: 'Help',
    showSource: 'Show Full Source ▼',
    hideSource: 'Hide Source ▲',

    helpQuickTitle: 'Quick Start',
    helpQuickItems: '<li><strong>Browse:</strong> Sidebar has Structures and Loot Tables (mobs, blocks, interactions, crops...)</li>' +
        '<li><strong>Categories:</strong> Dropdown in the sidebar header; a specific category lists its files directly</li>' +
        '<li><strong>Names:</strong> Entries show display names and ids — both are searchable</li>' +
        '<li><strong>Highlight:</strong> Funnel icon + partial search term (glows matches, collapses the rest)</li>' +
        '<li><strong>Collapse:</strong> ROLL headers or card titles</li>' +
        '<li><strong>Copy coordinates:</strong> Click coordinate chips (in Structures)</li>',

    helpTablesTitle: 'Understanding Loot Tables',
    helpThSee: 'What you see',
    helpThMeaning: 'Meaning',
    helpRowRoll: 'Picks N items among the slots below',
    helpRowIndividual: 'Each slot is its own independent roll — the badge is that roll\'s chance',
    helpRowIncluded: 'Another loot table rolled inline',
    helpRowItemChance: 'Chance the item appears; 100% = always',
    helpRowRollChance: 'Chance the roll happens; none = always',
    helpRowNothing: 'The pick rolled no item',

    helpGenTitle: 'Generating Data for Other Versions',
    helpGenIntro: 'You can generate data for any Hytale version using the files included with the game. No coding skills required!',
    helpStep1: 'Locate Assets.zip',
    helpStep1Desc: 'Go to your Hytale installation folder and find this file:',
    helpStep1Code: '.../Hytale/Install/package/latest/Assets.zip',
    helpStep2: 'Extract Required Folders',
    helpStep2Desc1: 'Open <code>Assets.zip</code> and navigate into <code>Assets/Server/</code>.',
    helpStep2Desc2: 'Extract these folders to the same folder as this tool:',
    helpStep2Prefabs: '<code>Prefabs</code> (contains structure data)',
    helpStep2Drops: '<code>Drops</code> (all loot tables: chests, mobs, blocks, interactions)',
    helpStep3: 'Run the Script',
    helpStep3Desc: 'Run the script below to generate a new <code>mapped_prefabs_data.json</code> file. Then run <code>scripts/generate_app_data.py</code> to merge it with the <code>Drops</code> folder into <code>data.js</code>.',

    helpTipsTitle: 'Tips & Tricks',
    helpTipsItems: '<li>Hover over item icons for detailed tooltips</li>' +
        '<li>Missing icons show "?" - run <code>showMissingIconsReport()</code> in console</li>' +
        '<li>Press <kbd>Esc</kbd> to close this help dialog</li>'
};

/*
 * Static attribute/text bindings applied once at boot (element -> key).
 * attr 'text' = element textContent, anything else = that HTML attribute.
 */
window.TEXT_ATTRS = [
    { sel: '#upload-overlay h1', attr: 'text', key: 'uploadTitle' },
    { sel: '#upload-overlay p', attr: 'html', key: 'uploadDragDrop' },
    { sel: '#upload-overlay .btn-upload', attr: 'text', key: 'uploadSelectFile' },
    { sel: '.brand-title', attr: 'text', key: 'brandTitle' },
    { sel: '.brand-sub', attr: 'text', key: 'brandSub' },
    { sel: '#category-select', attr: 'title', key: 'filterCategoriesTip' },
    { sel: '#btn-help', attr: 'title', key: 'helpBtnTitle' },
    { sel: '#btn-open', attr: 'title', key: 'openFileBtnTitle' },
    { sel: '#search', attr: 'placeholder', key: 'searchPlaceholder' },
    { sel: '#search-clear', attr: 'title', key: 'clearBtnTitle' },
    { sel: '.sidebar-foot', attr: 'text', key: 'scrollHint' },
    { sel: '#empty-state > div:last-child', attr: 'text', key: 'emptyState' },
    { sel: '#help-modal h2', attr: 'text', key: 'modalTitle' },
    { sel: '#help-quick-title', attr: 'text', key: 'helpQuickTitle' },
    { sel: '#help-quick-items', attr: 'html', key: 'helpQuickItems' },
    { sel: '#help-tables-title', attr: 'text', key: 'helpTablesTitle' },
    { sel: '#help-th-see', attr: 'text', key: 'helpThSee' },
    { sel: '#help-th-meaning', attr: 'text', key: 'helpThMeaning' },
    { sel: '#help-gen-title', attr: 'text', key: 'helpGenTitle' },
    { sel: '#help-gen-intro', attr: 'text', key: 'helpGenIntro' },
    { sel: '#help-step1', attr: 'text', key: 'helpStep1' },
    { sel: '#help-step1-desc', attr: 'text', key: 'helpStep1Desc' },
    { sel: '#help-step1-code', attr: 'text', key: 'helpStep1Code' },
    { sel: '#help-step2', attr: 'text', key: 'helpStep2' },
    { sel: '#help-step2-desc1', attr: 'html', key: 'helpStep2Desc1' },
    { sel: '#help-step2-desc2', attr: 'text', key: 'helpStep2Desc2' },
    { sel: '#help-step2-prefabs', attr: 'html', key: 'helpStep2Prefabs' },
    { sel: '#help-step2-drops', attr: 'html', key: 'helpStep2Drops' },
    { sel: '#help-step3', attr: 'text', key: 'helpStep3' },
    { sel: '#help-step3-desc', attr: 'html', key: 'helpStep3Desc' },
    { sel: '#help-tips-title', attr: 'text', key: 'helpTipsTitle' },
    { sel: '#help-tips-items', attr: 'html', key: 'helpTipsItems' }
];
