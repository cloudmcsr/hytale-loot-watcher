import json
import os
import difflib

# Load loot data
with open('mapped_prefabs_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Extract all ItemIds
item_ids = set()
def extract_ids(node):
    if isinstance(node, dict):
        if 'ItemId' in node:
            item_ids.add(node['ItemId'])
        for key, value in node.items():
            extract_ids(value)
    elif isinstance(node, list):
        for item in node:
            extract_ids(item)

extract_ids(data)

# Load icon files
icon_files = os.listdir('ItemsGenerated')
icon_map = {f.lower().replace('.png', ''): f for f in icon_files}

mappings = {}
missing = []

# Manual overrides based on user feedback and common patterns
manual_map = {
    'Food_Kebab': 'Food_Skewer',
    'Shortbow': 'Bow',
    'Ingredient_Charcoal': 'Rubble_Charcoal_Small',
    'Potion_Health_Lesser': 'Potion_Health_Small',
    'Potion_Stamina_Lesser': 'Potion_Stamina_Small',
    'Potion_Mana_Lesser': 'Potion_Mana_Small',
}

for item_id in sorted(item_ids):
    # 1. Exact match (case insensitive)
    if item_id.lower() in icon_map:
        # If exact match (ignoring case), we don't strictly need a mapping if the system handles it,
        # but let's be explicit if the case differs.
        real_name = icon_map[item_id.lower()]
        if real_name != item_id + '.png':
             mappings[item_id] = real_name.replace('.png', '')
        continue

    # 2. Try manual replacements
    candidate = item_id
    for k, v in manual_map.items():
        candidate = candidate.replace(k, v)
    
    if candidate.lower() in icon_map:
        mappings[item_id] = icon_map[candidate.lower()].replace('.png', '')
        continue

    # 3. Fuzzy match / Substring search
    # Find closest match in icon_files
    
    # Try stripping "_Item" suffix
    if item_id.endswith('_Item'):
        stripped = item_id[:-5]
        if stripped.lower() in icon_map:
            mappings[item_id] = icon_map[stripped.lower()].replace('.png', '')
            continue

    # Filter icons that share the same prefix (e.g. "Weapon_", "Food_")
    prefix = item_id.split('_')[0]
    candidates = [f for f in icon_files if f.startswith(prefix)]
    if not candidates:
        candidates = icon_files

    matches = difflib.get_close_matches(item_id, candidates, n=1, cutoff=0.6)
    if matches:
        mappings[item_id] = matches[0].replace('.png', '')
    else:
        missing.append(item_id)

# Generate JS file
js_content = "const ICON_MAPPINGS = {\n"
for k, v in sorted(mappings.items()):
    js_content += f"    '{k}': '{v}',\n"
js_content += "};\n\n"
js_content += """
function getIconPath(itemId) {
    if (ICON_MAPPINGS[itemId]) {
        return `ItemsGenerated/${ICON_MAPPINGS[itemId]}.png`;
    }
    // Default fallback: try the item ID itself
    return `ItemsGenerated/${itemId}.png`;
}
"""

with open('icon_mappings.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print(f"Generated mappings for {len(mappings)} items.")
print(f"Missing items: {len(missing)}")
for m in missing:
    print(f"Missing: {m}")
