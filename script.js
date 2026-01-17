let DATA = null;
let currentItemFilter = '';
let selectionStates = {}; // Track collapsed state of selections

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
            
            // Try to save to localStorage (might fail if too big)
            try {
                localStorage.setItem('last_loaded_file', file.name);
            } catch(e) {}
        } catch(err) {
            alert("Invalid JSON file");
            console.error(err);
        }
    };
    reader.readAsText(file);
}

// --- Sidebar Tree ---
function buildSidebar(prefabs) {
    const root = {};
    
    prefabs.forEach((p, idx) => {
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

    const container = document.getElementById('sidebar-root');
    container.innerHTML = '';
    container.appendChild(renderTreeNode(root));
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
                <span class="node-name">${key}</span>`;
            
            label.onclick = () => {
                div.classList.toggle('expanded');
            };
        } else {
            label.innerHTML = `
                <span class="arrow"></span>
                <span class="node-icon icon-file">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                </span> 
                <span class="node-name">${key}</span>`;
            
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
    const searchInput = document.getElementById('search');
    searchInput.value = '';
    document.getElementById('search-clear').classList.add('hidden');
    buildSidebar(DATA.prefabs);
};

document.getElementById('search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const container = document.getElementById('sidebar-root');
    const clearBtn = document.getElementById('search-clear');
    
    // Show/hide clear button
    if(term) {
        clearBtn.classList.remove('hidden');
    } else {
        clearBtn.classList.add('hidden');
        buildSidebar(DATA.prefabs);
        return;
    }

    // Clear container
    container.innerHTML = '';

    // Helper to build tree from filtered results
    const buildSearchTree = (prefabs) => {
        const root = {};
        prefabs.forEach(p => {
            const pathParts = p.relative_path_from_root.replace(/\\/g, '/').split('/');
            let current = root;
            
            pathParts.forEach((part, i) => {
                if(i === pathParts.length - 1) {
                    current[part] = { _type: 'file', _data: p };
                } else {
                    if(!current[part]) current[part] = { _type: 'folder', _children: {}, _expanded: true }; // Mark as expanded for search
                    current = current[part]._children;
                }
            });
        });
        return root;
    };

    const matchedPrefabs = [];
    const addedPrefabNames = new Set();
    let totalCount = 0;

    // 1. Search by Prefab Name
    DATA.prefabs.forEach(p => {
        if(p.prefab_name.toLowerCase().includes(term)) {
            matchedPrefabs.push(p);
            addedPrefabNames.add(p.prefab_name);
            totalCount++;
        }
    });

    // 2. Search by Item Content
    DATA.prefabs.forEach(prefab => {
        if(addedPrefabNames.has(prefab.prefab_name)) return;

        let hasItem = false;
        prefab.chests.forEach(chest => {
            const lootDef = DATA.loot_table_definitions[chest.loot_table_id];
            if(lootDef && containsItem(lootDef, term)) {
                hasItem = true;
            }
        });
        
        if(hasItem) {
            matchedPrefabs.push(prefab);
            totalCount++;
        }
    });

    if (totalCount > 0) {
        const searchTree = buildSearchTree(matchedPrefabs);
        container.insertAdjacentHTML('beforeend', `<div style="padding: 10px; color: #888; font-size: 11px; border-bottom: 1px solid #333; margin-bottom: 5px;">Found ${totalCount} results for "${term}"</div>`);
        container.appendChild(renderTreeNode(searchTree, true)); // Pass true to expand all
    } else {
        container.innerHTML = '<div style="padding: 20px; color: #666; text-align: center;">No matches found</div>';
    }
});

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
    document.getElementById('stat-chests').innerText = tierStats.total;
    
    // Show tier breakdown
    const tierCount = Object.keys(tierStats.tiers).length;
    const tierBreakdown = Object.entries(tierStats.tiers)
        .sort((a, b) => {
            if(a[0] === 'Other') return 1;
            if(b[0] === 'Other') return -1;
            return a[0].localeCompare(b[0]);
        })
        .map(([tier, count]) => `${tier}: ${count}`)
        .join(' | ');
    
    const statTablesEl = document.getElementById('stat-tables');
    statTablesEl.innerText = `${tierCount} (${tierBreakdown})`;
    statTablesEl.title = 'Loot table tier breakdown';

    const container = document.getElementById('loot-container');
    container.innerHTML = '';
    
    // Reset selection states
    selectionStates = {};

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
        header.innerHTML = `<span class="card-title">${id}</span> <span class="card-meta">${locations.length} Locations</span>`;
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
        
        // Add item search box
        const searchBox = document.createElement('div');
        searchBox.className = 'item-search';
        searchBox.innerHTML = `<input type="text" placeholder="Filter items... (e.g., 'sword', 'ore')" oninput="filterItems(this.value)">`;
        body.appendChild(searchBox);

        // Render Items as Grid
        const grid = document.createElement('div');
        grid.className = 'item-grid';
        grid.innerHTML = renderLootGrid(def);
        body.appendChild(grid);

        card.appendChild(header);
        card.appendChild(body);
        container.appendChild(card);
    });
}

// Filter items in current view
window.filterItems = function(searchTerm) {
    currentItemFilter = searchTerm.toLowerCase();
    const slots = document.querySelectorAll('.item-slot');
    slots.forEach(slot => {
        const itemId = slot.querySelector('img').getAttribute('data-item-id') || '';
        if(!searchTerm || itemId.toLowerCase().includes(currentItemFilter)) {
            slot.style.display = '';
        } else {
            slot.style.display = 'none';
        }
    });
};

// --- Grid Renderer ---
let selectionCounter = 0;

function renderLootGrid(node, totalWeight = 0) {
    if(!node) return `<div style="color:red; padding:10px;">Definition not found</div>`;
    
    if(node.Container) return renderLootGrid(node.Container, totalWeight);
    
    if(Array.isArray(node)) {
        return node.map(n => renderLootGrid(n, 0)).join('');
    }

    let html = '';
    
    if(node.Type === "Choice") {
        let sum = 0;
        if(node.Containers) node.Containers.forEach(c => sum += (c.Weight || 0));
        const range = (node.RollsMin === node.RollsMax) ? node.RollsMin : `${node.RollsMin}-${node.RollsMax}`;
        
        const selId = `sel-${selectionCounter++}`;
        html += `<div class="logic-row expanded" onclick="toggleSelection('${selId}')">&#9660; SELECTION (Pick ${range})</div>`;
        html += `<div class="selection-content" id="${selId}">`;
        if(node.Containers) {
            html += node.Containers.map(c => renderLootGrid(c, sum)).join('');
        }
        html += `</div>`;
    }
    else if(node.Type === "Multiple") {
        const selId = `sel-${selectionCounter++}`;
        html += `<div class="logic-row bundle expanded" onclick="toggleSelection('${selId}')">&#9660; BUNDLE (All)</div>`; 
        html += `<div class="selection-content" id="${selId}">`;
        if(node.Containers) {
            html += node.Containers.map(c => renderLootGrid(c, 0)).join('');
        }
        html += `</div>`;
    }
    else if(node.Type === "Droplist") {
        const safeId = node.DroplistId.replace(/[^a-zA-Z0-9]/g, '');
        html += `
            <div class="logic-row" style="border-color:var(--color-ref); cursor:pointer;" onclick="toggleDroplistGrid(this, '${node.DroplistId}')">
                🔗 Included: ${node.DroplistId}
            </div>
            <div class="droplist-content" id="dl-${safeId}">
        `;
        // Auto-expand by rendering immediately
        const def = DATA.loot_table_definitions[node.DroplistId];
        if(def) {
            html += `<div class="item-grid" style="margin-left:10px; border-left:2px solid #444;">${renderLootGrid(def)}</div>`;
        } else {
            html += '<div style="color:red; padding:5px;">Definition not found</div>';
        }
        html += `</div>`;
    }
    else if(node.Type === "Single" && node.Item) {
        const qty = (node.Item.QuantityMin === node.Item.QuantityMax) 
                    ? node.Item.QuantityMin 
                    : `${node.Item.QuantityMin}-${node.Item.QuantityMax}`;
        
        let chanceDisplay = "";
        if(totalWeight > 0 && node.Weight) {
            const pct = ((node.Weight / totalWeight) * 100).toFixed(1);
            chanceDisplay = `${pct}%`;
        }

        const iconPath = getIconPath(node.Item.ItemId);

        html += `
            <div class="item-slot" title="${node.Item.ItemId} (Qty: ${qty})" onmouseenter="showTooltip(this, '${node.Item.ItemId}', '${qty}', '${chanceDisplay}')" onmouseleave="hideTooltip()">
                <img src="${iconPath}" onerror="trackMissingIcon('${node.Item.ItemId}', this)" data-item-id="${node.Item.ItemId}">
                <span class="item-qty">${qty}</span>
                ${chanceDisplay ? `<span class="item-chance">${chanceDisplay}</span>` : ''}
            </div>
        `;
    }

    return html;
}

// Toggle selection visibility
window.toggleSelection = function(selId) {
    const content = document.getElementById(selId);
    const header = content.previousElementSibling;
    
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
    tooltip.innerHTML = `<strong>${name}</strong><br>Qty: ${qty}<br>${chance ? 'Chance: '+chance : ''}`;
    tooltip.style.display = 'block';
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.bottom + 5) + 'px';
}

function hideTooltip() {
    tooltip.style.display = 'none';
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
