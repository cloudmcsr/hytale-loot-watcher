let DATA = null;
let searchTerm = '';
let matchesOnly = false;

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
        buildSidebar(DATA.prefabs);
    } else {
        // Fallback to fetch if data.js missing/empty
        fetch('mapped_prefabs_data.json')
            .then(response => {
                if(response.ok) return response.json();
                throw new Error('Default file not found');
            })
            .then(json => {
                DATA = json;
                document.getElementById('upload-overlay').classList.add('hidden');
                buildSidebar(DATA.prefabs);
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
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.classList.add('hidden'), 300);
            buildSidebar(DATA.prefabs);
        } catch(err) {
            alert("Invalid JSON file");
            console.error(err);
        }
    };
    reader.readAsText(file);
}

// --- Sidebar Tree ---
function buildTree(prefabs) {
    const root = {};
    prefabs.forEach(p => {
        const pathParts = p.relative_path_from_root.replace(/\\/g, '/').split('/');
        let current = root;
        pathParts.forEach((part, i) => {
            if(i === pathParts.length - 1) {
                current[part] = { _type: 'file', _data: p };
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

function buildSidebar(prefabs) {
    const container = document.getElementById('sidebar-root');
    container.innerHTML = '';
    container.appendChild(renderTreeNode(buildTree(prefabs)));
}

function renderTreeNode(obj, expandAll = false) {
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
                <span class="node-name">${escapeHtml(key)} ${item._count ? `<span style="color:#666; font-size:11px; margin-left:4px;">(${item._count})</span>` : ''}</span>`;
            
            label.onclick = () => {
                div.classList.toggle('expanded');
            };
        } else {
            label.innerHTML = `
                <span class="arrow"></span>
                <span class="node-icon icon-file">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                </span> 
                <span class="node-name">${escapeHtml(key)}</span>`;
            
            label.onclick = () => {
                document.querySelectorAll('.node-label').forEach(el => el.classList.remove('active'));
                label.classList.add('active');
                loadPrefab(item._data);
            }
        }

        div.appendChild(label);
        if(isFolder) {
            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'node-children';
            childrenDiv.appendChild(renderTreeNode(item._children, expandAll));
            div.appendChild(childrenDiv);
        }
        wrapper.appendChild(div);
    });
    return wrapper;
}

// --- Smart Search (auto-detects prefab vs item search) ---
window.clearSearch = function() {
    document.getElementById('search').value = '';
    searchTerm = '';
    document.getElementById('search-clear').classList.add('hidden');
    buildSidebar(DATA.prefabs);
    applyFilter();
};

let searchTimer = null;
document.getElementById('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(e.target.value), 150);
});

function runSearch(rawValue) {
    const term = rawValue.toLowerCase().trim();
    const container = document.getElementById('sidebar-root');
    const clearBtn = document.getElementById('search-clear');
    searchTerm = term;

    if(term) {
        clearBtn.classList.remove('hidden');
    } else {
        clearBtn.classList.add('hidden');
        buildSidebar(DATA.prefabs);
        applyFilter();
        return;
    }

    const matchedPrefabs = [];
    const addedPrefabNames = new Set();
    let totalCount = 0;

    DATA.prefabs.forEach(p => {
        if(p.prefab_name.toLowerCase().includes(term)) {
            matchedPrefabs.push(p);
            addedPrefabNames.add(p.prefab_name);
            totalCount++;
        }
    });

    DATA.prefabs.forEach(prefab => {
        if(addedPrefabNames.has(prefab.prefab_name)) return;
        const hasItem = prefab.chests.some(chest => {
            const lootDef = DATA.loot_table_definitions[chest.loot_table_id];
            return lootDef && containsItem(lootDef, term);
        });
        if(hasItem) {
            matchedPrefabs.push(prefab);
            totalCount++;
        }
    });

    container.innerHTML = '';

    if(totalCount > 0) {
        const searchTree = buildTree(matchedPrefabs);
        countTree(searchTree);
        container.insertAdjacentHTML('beforeend', `<div style="padding: 10px; color: #888; font-size: 11px; border-bottom: 1px solid #333; margin-bottom: 5px;">Found ${totalCount} results for "${escapeHtml(term)}"</div>`);
        container.appendChild(renderTreeNode(searchTree, false));
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
        return node.Item.ItemId.toLowerCase().includes(itemName);
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

// --- Main Content View ---
function loadPrefab(prefab) {
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('content-view').classList.remove('hidden');

    document.getElementById('view-title').innerText = prefab.prefab_name;
    document.getElementById('view-path').innerText = prefab.relative_path_from_root;
    
    // Calculate and display tier stats
    const tierStats = calculateTierStats(prefab.chests);
    document.getElementById('stat-chests').innerText = `${tierStats.total}x Chest`;

    // Show tier breakdown
    const tierCount = Object.keys(tierStats.tiers).length;
    const tierParts = Object.entries(tierStats.tiers)
        .sort((a, b) => {
            if(a[0] === 'Other') return 1;
            if(b[0] === 'Other') return -1;
            return a[0].localeCompare(b[0], undefined, { numeric: true });
        })
        .map(([tier, count]) => `${count}x ${tier}`);

    const statTablesEl = document.getElementById('stat-tables');
    statTablesEl.innerText = `${tierCount}x Loot Table${tierCount === 1 ? '' : 's'}${tierParts.length ? ' / ' + tierParts.join(' \u00B7 ') : ''}`;
    statTablesEl.title = 'Loot table tier breakdown of this prefab';

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
        header.innerHTML = `<span class="card-title">${escapeHtml(id)}</span>
            <span class="card-meta-group">
                <span class="card-meta card-meta-items hidden"></span>
                <span class="card-meta">${locations.length} Chest${locations.length === 1 ? '' : 's'}</span>
            </span>`;
        header.onclick = () => {
           const body = card.querySelector('.card-body');
           body.classList.toggle('hidden');
        };

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
        const grid = document.createElement('div');
        grid.className = 'item-grid';
        grid.innerHTML = renderLootGrid(def);
        body.appendChild(grid);

        card.appendChild(header);
        card.appendChild(body);
        container.appendChild(card);
    });

    applyFilter();
}

// --- "Matches only" filtering ---
// Dim non-matching items in the loaded prefab when the toggle is ON and a search term exists.
function applyFilter() {
    const active = matchesOnly && searchTerm;
    document.querySelectorAll('.item-slot[data-item-id]').forEach(slot => {
        const itemId = (slot.dataset.itemId || '').toLowerCase();
        const match = itemId.includes(searchTerm);
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
        const body = card.querySelector('.card-body');
        if(body && active) {
            body.classList.toggle('hidden', shown === 0);
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
        const rows = rolls === 1 ? '1' : `${node.RollsMin}-${node.RollsMax}`;
        const rowLabel = node.Weight !== undefined
            ? `SELECTION (Roll ${rows}) <span class="row-chance">${formatPct(trigger)}</span>`
            : `SELECTION (Roll ${rows})`;

        const selId = `sel-${selectionCounter++}`;
        html += `<div class="logic-row expanded" data-toggle="${selId}">&#9660; ${rowLabel}</div>`;
        html += `<div class="selection-content" id="${selId}">`;
        html += members.map(c => {
            const cond = sum > 0
                ? 1 - Math.pow(1 - (c.Weight || 0) / sum, rolls)
                : 1;
            return renderLootGrid(c, parentChance * trigger * cond);
        }).join('');
        html += `</div>`;
    }
    else if(node.Type === "Multiple") {
        const selId = `sel-${selectionCounter++}`;
        html += `<div class="logic-row bundle expanded" data-toggle="${selId}">&#9660; BUNDLE (All)</div>`;
        html += `<div class="selection-content" id="${selId}">`;
        if(node.Containers) {
            html += node.Containers.map(c => renderLootGrid(c, parentChance)).join('');
        }
        html += `</div>`;
    }
    else if(node.Type === "Droplist") {
        const safeId = node.DroplistId.replace(/[^a-zA-Z0-9]/g, '');
        html += `
            <div class="logic-row" style="border-color:var(--color-ref); cursor:pointer;" data-droplist="${escapeAttr(node.DroplistId)}">
                &#128279; Included: ${escapeHtml(node.DroplistId)}
            </div>
            <div class="droplist-content" id="dl-${safeId}">
        `;
        // Auto-expand by rendering immediately
        const def = DATA.loot_table_definitions[node.DroplistId];
        if(def) {
            html += `<div class="item-grid" style="margin-left:10px; border-left:2px solid #444;">${renderLootGrid(def, parentChance)}</div>`;
        } else {
            html += '<div style="color:red; padding:5px;">Definition not found</div>';
        }
        html += `</div>`;
    }
    else if(node.Type === "Empty") {
        html += `
            <div class="item-slot item-slot-nothing" title="Nothing (no item from this pick chance)">
                <span class="item-chance">${formatPct(parentChance)}</span>
            </div>
        `;
    }
    else if(node.Type === "Single" && node.Item) {
        const qty = (node.Item.QuantityMin === node.Item.QuantityMax)
                    ? node.Item.QuantityMin
                    : `${node.Item.QuantityMin}-${node.Item.QuantityMax}`;
        const chanceDisplay = formatPct(parentChance);
        const iconPath = getIconPath(node.Item.ItemId);

        html += `
            <div class="item-slot" data-item-id="${escapeAttr(node.Item.ItemId)}" data-qty="${escapeAttr(String(qty))}" data-chance="${chanceDisplay}" title="${escapeAttr(`${node.Item.ItemId} (Quantity: ${qty})`)}">
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
                contentDiv.innerHTML = `<div class="item-grid" style="margin-left:10px; border-left:2px solid #444;">${renderLootGrid(def)}</div>`;
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
    tooltip.innerHTML = `<strong>${escapeHtml(name)}</strong><br>Quantity: ${escapeHtml(String(qty))}<br>${chance ? 'Chance: '+escapeHtml(String(chance)) : ''}`;
    tooltip.style.display = 'block';
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.bottom + 5) + 'px';
}

function hideTooltip() {
    tooltip.style.display = 'none';
}

// Custom hover tooltip for chrome elements (native title tooltips get ignored).
// Wraps text; resets to nowrap for slot tooltips handled by showTooltip().
function bindHoverTooltip(el, text) {
    el.addEventListener('mouseenter', () => {
        const rect = el.getBoundingClientRect();
        tooltip.style.whiteSpace = 'normal';
        tooltip.style.maxWidth = '280px';
        tooltip.innerHTML = escapeHtml(text);
        tooltip.style.display = 'block';
        tooltip.style.left = rect.left + 'px';
        tooltip.style.top = (rect.bottom + 6) + 'px';
    });
    el.addEventListener('mouseleave', hideTooltip);
}

// Missing Icon Tracker
const missingIcons = new Set();

function trackMissingIcon(itemId, imgElement) {
    missingIcons.add(itemId);
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
window.openHelp = function() {
    document.getElementById('help-modal').classList.remove('hidden');
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
    });
}

const matchesOnlyLabel = document.querySelector('.filter-toggle');
if(matchesOnlyLabel) {
    bindHoverTooltip(matchesOnlyLabel, 'Highlight searched item, and collapse other loot table cards.');
}
initLootContainer();
