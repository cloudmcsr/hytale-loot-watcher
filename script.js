let DATA = null;

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

function renderTreeNode(obj) {
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

        const label = document.createElement('div');
        label.className = 'node-label';
        
        if(isFolder) {
            label.innerHTML = `<span class="arrow">▶</span><span class="node-icon icon-folder">📁</span> ${key}`;
            label.onclick = () => {
                const children = div.querySelector('.node-children');
                const arrow = label.querySelector('.arrow');
                children.classList.toggle('open');
                arrow.style.transform = children.classList.contains('open') ? 'rotate(90deg)' : 'rotate(0deg)';
            };
        } else {
            label.innerHTML = `<span class="arrow"></span><span class="node-icon icon-file">📄</span> ${key}`;
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
            childrenDiv.appendChild(renderTreeNode(item._children));
            div.appendChild(childrenDiv);
        }
        wrapper.appendChild(div);
    });
    return wrapper;
}

// --- Search ---
document.getElementById('search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const container = document.getElementById('sidebar-root');
    if(!term) { buildSidebar(DATA.prefabs); return; }

    container.innerHTML = '';
    DATA.prefabs.forEach(p => {
        if(p.prefab_name.toLowerCase().includes(term)) {
            const div = document.createElement('div');
            div.className = 'node-label';
            div.style.paddingLeft = '15px';
            div.innerHTML = `<span class="node-icon icon-file">📄</span> ${p.prefab_name}`;
            div.onclick = () => {
                document.querySelectorAll('.node-label').forEach(el => el.classList.remove('active'));
                div.classList.add('active');
                loadPrefab(p);
            }
            container.appendChild(div);
        }
    });
});

// --- Main Content View ---
function loadPrefab(prefab) {
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('content-view').classList.remove('hidden');

    document.getElementById('view-title').innerText = prefab.prefab_name;
    document.getElementById('view-path').innerText = prefab.relative_path_from_root;
    document.getElementById('stat-chests').innerText = prefab.total_chests;
    document.getElementById('stat-tables').innerText = Object.keys(prefab.tier_counts).length;

    const container = document.getElementById('loot-container');
    container.innerHTML = '';

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

// --- Grid Renderer ---
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
        
        html += `<div class="logic-row">SELECTION (Pick ${range})</div>`;
        if(node.Containers) {
            html += node.Containers.map(c => renderLootGrid(c, sum)).join('');
        }
    }
    else if(node.Type === "Multiple") {
        html += `<div class="logic-row bundle">BUNDLE (All)</div>`;
        if(node.Containers) {
            html += node.Containers.map(c => renderLootGrid(c, 0)).join('');
        }
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
    // Set fallback placeholder
    imgElement.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgdmlld0JveD0iMCAwIDY0IDY0Ij48cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIGZpbGw9IiMyMjIiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSIgZm9udC1zaXplPSIzMCIgZmlsbD0iIzU1NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+PzwvdGV4dD48L3N2Zz4=';
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

