let DATA = null;
let searchTerm = '';
let matchesOnly = false;
let activeCategory = 'All';
let currentEntry = null;

// --- Texts (texts.js; swap that file for another string set) ---
function T(key) {
    return (window.TEXTS && window.TEXTS[key]) || key;
}

function tf(key, params) {
    return String(T(key)).replace(/\{(\w+)\}/g, (m, k) =>
        (params && Object.prototype.hasOwnProperty.call(params, k)) ? params[k] : m
    );
}

// Canonical root/category ids mapped to their display labels;
// unknown segments (data categories, file names) pass through.
function displaySeg(seg) {
    if(seg === 'All') return T('catAll');
    if(seg === 'Structures') return T('catStructures');
    if(seg === 'Loot Tables') return T('catLootTables');
    return seg;
}

function applyStaticTexts() {
    if(!window.TEXTS) { console.log('texts.js loaded? window.TEXTS missing'); return; }
    // Attribute-based bindings first: elements self-describe their texts.js
    // key with data-text (textContent) / data-text-html (innerHTML)
    document.querySelectorAll('[data-text], [data-text-html]').forEach(el => {
        const textKey = el.getAttribute('data-text');
        const htmlKey = el.getAttribute('data-text-html');
        if(textKey && T(textKey) != null) el.textContent = T(textKey);
        else if(htmlKey && T(htmlKey) != null) el.innerHTML = T(htmlKey);
    });
    (window.TEXT_ATTRS || []).forEach(({ sel, attr, key }) => {
        const el = document.querySelector(sel);
        if(!el) return;
        if(attr === 'text') el.textContent = T(key);
        else if(attr === 'html') el.innerHTML = T(key);
        else el.setAttribute(attr, T(key));
    });
    // CSS-owned strings (Nothing slot) exposed as a custom property
    document.documentElement.style.setProperty('--nothing-text', JSON.stringify(T('nothingSlotText')));
}

// --- UI state persistence (checks in locally so a refresh keeps your session) ---
const LS_KEY = 'lw_ui_state_v1';
// Expanded sidebar folders (persisted); paths are raw tree keys joined by '/'
let expandedPaths = new Set();

function saveUiState() {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify({
            entry: currentEntry ? { kind: currentEntry.kind, name: currentEntry.name } : null,
            term: searchTerm,
            matchesOnly,
            category: activeCategory,
            expanded: Array.from(expandedPaths)
        }));
    } catch (e) { /* file:// with blocked storage - ignore */ }
}

function restoreUiState() {
    let saved;
    try {
        saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    } catch (e) { return; }
    if(!saved) return;

    if(Array.isArray(saved.expanded)) {
        saved.expanded.forEach(p => expandedPaths.add(p));
    }

    if(saved.category && activeCategory !== saved.category) {
        activeCategory = saved.category;
        const select = document.getElementById('category-select');
        if(select) select.value = activeCategory;
    }

    if(saved.entry) {
        const match = collectEntries().find(e => e.kind === saved.entry.kind && e.name === saved.entry.name);
        if(match) loadEntry(match);
    }

    if(saved.term) {
        const input = document.getElementById('search');
        if(input) input.value = saved.term;
        runSearch(saved.term);
    }
    if(saved.matchesOnly) {
        matchesOnly = true;
        const toggle = document.getElementById('matches-only');
        if(toggle) toggle.checked = true;
        applyFilter();
    }
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function escapeAttr(str) {
    return escapeHtml(str);
}

// --- Auto-load Default JSON ---
window.addEventListener('DOMContentLoaded', () => {
    // Check if data.js loaded
    if(window.DEFAULT_DATA) {
        DATA = window.DEFAULT_DATA;
        document.getElementById('upload-overlay').classList.add('hidden');
        applyStaticTexts();
        initCategorySelect();
        restoreUiState();
        if(!searchTerm) buildSidebar();
    } else {
        // Fallback to fetch if data.js missing/empty
        fetch('data/mapped_prefabs_data.json')
            .then(response => {
                if(response.ok) return response.json();
                throw new Error('Default file not found');
            })
            .then(json => {
                DATA = json;
                document.getElementById('upload-overlay').classList.add('hidden');
                applyStaticTexts();
                initCategorySelect();
                restoreUiState();
                if(!searchTerm) buildSidebar();
            })
            .catch(err => console.log('Waiting for file upload...', err));
    }
});

// --- Drag and Drop & File Input ---
const overlay = document.getElementById('upload-overlay');
const fileInput = document.getElementById('file-input');
const btnOpen = document.getElementById('btn-open');

btnOpen.onclick = () => fileInput.click();

window.ondragover = e => e.preventDefault();
window.ondrop = e => {
    e.preventDefault();
    loadJSON(e.dataTransfer.files[0]);
};
fileInput.onchange = e => loadJSON(e.target.files[0]);

function loadJSON(file) {
    if(!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            DATA = JSON.parse(e.target.result);
            if(!DATA.drops) DATA.drops = [];
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.classList.add('hidden'), 300);
            applyStaticTexts();
            initCategorySelect();
            buildSidebar();
        } catch(err) {
            alert(T('invalidFileAlert'));
            console.error(err);
        }
    };
    reader.readAsText(file);
}

// --- Unified entries (prefab | drop) ---
// Every browsable leaf is one entry; the tree is built from these.
// Drops (the loot tables) render under the "Loot Tables" root group.
function collectEntries() {
    const entries = [];

    (DATA.prefabs || []).forEach(p => entries.push({
        kind: 'prefab',
        path: ['Structures', ...p.relative_path_from_root.replace(/\\/g, '/').split('/')],
        name: p.prefab_name,
        category: 'Structures',
        data: p
    }));

    (DATA.drops || []).forEach(d => {
        const rest = d.category && d.path.startsWith(d.category + '/')
            ? d.path.slice(d.category.length + 1).split('/')
            : [d.name];
        entries.push({
            kind: 'drop',
            path: ['Loot Tables', ...(d.category ? [d.category] : []), ...rest],
            name: d.name,
            category: d.category || 'Loot Tables',
            // Batch E: names/icons live in display_names.js + icon_mappings.js,
            // not in data.js - resolve here via the helper globals
            displayName: window.DISPLAY_NAMES ? DISPLAY_NAMES.drops[d.name] : undefined,
            icon: window.getDropIcon ? getDropIcon(d.name) : undefined,
            root: d.root
        });
    });

    return entries;
}

function filteredEntries() {
    const all = collectEntries();
    if(activeCategory === 'All') return all;
    if(activeCategory === 'Structures') {
        return all.filter(e => e.kind === 'prefab').map(e => ({ ...e, path: e.path.slice(1) }));
    }
    if(activeCategory === 'Loot Tables') {
        return all.filter(e => e.kind === 'drop').map(e => ({ ...e, path: e.path.slice(1) }));
    }
    // specific drop category: strip root group + category, contents render directly
    return all
        .filter(e => e.category === activeCategory)
        .map(e => ({ ...e, path: e.path.slice(2) }));
}

function initCategorySelect() {
    const select = document.getElementById('category-select');
    if(!select) return;

    const cats = new Set((DATA.drops || []).map(d => d.category).filter(Boolean));
    const ordered = ['All', 'Structures', 'Loot Tables', ...[...cats].sort()];

    select.innerHTML = ordered
        .map(c => `<option value="${escapeAttr(c)}">${escapeHtml(displaySeg(c))}</option>`)
        .join('');
    select.value = activeCategory;

    select.onchange = () => {
        activeCategory = select.value;
        clearSearch(true);
        buildSidebar();
        saveUiState();
    };
}

// Generic tree from entries; leaf _data = entry
function buildTree(entries) {
    const root = {};
    entries.forEach(entry => {
        let current = root;
        entry.path.forEach((part, i) => {
            if(i === entry.path.length - 1) {
                current[part] = { _type: 'file', _data: entry };
            } else {
                if(!current[part]) current[part] = { _type: 'folder', _children: {} };
                current = current[part]._children;
            }
        });
    });
    return root;
}

function countTree(node) {
    let count = 0;
    Object.keys(node).forEach(key => {
        if(key.startsWith('_')) return;
        const item = node[key];
        if(item._type === 'file') {
            count++;
        } else {
            const childCount = countTree(item._children);
            item._count = childCount;
            count += childCount;
        }
    });
    return count;
}

function buildSidebar() {
    const container = document.getElementById('sidebar-root');
    container.innerHTML = '';
    const entries = filteredEntries();
    const tree = buildTree(entries);
    countTree(tree);
    container.appendChild(renderTreeNode(tree, false, searchTerm));
}

function renderHighlightedName(key, highlight) {
    if(!highlight) return escapeHtml(key);
    const lower = key.toLowerCase();
    const i = lower.indexOf(highlight.toLowerCase());
    if(i < 0) return escapeHtml(key);
    return `${escapeHtml(key.slice(0, i))}<mark>${escapeHtml(key.slice(i, i + highlight.length))}</mark>${escapeHtml(key.slice(i + highlight.length))}`;
}

function renderTreeNode(obj, expandAll = false, highlight = '', prefix = []) {
    const wrapper = document.createElement('div');
    // The visible viewport (the .tree-root scroller itself) is what
    // percentage widths resolve against when the tree overflows
    // horizontally, so rows' hover/selection bands stopped at the visible
    // edge while long rows kept scrolling (feedback 39). Growing this thin
    // canvas wrapper to the widest row makes every row's min-width:100%
    // resolve against the full scroll extent instead.
    if(prefix.length === 0) wrapper.className = 'tree-canvas';
    const keys = Object.keys(obj).sort((a,b) => {
        const tA = obj[a]._type || 'folder';
        const tB = obj[b]._type || 'folder';
        if(tA === tB) return a.localeCompare(b);
        return tA === 'folder' ? -1 : 1;
    });

    keys.forEach(key => {
        if(key.startsWith('_')) return;
        const item = obj[key];
        const isFolder = item._type === 'folder';
        const div = document.createElement('div');
        div.className = 'node-item';
        const rawKey = key;
        const pathKey = [...prefix, rawKey].join('/');

        // Auto-expand if requested (search results) or persisted as expanded
        if(isFolder && (expandAll || expandedPaths.has(pathKey))) {
            div.classList.add('expanded');
        }
        if(isFolder) div.dataset.path = pathKey;

        key = displaySeg(key);
    const label = document.createElement('div');
        label.className = 'node-label';
        
        if(isFolder) {
            label.innerHTML = `
                <span class="arrow">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </span>
                <span class="node-icon icon-folder">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                </span> 
                <span class="node-name">${renderHighlightedName(key, highlight)} ${item._count ? `<span class="node-count">(${item._count})</span>` : ''}</span>`;
            
            label.onclick = (ev) => {
                if(ev.altKey) {
                    // Recursive collapse: close this folder AND every folder
                    // inside it, so reopening the parent shows them collapsed.
                    if(div.classList.contains('expanded')) {
                        div.querySelectorAll('.node-item[data-path]').forEach(n => {
                            n.classList.remove('expanded');
                            expandedPaths.delete(n.dataset.path);
                        });
                        div.classList.remove('expanded');
                        expandedPaths.delete(pathKey);
                        saveUiState();
                    }
                    return;
                }
                div.classList.toggle('expanded');
                if(div.classList.contains('expanded')) expandedPaths.add(pathKey);
                else expandedPaths.delete(pathKey);
                saveUiState();
            };
        } else {
            const entry = item._data;
            const iconMarkup = entry.icon
                ? `<img class="node-thumb" loading="lazy" src="${escapeAttr(entry.icon)}" alt="">`
                : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
            // Display name (if available) as primary + raw id as secondary
            const subId = entry.displayName && entry.displayName !== key
                ? ` <span class="node-subid">${renderHighlightedName(key, highlight)}</span>`
                : '';
            const primary = entry.displayName
                ? `<span class="node-display">${renderHighlightedName(entry.displayName, highlight)}</span>${subId}`
                : renderHighlightedName(key, highlight);
            label.innerHTML = `
                <span class="arrow"></span>
                <span class="node-icon icon-file">${iconMarkup}</span>
                <span class="node-name">${primary}</span>`;

            // selection highlight survives tree rebuilds / refresh
            if(currentEntry && currentEntry.kind === entry.kind && currentEntry.name === entry.name) {
                label.classList.add('active');
            }

            label.onclick = () => {
                document.querySelectorAll('.node-label').forEach(el => el.classList.remove('active'));
                label.classList.add('active');
                loadEntry(entry);
            }
        }

        div.appendChild(label);
        if(isFolder) {
            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'node-children';
            childrenDiv.appendChild(renderTreeNode(item._children, expandAll, highlight, [...prefix, rawKey]));
            div.appendChild(childrenDiv);
        }
        wrapper.appendChild(div);
    });
    return wrapper;
}

// --- Smart Search (name match + item content match, across all browsable entries) ---
window.clearSearch = function(keepCategory = false) {
    document.getElementById('search').value = '';
    searchTerm = '';
    document.getElementById('search-clear').classList.add('hidden');
    if(!keepCategory) buildSidebar();
    applyFilter();
};

let searchTimer = null;
document.getElementById('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(e.target.value), 150);
});

// Display name of an item id (variant ids like "*X_State_U" resolve to base "X")
function itemBaseName(itemId) {
    return itemId.replace(/^\*/, '').replace(/_State_[A-Za-z]+$/, '');
}

function itemDisplayName(itemId) {
    return (DISPLAY_NAMES.items || {})[itemBaseName(itemId)] || null;
}

// Does the entry itself swing items? (content check, recursive via Droplist)
function entryContainsItem(entry, term) {
    if(entry.kind === 'prefab') {
        const chests = entry.data.chests || [];
        return chests.some(chest => {
            const lootDef = DATA.loot_table_definitions[chest.loot_table_id];
            return lootDef && containsItem(lootDef, term);
        });
    }
    return entry.root ? containsItem(entry.root, term) : false;
}

// Subject-name match: display name if present, else raw id; misses other ids
function entryNameMatches(entry, term) {
    if(entry.name && entry.name.toLowerCase().includes(term)) return true;
    return !!(entry.displayName && entry.displayName.toLowerCase().includes(term));
}

function runSearch(rawValue) {
    const term = rawValue.toLowerCase().trim();
    const container = document.getElementById('sidebar-root');
    const clearBtn = document.getElementById('search-clear');
    searchTerm = term;
    saveUiState();

    if(!term) {
        clearBtn.classList.add('hidden');
        buildSidebar();
        applyFilter();
        return;
    }

    clearBtn.classList.remove('hidden');

    const matches = [];
    let nameCount = 0;
    let itemCount = 0;

    filteredEntries().forEach(entry => {
        if(entryNameMatches(entry, term)) {
            matches.push(entry);
            nameCount++;
        }
    });

    filteredEntries().forEach(entry => {
        if(matches.some(m => m === entry)) return;
        if(entryContainsItem(entry, term)) {
            matches.push(entry);
            itemCount++;
        }
    });

    const totalCount = nameCount + itemCount;
    container.innerHTML = '';

    if(totalCount > 0) {
        const searchTree = buildTree(matches);
        countTree(searchTree);
        container.insertAdjacentHTML('beforeend', `<div class="search-results-info">${escapeHtml(tf(totalCount === 1 ? 'searchResultsOne' : 'searchResultsMany', { n: totalCount, term, names: nameCount, items: itemCount }))}</div>`);
        container.appendChild(renderTreeNode(searchTree, true, term));
    } else {
        container.innerHTML = `<div style="padding: 20px; color: #666; text-align: center;">${escapeHtml(T('noMatches'))}</div>`;
    }

    applyFilter();
}

// Helper: Check if loot table contains an item
function containsItem(node, itemName) {
    if(!node) return false;
    
    if(node.Container) return containsItem(node.Container, itemName);
    
    if(Array.isArray(node)) {
        return node.some(n => containsItem(n, itemName));
    }
    
    if(node.Type === "Choice" || node.Type === "Multiple") {
        if(node.Containers) {
            return node.Containers.some(c => containsItem(c, itemName));
        }
    }
    
    if(node.Type === "Droplist") {
        const def = DATA.loot_table_definitions[node.DroplistId];
        return def ? containsItem(def, itemName) : false;
    }
    
    if(node.Type === "Single" && node.Item) {
        const id = node.Item.ItemId.toLowerCase();
        if(id.includes(itemName)) return true;
        const dn = itemDisplayName(node.Item.ItemId);
        return !!(dn && dn.toLowerCase().includes(itemName));
    }
    
    return false;
}

// --- Calculate Tier Stats ---
function calculateTierStats(chests) {
    const stats = {
        total: chests.length,
        tiers: {}
    };
    
    chests.forEach(chest => {
        const tier = chest.loot_table_id.match(/Tier(\d+)/i);
        if(tier) {
            const tierNum = `Tier ${tier[1]}`;
            stats.tiers[tierNum] = (stats.tiers[tierNum] || 0) + 1;
        } else {
            // Count non-tier tables
            stats.tiers['Other'] = (stats.tiers['Other'] || 0) + 1;
        }
    });
    
    return stats;
}

// Collapse/expand a loot card body, syncing chevron + aria state
function setCardCollapsed(card, collapsed) {
    const body = card.querySelector('.card-body');
    const header = card.querySelector('.card-header');
    if(!body) return;
    body.classList.toggle('hidden', collapsed);
    card.classList.toggle('card-collapsed', collapsed);
    if(header) header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

// --- Main Content View ---
function setCrumbPath(el, parts) {
    const clean = parts.filter(Boolean);
    el.innerHTML = clean
        .map((p, i) => {
            const disp = escapeHtml(displaySeg(p));
            return i === clean.length - 1 ? `<b>${disp}</b>` : `<span>${disp}</span>`;
        })
        .join('<span class="sep">/</span>');
}

// Take a mixed sequence of raw slots ("item-slot" fragments), roll rows and
// block wrappers and wrap every contiguous run of raw slots into its own
// .item-grid block. Idempotent: existing top-level grids pass through.
function wrapSlotRuns(html) {
    if(!html || !html.includes('item-slot')) return html;
    const frag = document.createElement('div');
    frag.innerHTML = html;
    const nodes = Array.from(frag.childNodes);
    let grid = null;
    for(const child of nodes) {
        // whitespace text nodes between blocks must not split a slot run
        if(child.nodeType === 3 && !child.nodeValue.trim()) continue;
        if(child.nodeType === 1 && child.classList.contains('item-slot')) {
            if(!grid) {
                grid = document.createElement('div');
                grid.className = 'item-grid';
                frag.insertBefore(grid, child);
            }
            grid.appendChild(child);
        } else {
            grid = null;
        }
    }
    return frag.innerHTML;
}

/* Wrap every top-level group of a card body into its own .loot-group div:
   [ROLL row + selection] | [droplist head + panel] | [standalone slot grid].
   Lets CSS set group spacing via one margin instead of collapse tricks.
   Idempotent; recurses into selection/droplist contents. */
function groupChildren(parent, topLevel) {
    // parent.children is a LIVE collection - wrapping shifts it while we
    // walk, so iterate a stable snapshot instead
    const nodes = Array.from(parent.children);
    let i = 0;
    while (i < nodes.length) {
        const n = nodes[i];
        const next = nodes[i + 1];
        let members = null;
        if(n.classList.contains('logic-row') && next &&
           (next.classList.contains('selection-content') || next.classList.contains('droplist-content'))) {
            members = [n, next];
            i += 2;
        } else if(n.classList.contains('item-grid')) {
            members = [n];
            i += 1;
        } else {
            i += 1;
        }
        if(members) {
            const g = document.createElement('div');
            g.className = 'loot-group';
            parent.insertBefore(g, members[0]);
            members.forEach(m => g.appendChild(m));
        }
    }
    coalesceFlatGroups(parent, topLevel);
    Array.from(parent.querySelectorAll('.selection-content, .droplist-content'))
        .forEach(sc => {
            if(sc.dataset.grouped === '1') return;
            sc.dataset.grouped = '1';
            groupChildren(sc, false);
        });
}

/* Loose slot groups at one level are all independent per-item drops.
   Merge them into ONE flat grid hoisted above the roll groups. At TOP level
   (card bodies, droplist panels) a flat grid with any real chance (< 100%)
   gets a chevron header so it reads as its own group ("individual rolls");
   nested roll contents never get one - their grid IS the roll's content.
   All-guaranteed flat rows stay bare. */
function coalesceFlatGroups(parent, topLevel) {
    const flats = Array.from(parent.children).filter(g =>
        g.classList.contains('loot-group') &&
        g.children.length === 1 && g.children[0].classList.contains('item-grid'));
    if(flats.length === 0) return;
    const keepGrid = flats[0].children[0];
    for(let k = 1; k < flats.length; k++) {
        Array.from(flats[k].children[0].children).forEach(slot => keepGrid.appendChild(slot));
        flats[k].remove();
    }
    if(flats[0].previousElementSibling) {
        parent.insertBefore(flats[0], parent.firstElementChild);
    }
    if(!topLevel) return;
    const slots = Array.from(keepGrid.children);
    const chanced = slots.some(s => {
        const c = parseFloat(s.dataset.chance);
        return !isNaN(c) && c < 100;
    });
    if(!chanced) return;
    const selId = `sel-${selectionCounter++}`;
    const head = document.createElement('div');
    head.className = 'logic-row expanded';
    head.dataset.toggle = selId;
    head.innerHTML = `<span class="row-arrow"></span> ${tf('flatRollsLabel', { count: slots.length })}`;
    const content = document.createElement('div');
    content.className = 'selection-content';
    content.id = selId;
    content.dataset.grouped = '1';
    content.appendChild(keepGrid);
    flats[0].appendChild(head);
    flats[0].appendChild(content);
}

function wrapGroups(html, topLevel = true) {
    if(!html) return html;
    const frag = document.createElement('div');
    frag.innerHTML = wrapSlotRuns(html);
    groupChildren(frag, topLevel);
    return frag.innerHTML;
}

function loadEntry(entry) {
    currentEntry = entry;
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('content-view').classList.remove('hidden');

    // Big subject icon first (top-left portrait), then names
    const portrait = document.getElementById('view-icon');
    const portraitWrap = document.getElementById('view-icon-wrap');
    portraitWrap.style.display = entry.icon ? '' : 'none';
    if(entry.icon) portrait.src = escapeAttr(entry.icon);

    const kickerEl = document.getElementById('view-kicker');
    kickerEl.innerText = entry.kind === 'prefab' ? T('kickerStructure') : T('kickerLootTable');

    const titleEl = document.getElementById('view-title');
    const subIdEl = document.getElementById('view-sub-id');
    if(entry.displayName && entry.displayName !== entry.name) {
        titleEl.innerText = entry.displayName;
        subIdEl.innerText = entry.name;
        subIdEl.style.display = '';
    } else {
        titleEl.innerText = entry.name;
        subIdEl.style.display = 'none';
        subIdEl.innerText = '';
    }

    const statsItems = document.querySelectorAll('.stats-bar .stat-item');

    if(entry.kind === 'prefab') {
        setCrumbPath(document.getElementById('view-path'), entry.data.relative_path_from_root.split(/[\\/]/));
        statsItems.forEach(s => s.style.display = '');
        loadPrefabView(entry);
    } else {
        setCrumbPath(document.getElementById('view-path'), ['Loot Tables', ...entry.path.slice(1)]);
        statsItems.forEach(s => s.style.display = 'none');
        loadSimpleView(entry);
    }

    applyFilter();
    saveUiState();
}

// New loot-card for any entry (drop / loot table): one grid, no locations
function buildLootCard(title, canCollapse, gridHtml) {
    const card = document.createElement('div');
    card.className = 'loot-card';

    const header = document.createElement('div');
    header.className = 'card-header';
    header.setAttribute('role', 'button');
    header.setAttribute('aria-expanded', 'true');
    header.innerHTML = `<span class="card-title">${escapeHtml(title)}</span>
        <span class="card-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span>
        <span class="card-meta-group">
            <span class="card-meta card-meta-items hidden"></span>
        </span>`;
    header.onclick = () => setCardCollapsed(card, !card.classList.contains('card-collapsed'));

    const body = document.createElement('div');
    body.className = 'card-body';

    body.innerHTML = wrapGroups(gridHtml);

    card.appendChild(header);
    card.appendChild(body);
    return card;
}

// Drops and loot tables: single card with the drop/roll tree
function loadSimpleView(entry) {
    const container = document.getElementById('loot-container');
    container.innerHTML = '';
    selectionCounter = 0;

    const gridHtml = entry.root
        ? renderLootGrid(entry.root)
        : '<div style="color:#555; padding:10px;">No loot defined</div>';

    container.appendChild(buildLootCard(entry.name, true, gridHtml));
}

function loadPrefabView(entry) {
    const prefab = entry.data;

    // Calculate and display tier stats
    const tierStats = calculateTierStats(prefab.chests);
    document.getElementById('stat-chests').innerText = tierStats.total;

    // Show tier breakdown
    const tierCount = Object.keys(tierStats.tiers).length;
    const tierParts = Object.entries(tierStats.tiers)
        .sort((a, b) => {
            if(a[0] === 'Other') return 1;
            if(b[0] === 'Other') return -1;
            return a[0].localeCompare(b[0], undefined, { numeric: true });
        })
        .map(([tier, count]) => `${count}x ${tier}`);

    document.getElementById('stat-chests-label').innerText = tf('statChestsValue', { n: tierStats.total });

    const statTablesEl = document.getElementById('stat-tables');
    statTablesEl.innerText = tierCount;
    statTablesEl.title = tf('statTablesTip', { tiers: tierParts.length ? ': ' + tierParts.join(', ') : '' });
    document.getElementById('stat-tables-label').innerText = `${tierCount}x Loot Table${tierCount === 1 ? '' : 's'}`;

    const container = document.getElementById('loot-container');
    container.innerHTML = '';
    selectionCounter = 0;

    const groups = {};
    prefab.chests.forEach(c => {
        if(!groups[c.loot_table_id]) groups[c.loot_table_id] = [];
        groups[c.loot_table_id].push(c.location);
    });

    Object.keys(groups).sort().forEach(id => {
        const locations = groups[id];
        const def = DATA.loot_table_definitions[id];

        const card = document.createElement('div');
        card.className = 'loot-card';

        const header = document.createElement('div');
        header.className = 'card-header';
        header.setAttribute('role', 'button');
        header.setAttribute('aria-expanded', 'true');
        header.innerHTML = `<span class="card-title">${escapeHtml(id)}</span>
            <span class="card-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span>
            <span class="card-meta-group">
                <span class="card-meta card-meta-items hidden"></span>
                <span class="card-meta">${locations.length} ${escapeHtml(T(locations.length === 1 ? 'cardChests' : 'cardChestsPlural'))}</span>
            </span>`;
        header.onclick = () => setCardCollapsed(card, !card.classList.contains('card-collapsed'));

        const body = document.createElement('div');
        body.className = 'card-body';

        const coordsBox = document.createElement('div');
        coordsBox.className = 'coords-box';
        coordsBox.innerHTML = `
            <div class="coords-label">Coordinates (Click to Copy)</div>
            <div class="coords-grid">
                ${locations.map(l => `<div class="coord-chip" onclick="navigator.clipboard.writeText('${l.x} ${l.y} ${l.z}')">x:${l.x} y:${l.y} z:${l.z}</div>`).join('')}
            </div>
        `;
        body.appendChild(coordsBox);

        // Render Items as Grid
        body.innerHTML = wrapGroups(renderLootGrid(def));

        card.appendChild(header);
        card.appendChild(body);
        container.appendChild(card);
    });
}

// --- "Matches only" filtering ---
// Dim non-matching items in the loaded prefab when the toggle is ON and a search term exists.
function applyFilter() {
    const active = matchesOnly && searchTerm;
    document.querySelectorAll('.item-slot[data-item-id]').forEach(slot => {
        const itemId = (slot.dataset.itemId || '').toLowerCase();
        const dn = itemDisplayName(slot.dataset.itemId || '');
        const match = itemId.includes(searchTerm) || (dn && dn.toLowerCase().includes(searchTerm));
        slot.classList.toggle('dimmed', active && !match);
        slot.classList.toggle('matched', active && match);
    });

    document.querySelectorAll('.droplist-content').forEach(dc => {
        const row = dc.previousElementSibling;
        if(!row) return;
        const hasVisible = active && dc.querySelector('.item-slot[data-item-id]:not(.dimmed)');
        row.classList.toggle('contains-match', !!hasVisible);
    });

    document.querySelectorAll('.loot-card').forEach(card => {
        const slots = card.querySelectorAll('.item-slot[data-item-id]');
        const shown = Array.from(slots).filter(s => !s.classList.contains('dimmed')).length;

        // Collapse cards with no matching items while filtering
        if(active) {
            setCardCollapsed(card, shown === 0);
        }

        const badge = card.querySelector('.card-meta-items');
        if(badge) {
            if(active) {
                badge.textContent = tf('matchBadge', { shown, total: slots.length });
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
                badge.textContent = '';
            }
        }

        card.classList.toggle('card-no-match', active && shown === 0);
    });
}

// Event delegation for the loot card area (slots + logic rows)
function initLootContainer() {
    const container = document.getElementById('loot-container');
    if(!container) return;

    container.addEventListener('click', e => {
        const toggleRow = e.target.closest('[data-toggle]');
        if(toggleRow) {
            toggleSelection(toggleRow);
            return;
        }
        const droplistRow = e.target.closest('[data-droplist]');
        if(droplistRow) {
            toggleDroplistGrid(droplistRow, droplistRow.dataset.droplist);
        }
    });

    container.addEventListener('mouseover', e => {
        const slot = e.target.closest('.item-slot[data-item-id]');
        if(!slot) return;
        tooltip.style.display = '';
        showTooltip(slot, slot.dataset.itemId, slot.dataset.qty, slot.dataset.chance);
    });

    container.addEventListener('mouseout', e => {
        if(e.target.closest('.item-slot[data-item-id]')) hideTooltip();
    });
}

// --- Grid Renderer ---
let selectionCounter = 0;

function formatPct(chance) {
    const pct = Math.round(chance * 1000) / 10;
    return (pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)) + '%';
}

function renderLootGrid(node) {
    if(!node) return `<div style="color:red; padding:10px;">${escapeHtml(T('defNotFound'))}</div>`;

    // Batch P: chance math lives in loot_chance.js (window.LootChance). This
    // renderer is presentation-only: annotate once, then walk the annotated
    // tree and emit markup. raw defs are accepted anywhere (auto-annotated).
    const ann = node.__lootAnn ? node : LootChance.annotate(node, { resolveDroplist: id => DATA.loot_table_definitions[id] });
    return renderAnn(ann);
}

function renderAnn(ann) {
    if(!ann) return '';
    switch(ann.kind) {
        case 'group':    return ann.children.map(renderAnn).join('');
        case 'multiple': return ann.children.map(renderAnn).join('');
        case 'choice':   return renderChoiceAnn(ann);
        case 'droplist': return renderDroplistAnn(ann);
        case 'empty':
            return `<div class="item-slot item-slot-nothing">
                <span class="item-chance">${formatPct(ann.chance)}</span>
            </div>`;
        case 'single':   return renderSingleAnn(ann);
        default:         return '';
    }
}

function renderChoiceAnn(ann) {
    // A single-member pick row is indistinguishable in outcome from the item
    // itself - flatten it so users don't wonder where "the selection" is.
    if(ann.children.length === 1) return renderAnn(ann.children[0]);

    const range = LootChance._internals.rollRange(ann.node);
    // legacy label parity: unsettled range prints "min-max"; a fixed count of
    // exactly 1 prints "1" (any other fixed count keeps "2-2" style)
    const rangeLabel = !range ? '1' : (range.min === 1 && range.max === 1 ? '1' : `${range.min}-${range.max}`);
    const rowLabel = tf('rollLabel', { range: rangeLabel });
    // badge shows ONLY an unconsumed own trigger (< 1); a Weight consumed by
    // a parent Choice/Multiple is already inside the item chances.
    let badge = '';
    if(ann.node.Weight !== undefined && ann.trigger !== undefined && ann.trigger < 1) {
        badge = ` <span class="row-chance">${formatPct(ann.trigger)}</span>`;
    }

    const selId = `sel-${selectionCounter++}`;
    let html = `<div class="logic-row expanded" data-toggle="${selId}"><span class="row-arrow"></span> ${rowLabel}${badge}</div>`;
    html += `<div class="selection-content" id="${selId}">`;
    html += wrapGroups(ann.children.map(renderAnn).join(''), false);
    html += `</div>`;
    return html;
}

function renderDroplistAnn(ann) {
    const safeId = ann.node.DroplistId.replace(/[^a-zA-Z0-9]/g, '');
    let html = `
        <div class="logic-row droplist-head expanded" data-droplist="${escapeAttr(ann.node.DroplistId)}">
            <span class="row-arrow"></span><span>${escapeHtml(T('includedTitle'))}</span><a class="link">${escapeHtml(ann.node.DroplistId)}</a>
        </div>
        <div class="droplist-content" id="dl-${safeId}">
    `;
    html += ann.child ? wrapGroups(renderAnn(ann.child)) : '<div style="color:red; padding:5px;">' + escapeHtml(T('defNotFound')) + '</div>';
    html += `</div>`;
    return html;
}

function renderSingleAnn(ann) {
    const node = ann.node;
    const qmin = node.Item.QuantityMin;
    const qmax = node.Item.QuantityMax;
    const qty = (qmax === undefined && qmin === undefined)
                ? '1'
                : (qmax === undefined || qmax === qmin)
                    ? String(qmin ?? 1)
                    : `${qmin}-${qmax}`;
    const chanceDisplay = formatPct(ann.chance);
    const iconPath = getIconPath(node.Item.ItemId);

    return `
        <div class="item-slot" data-item-id="${escapeAttr(node.Item.ItemId)}" data-qty="${escapeAttr(String(qty))}" data-chance="${chanceDisplay}">
            <img loading="lazy" src="${iconPath}" onerror="trackMissingIcon('${escapeAttr(node.Item.ItemId)}', this)" data-item-id="${escapeAttr(node.Item.ItemId)}">
            <span class="item-qty">${qty}</span>
            <span class="item-chance">${chanceDisplay}</span>
        </div>
    `;
}

// Toggle selection visibility
window.toggleSelection = function(selIdOrRow) {
    const header = typeof selIdOrRow === 'string' ? document.getElementById(selIdOrRow).previousElementSibling : selIdOrRow;
    const content = header.nextElementSibling;
    
    if(content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        header.classList.remove('collapsed');
        header.classList.add('expanded');
        // the chevron follows the expanded class (style.css .row-arrow::before)
    } else {
        content.classList.add('hidden');
        header.classList.add('collapsed');
        header.classList.remove('expanded');
    }
};

function toggleDroplistGrid(el, droplistId) {
    const safeId = droplistId.replace(/[^a-zA-Z0-9]/g, '');
    let contentDiv = el.nextElementSibling;
    
    // If not found (sibling structure might vary), try ID
    if(!contentDiv || !contentDiv.classList.contains('droplist-content')) {
        contentDiv = document.getElementById(`dl-${safeId}`);
    }

    if(contentDiv.classList.contains('hidden')) {
        contentDiv.classList.remove('hidden');
        el.classList.add('expanded');
        el.classList.remove('collapsed');
        if(!contentDiv.innerHTML) {
            const def = DATA.loot_table_definitions[droplistId];
            if(def) {
                contentDiv.innerHTML = wrapGroups(renderLootGrid(def));
            } else {
                contentDiv.innerHTML = '<div style="color:red; padding:5px;">' + escapeHtml(T('defNotFound')) + '</div>';
            }
        }
    } else {
        contentDiv.classList.add('hidden');
        el.classList.add('collapsed');
        el.classList.remove('expanded');
    }
}

// Tooltip Logic
const tooltip = document.createElement('div');
tooltip.className = 'slot-tooltip';
document.body.appendChild(tooltip);

// Places the shared tooltip inside the viewport: clamps horizontally to the
// edges and flips above the anchor when it would overflow the bottom (or
// pins to the bottom edge for very tall tooltips).
function placeTooltipInViewport(anchorRect, gap) {
    const tRect = tooltip.getBoundingClientRect();
    const margin = 8;
    let left = anchorRect.left;
    let top = anchorRect.bottom + gap;
    if(left + tRect.width > window.innerWidth - margin) {
        left = window.innerWidth - margin - tRect.width;
    }
    if(left < margin) left = margin;
    if(top + tRect.height > window.innerHeight - margin) {
        top = anchorRect.top - tRect.height - gap;
    }
    if(top < margin) top = margin;
    if(top + tRect.height > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - margin - tRect.height);
    }
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

function showTooltip(el, name, qty, chance) {
    const rect = el.getBoundingClientRect();
    tooltip.style.whiteSpace = '';
    tooltip.style.maxWidth = '';
    const dn = itemDisplayName(name);
    let html = '';
    if(dn) html += `<strong>${escapeHtml(dn)}</strong><br>`;
    html += `<strong>${escapeHtml(name)}</strong>`;
    html += `<br>${escapeHtml(T('tooltipQuantity'))}: ${escapeHtml(String(qty))}`;
    if(chance) html += `<br>${escapeHtml(T('tooltipChance'))}: ${escapeHtml(String(chance))}`;
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    placeTooltipInViewport(rect, 5);
}

function hideTooltip() {
    tooltip.style.display = 'none';
}

// Custom hover tooltip for chrome/inline elements (native title tooltips get ignored).
// Wraps text; resets to nowrap for slot tooltips handled by showTooltip().
function showElementTooltip(el, text) {
    const rect = el.getBoundingClientRect();
    tooltip.style.whiteSpace = 'normal';
    tooltip.style.maxWidth = '320px';
    tooltip.innerHTML = escapeHtml(text);
    tooltip.style.display = 'block';
    placeTooltipInViewport(rect, 6);
}

function bindHoverTooltip(el, text) {
    el.addEventListener('mouseenter', () => showElementTooltip(el, text));
    el.addEventListener('mouseleave', hideTooltip);
}

// Missing Icon Tracker
const missingIcons = new Set();

function trackMissingIcon(itemId, imgElement) {
    missingIcons.add(itemId.replace(/^\*/, ''));
    // Set fallback placeholder - lighter and cleaner
    imgElement.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM1NTUiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIzIiB5PSIzIiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHJ4PSIyIiByeT0iMiIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjMiLz48bGluZSB4MT0iMTIiIHkxPSI4IiB4Mj0iMTIiIHkyPSI4Ii8+PC9zdmc+';
    imgElement.style.opacity = '0.5';
}

// Function to show the missing icons report
function showMissingIconsReport() {
    if(missingIcons.size > 0) {
        console.group(`%c⚠️ Missing Icons Report (${missingIcons.size} total)`, 'color: orange; font-weight: bold; font-size: 14px;');
        console.log('The following item icons could not be loaded:');
        console.log(Array.from(missingIcons).sort());
        console.log('\nPossible reasons:');
        console.log('1. Icon file does not exist in ItemsGenerated/ folder');
        console.log('2. Filename mismatch (check case sensitivity)');
        console.log('3. File extension is not .png');
        console.groupEnd();
    } else {
        console.log('%c✓ All item icons loaded successfully!', 'color: green; font-weight: bold;');
    }
}

// Run report after images have time to load
window.addEventListener('load', () => {
    setTimeout(showMissingIconsReport, 5000); // Wait 5 seconds for all images
});

// Also make it available globally so user can run it manually
window.showMissingIconsReport = showMissingIconsReport;
console.log('%cTip: Run showMissingIconsReport() in console to see missing icons at any time', 'color: #3b82f6; font-style: italic;');

// Help Modal Functions
let extractorSourceLoaded = false;

function loadExtractorSource() {
    if(extractorSourceLoaded) return;
    extractorSourceLoaded = true;
    const codeEl = document.getElementById('python-code').firstElementChild;
    // Preferred: generated scripts/extractor_source.js (window.EXTRACTOR_SOURCE)
    // works over file:// where fetch for local files is blocked by the browser
    if(window.EXTRACTOR_SOURCE) {
        codeEl.textContent = window.EXTRACTOR_SOURCE;
        return;
    }
    fetch('scripts/extract_loot_tables.py')
        .then(response => {
            if(!response.ok) throw new Error(response.status);
            return response.text();
        })
        .then(text => {
            codeEl.textContent = text;
        })
        .catch(() => {
            codeEl.textContent = T('extractSourceError');
        });
}

window.openHelp = function() {
    document.getElementById('help-modal').classList.remove('hidden');
    loadExtractorSource();
};

window.closeHelp = function() {
    document.getElementById('help-modal').classList.add('hidden');
};

window.togglePythonCode = function() {
    const codeBlock = document.getElementById('python-code');
    const toggleBtn = document.querySelector('.code-toggle');
    
    if(codeBlock.classList.contains('hidden')) {
        codeBlock.classList.remove('hidden');
        toggleBtn.textContent = T('hideSource');
    } else {
        codeBlock.classList.add('hidden');
        toggleBtn.textContent = T('showSource');
    }
};

// Close modal on background click
// Close modal on background click (prevent closing when dragging text)
let modalMouseDownTarget = null;

document.addEventListener('mousedown', (e) => {
    modalMouseDownTarget = e.target;
});

document.addEventListener('click', (e) => {
    const modal = document.getElementById('help-modal');
    // Only close if mousedown AND click happened on the modal background
    if(e.target === modal && modalMouseDownTarget === modal) {
        closeHelp();
    }
    modalMouseDownTarget = null;
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape') {
        closeHelp();
    }
});

// Help modal side nav: click scrolls a section into view, scrollspy keeps
// the active link in sync while the user scrolls manually.
function initHelpNav() {
    const nav = document.getElementById('help-nav');
    const body = document.getElementById('help-body');
    if(!nav || !body) return;
    const links = Array.from(nav.querySelectorAll('.nav-link'));
    if(links.length === 0) return;
    const setActive = idx => links.forEach((l, i) => l.classList.toggle('active', i === idx));
    // When content is short, a clicked section cannot always reach the top of
    // the scroll area (clamped scroll), which lets the scrollspy override the
    // clicked link right after clicking. A short cooldown keeps the clicked
    // state authoritative; later manual scroll events re-enable the spy.
    let spyCooldownTill = 0;
    links.forEach((link, i) => {
        link.addEventListener('click', () => {
            const sec = document.getElementById(link.dataset.target);
            if(sec) body.scrollTo({ top: Math.max(0, sec.offsetTop - 6), behavior: 'auto' });
            spyCooldownTill = performance.now() + 650;
            setActive(i);
        });
    });
    body.addEventListener('scroll', () => {
        if(performance.now() < spyCooldownTill) return;
        const maxScroll = body.scrollHeight - body.clientHeight;
        let best;
        if(maxScroll > 0 && body.scrollTop >= maxScroll - 2) {
            best = links.length - 1; // pinned to the end - last section wins
        } else {
            best = 0;
            links.forEach((link, i) => {
                const sec = document.getElementById(link.dataset.target);
                if(sec && sec.offsetTop <= body.scrollTop + 48) best = i;
            });
        }
        setActive(best);
    });
}

// --- Init ---
const matchesOnlyToggle = document.getElementById('matches-only');
if(matchesOnlyToggle) {
    matchesOnlyToggle.addEventListener('change', () => {
        matchesOnly = matchesOnlyToggle.checked;
        applyFilter();
        saveUiState();
    });
}

const matchesOnlyLabel = document.querySelector('.filter-toggle');
if(matchesOnlyLabel) {
    bindHoverTooltip(matchesOnlyLabel, T('funnelTip'));
}
initHelpNav();
initLootContainer();
