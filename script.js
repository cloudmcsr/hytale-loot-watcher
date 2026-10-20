let DATA = null;
let searchTerm = '';
let matchesOnly = false;
let activeCategory = 'All';
let currentEntry = null;

// --- UI state persistence (checks in locally so a refresh keeps your session) ---
const LS_KEY = 'lw_ui_state_v1';

function saveUiState() {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify({
            entry: currentEntry ? { kind: currentEntry.kind, name: currentEntry.name } : null,
            term: searchTerm,
            matchesOnly,
            category: activeCategory
        }));
    } catch (e) { /* file:// with blocked storage - ignore */ }
}

function restoreUiState() {
    let saved;
    try {
        saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    } catch (e) { return; }
    if(!saved) return;

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
        initCategorySelect();
        buildSidebar();
        restoreUiState();
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
                initCategorySelect();
                buildSidebar();
                restoreUiState();
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
            initCategorySelect();
            buildSidebar();
        } catch(err) {
            alert("Invalid JSON file");
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
            displayName: d.displayName,
            icon: d.icon,
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
        .map((c, i) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`)
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

function renderTreeNode(obj, expandAll = false, highlight = '') {
    const wrapper = document.createElement('div');
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
        
        // Auto-expand if requested or marked
        if(isFolder && (expandAll || item._expanded)) {
            div.classList.add('expanded');
        }

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
            
            label.onclick = () => {
                div.classList.toggle('expanded');
            };
        } else {
            const entry = item._data;
            const iconMarkup = entry.icon
                ? `<img class="node-thumb" src="${escapeAttr(entry.icon)}" alt="">`
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
            childrenDiv.appendChild(renderTreeNode(item._children, expandAll, highlight));
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
    return (DATA.itemNames || {})[itemBaseName(itemId)] || null;
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
        container.insertAdjacentHTML('beforeend', `<div class="search-results-info">Found ${totalCount} result${totalCount === 1 ? '' : 's'} for "${escapeHtml(term)}" (${nameCount} by name, ${itemCount} by item)</div>`);
        container.appendChild(renderTreeNode(searchTree, true, term));
    } else {
        container.innerHTML = '<div style="padding: 20px; color: #666; text-align: center;">No matches found</div>';
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
        .map((p, i) => i === clean.length - 1 ? `<b>${escapeHtml(p)}</b>` : `<span>${escapeHtml(p)}</span>`)
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
    kickerEl.innerText = entry.kind === 'prefab' ? 'Structure' : 'Loot table';

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

    body.innerHTML = wrapSlotRuns(gridHtml);

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

    document.getElementById('stat-chests-label').innerText = `${tierStats.total}x Chest`;

    const statTablesEl = document.getElementById('stat-tables');
    statTablesEl.innerText = tierCount;
    statTablesEl.title = 'Loot table tier breakdown of this prefab' + (tierParts.length ? ': ' + tierParts.join(', ') : '');
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
                <span class="card-meta">${locations.length} Chest${locations.length === 1 ? '' : 's'}</span>
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
        body.innerHTML = wrapSlotRuns(renderLootGrid(def));

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
                badge.textContent = `${shown} / ${slots.length} match`;
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

function renderLootGrid(node, parentChance = 1) {
    if(!node) return `<div style="color:red; padding:10px;">Definition not found</div>`;

    if(node.Container) return renderLootGrid(node.Container, parentChance);

    if(Array.isArray(node)) {
        return node.map(n => renderLootGrid(n, parentChance)).join('');
    }

    let html = '';

    if(node.Type === "Choice") {
        const members = node.Containers || [];
        const sum = members.reduce((s, c) => s + (c.Weight || 0), 0);
        const rolls = (node.RollsMin === undefined && node.RollsMax === undefined)
            ? 1
            : (node.RollsMin + node.RollsMax) / 2;
        const trigger = node.Weight !== undefined ? node.Weight / 100 : 1;

        // A single-member trigger/pick row is indistinguishable in outcome from the
        // item itself - flatten it so users don't wonder where "the selection" is.
        if(members.length === 1) {
            const c = members[0];
            const cond = sum > 0 ? 1 - Math.pow(1 - (c.Weight || 0) / sum, rolls) : 1;
            return renderLootGrid(c, parentChance * trigger * cond);
        }

        const rowLabel = `ROLL (pick ${rolls === 1 ? '1' : `${node.RollsMin}-${node.RollsMax}`})`;
        let badge = '';
        if(node.Weight !== undefined && trigger < 1) {
            badge = ` <span class="row-chance">${formatPct(trigger)}</span>`;
        }

        const selId = `sel-${selectionCounter++}`;
        html += `<div class="logic-row expanded" data-toggle="${selId}">&#9660; ${rowLabel}${badge}</div>`;
        html += `<div class="selection-content" id="${selId}">`;
        html += wrapSlotRuns(members.map(c => {
            const cond = sum > 0
                ? 1 - Math.pow(1 - (c.Weight || 0) / sum, rolls)
                : 1;
            return renderLootGrid(c, parentChance * trigger * cond);
        }).join(''));
        html += `</div>`;
    }
    else if(node.Type === "Multiple") {
        // Every loot table is a bundle of independent rolls; the grouping header is noise,
        // so entries render directly in the card grid.
        if(node.Containers) {
            html += node.Containers.map(c => renderLootGrid(c, parentChance)).join('');
        }
    }
    else if(node.Type === "Droplist") {
        const safeId = node.DroplistId.replace(/[^a-zA-Z0-9]/g, '');
        html += `
            <div class="logic-row droplist-head" data-droplist="${escapeAttr(node.DroplistId)}">
                <span>Included table</span><a class="link">${escapeHtml(node.DroplistId)}</a>
            </div>
            <div class="droplist-content" id="dl-${safeId}">
        `;
        // Auto-expand by rendering immediately
        const def = DATA.loot_table_definitions[node.DroplistId];
        if(def) {
            html += wrapSlotRuns(renderLootGrid(def, parentChance));
        } else {
            html += '<div style="color:red; padding:5px;">Definition not found</div>';
        }
        html += `</div>`;
    }
    else if(node.Type === "Empty") {
        html += `
            <div class="item-slot item-slot-nothing">
                <span class="item-chance">${formatPct(parentChance)}</span>
            </div>
        `;
    }
    else if(node.Type === "Single" && node.Item) {
        const qmin = node.Item.QuantityMin;
        const qmax = node.Item.QuantityMax;
        const qty = (qmax === undefined && qmin === undefined)
                    ? '1'
                    : (qmax === undefined || qmax === qmin)
                        ? String(qmin ?? 1)
                        : `${qmin}-${qmax}`;
        const chanceDisplay = formatPct(parentChance);
        const iconPath = getIconPath(node.Item.ItemId);

        html += `
            <div class="item-slot" data-item-id="${escapeAttr(node.Item.ItemId)}" data-qty="${escapeAttr(String(qty))}" data-chance="${chanceDisplay}">
                <img src="${iconPath}" onerror="trackMissingIcon('${escapeAttr(node.Item.ItemId)}', this)" data-item-id="${escapeAttr(node.Item.ItemId)}">
                <span class="item-qty">${qty}</span>
                <span class="item-chance">${chanceDisplay}</span>
            </div>
        `;
    }

    return html;
}

// Toggle selection visibility
window.toggleSelection = function(selIdOrRow) {
    const header = typeof selIdOrRow === 'string' ? document.getElementById(selIdOrRow).previousElementSibling : selIdOrRow;
    const content = header.nextElementSibling;
    
    if(content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        header.classList.remove('collapsed');
        header.classList.add('expanded');
        // Change to down arrow
        header.innerHTML = header.innerHTML.replace('&#9654;', '&#9660;');
    } else {
        content.classList.add('hidden');
        header.classList.add('collapsed');
        header.classList.remove('expanded');
        // Change to right arrow
        header.innerHTML = header.innerHTML.replace('&#9660;', '&#9654;');
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
        if(!contentDiv.innerHTML) {
            const def = DATA.loot_table_definitions[droplistId];
            if(def) {
                contentDiv.innerHTML = wrapSlotRuns(renderLootGrid(def));
            } else {
                contentDiv.innerHTML = '<div style="color:red; padding:5px;">Definition not found</div>';
            }
        }
    } else {
        contentDiv.classList.add('hidden');
    }
}

// Tooltip Logic
const tooltip = document.createElement('div');
tooltip.className = 'slot-tooltip';
document.body.appendChild(tooltip);

function showTooltip(el, name, qty, chance) {
    const rect = el.getBoundingClientRect();
    tooltip.style.whiteSpace = '';
    tooltip.style.maxWidth = '';
    const dn = itemDisplayName(name);
    let html = '';
    if(dn) html += `<strong>${escapeHtml(dn)}</strong><br>`;
    html += `<strong>${escapeHtml(name)}</strong>`;
    html += `<br>Quantity: ${escapeHtml(String(qty))}`;
    if(chance) html += `<br>Chance: ${escapeHtml(String(chance))}`;
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.bottom + 5) + 'px';
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
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.bottom + 6) + 'px';
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
    fetch('scripts/extract_loot_tables.py')
        .then(response => {
            if(!response.ok) throw new Error(response.status);
            return response.text();
        })
        .then(text => {
            document.getElementById('python-code').firstElementChild.textContent = text;
        })
        .catch(() => {
            document.getElementById('python-code').firstElementChild.textContent =
                'Could not load scripts/extract_loot_tables.py (fetch unavailable when opened via file://). Open the file directly from the repository instead.';
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
        toggleBtn.textContent = 'Hide Source ▲';
    } else {
        codeBlock.classList.add('hidden');
        toggleBtn.textContent = 'Show Full Source ▼';
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
    bindHoverTooltip(matchesOnlyLabel, 'Highlight searched item, and collapse other loot table cards.');
}
initLootContainer();
