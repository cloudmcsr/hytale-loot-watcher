#!/usr/bin/env python3
"""Generate app data for the Loot Viewer.

Merges:
- the prefab extraction (data/mapped_prefabs_data.json)
- the static drop definitions (context/Drops/**)
- mob portraits (ModelsGenerated/**) + item icons (ItemsGenerated/**)
- display names (data/language_files/server.lang: items.*, npcRoles.*)
into a single data.js consumed by the app.

Outputs (Batch E data separation):
data.js - structure only:
window.DEFAULT_DATA = {
  loot_table_definitions: {id -> tree},   (from the prefab extraction)
  prefabs: [ {relative_path_from_root, prefab_name, chests} ],
  drops:   [ {name, path, category, root} ],
}
display_names.js - the single home for display names:
window.DISPLAY_NAMES = {
  items:    {itemId -> display name},   (server.lang items.*)
  npcRoles: {role -> display name},     (server.lang npcRoles.*)
  drops:    {dropName -> display name}, (only when != id fallback)
}
icon_mappings.js - MISMATCH-ONLY (convention: filename == id):
window.ICON_MAPPINGS = {
  items: {itemId -> icon base name},     item slot icons
  drops: {dropName -> icon path or null}, drop subject icons; null = none exists
}
+ getIconPath(itemId) / getDropIcon(name) resolution helpers.
"""
import json
import os
import re

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREFABS_JSON = os.path.join(REPO, 'data', 'mapped_prefabs_data.json')
DROPS_DIR = os.path.join(REPO, 'context', 'Drops')
ITEM_DEFS_DIR = os.path.join(REPO, 'context', 'Item')
NPC_DEFS_DIR = os.path.join(REPO, 'context', 'NPC', 'Roles')
SERVER_LANG = os.path.join(REPO, 'data', 'language_files', 'server.lang')
ITEM_ICONS_DIR = os.path.join(REPO, 'ItemsGenerated')
MOB_ICONS_DIR = os.path.join(REPO, 'ModelsGenerated')
OUT_JS = os.path.join(REPO, 'data.js')
NAMES_OUT_JS = os.path.join(REPO, 'display_names.js')
ICON_OUT_JS = os.path.join(REPO, 'icon_mappings.js')

# item id whose icon def lives under another name (from generate_icon_mappings)
ITEM_ALIASES = {
    'Food_Meat_Kebab': 'Food_Kebab_Meat',
}


def collect_item_ids(node, found):
    """Collect every ItemId in a JSON tree."""
    if isinstance(node, dict):
        item_id = node.get('ItemId')
        if isinstance(item_id, str):
            found.add(item_id)
        for value in node.values():
            collect_item_ids(value, found)
    elif isinstance(node, list):
        for value in node:
            collect_item_ids(value, found)


def build_item_icon_map(item_ids, icons_set, def_icons_raw):
    """Item slot icons, MISMATCH-ONLY.

    Convention: ItemsGenerated/<ItemId>.png. An entry exists only when the
    def's own Icon (no parent chain) resolves to a different png name.
    Mirrors the folded generate_icon_mappings.py algorithm exactly.
    """
    icon_files = {s.lower(): s for s in icons_set}
    mappings = {}
    unresolved = []
    for item_id in sorted(item_ids):
        source_id = ITEM_ALIASES.get(item_id, item_id)
        icon_name = def_icons_raw.get(source_id)
        if icon_name is None:
            unresolved.append(f'{item_id}: no Item definition')
            continue
        found = icon_files.get(icon_name.lower())
        if found is None:
            unresolved.append(f'{item_id}: {icon_name}.png not found')
            continue
        if found != item_id:
            mappings[item_id] = found
    return mappings, unresolved

PREFIX_STRIP = ('Drops_', 'Drop_', 'Container_')
SUFFIX_STRIP = ('_Harvest', '_Block')

# manual NPC portrait aliases (drop name -> ModelsGenerated base), verified by hand
# against ModelsGenerated contents; only used when no role appearance resolves
NPC_PORTRAIT_ALIASES = {
    'Scarak_Fighter_Royal_Guard': 'Scarak_Fighter',
    'Spider_Cave_Spiderling': 'Spider_Cave',
    'Wolf_Outlander_Priest': 'Outlander_Priest',
    'Wolf_Outlander_Sorcerer': 'Outlander_Sorcerer',
    'Wolf_Trork_Hunter': 'Trork_Hunter',
    'Wolf_Trork_Shaman': 'Trork_Shaman',
    'Dungeon_Feastmaster': 'Goblin_Feastmaster',
    'Skeleton_Fighter_Random_Weapon': 'Skeleton_Fighter',
    'Kweebec': 'Kweebec_Sapling',
    'Kweebec_Sapling_Razorleaf': 'Kweebec_Sapling',
    'Kweebec_Sapling_Treesinger': 'Kweebec_Sapling',
    'Chicken_Harvest': 'Chicken',
    'Chicken_Produce': 'Chicken',
    'Cow_Harvest': 'Cow',
    'Mosshorn_Poop': 'Mosshorn',
    'Sheep_Harvest': 'Sheep',
    'Skrill_Harvest': 'Skrill',
    'Wraith_Lantern': 'Wraith',
    'Zombie_Aberrant_Big': 'Zombie_Aberrant',
    'Zombie_Aberrant_Small': 'Zombie_Aberrant',
    'Void_Anomaly_Crystal_Keystone': 'Void_Anomaly_Crystal',
    'Void_Anomaly_Crystal_Large': 'Void_Anomaly_Crystal',
    'Void_Anomaly_Crystal_Medium': 'Void_Anomaly_Crystal',
    'Void_Anomaly_Crystal_Small': 'Void_Anomaly_Crystal',
    'Void_Spawn': 'Spawn_Void',
    'Void_Spawn_Entombed': 'Spawn_Void',
}

# manual subject icons for encounter/cache drops with no defining item def
HAND_ICONS = {
    'Coffer_Goblin_Loot_Wave1': 'Furniture_Goblin_Coffer',
    'Coffer_Goblin_Loot_Wave2': 'Furniture_Goblin_Coffer',
    'Coffer_Goblin_Loot_Wave3': 'Furniture_Goblin_Coffer',
    'Coffer_Goblin_Loot_Wave4': 'Furniture_Goblin_Coffer',
    'Coffer_Goblin_Loot_Wave5': 'Furniture_Goblin_Coffer',
    'Portals_Goblin_Chest_Cache': 'Furniture_Goblin_Chest_Small',
    'Portals_Goblin_Chest_Tier1': 'Furniture_Goblin_Chest_Small',
    'Portals_Goblin_Chest_Tier2': 'Furniture_Goblin_Chest_Small',
    'Portals_Goblin_Chest_Tier3': 'Furniture_Goblin_Chest_Small',
    'Portals_Goblin_Chest_Tier4': 'Furniture_Goblin_Chest_Small',
    'Portals_Goblin_Chest_Tier5': 'Furniture_Goblin_Chest_Small',
    'Portals_Hollows_Ancient_Chest': 'Furniture_Ancient_Chest_Large',
    'Trork_Camp_Chest': 'Furniture_Crude_Chest_Small',
    'Bark': 'Ingredient_Tree_Bark',
    'Wild_Grass_1': 'Ingredient_Fibre',
}

CHEST_TOKEN_ICON = {
    'Goblin': 'Furniture_Goblin_Chest_Small',
    'Ancient': 'Furniture_Ancient_Chest_Large',
    'Temple': 'Furniture_Temple_Light_Chest_Small',
    'Kweebec': 'Furniture_Kweebec_Chest_Small',
    'Feran': 'Furniture_Feran_Chest_Large',
}


def parse_lang(path):
    """Return {keyWithoutDotName: value} for 'X.name = value' lines."""
    names = {}
    with open(path, encoding='utf-8-sig') as fh:
        text = fh.read()
    text = re.sub(r'\\\r?\n', '', text)  # join '\' line continuations
    for line in text.splitlines():
        m = re.match(r'([A-Za-z0-9_.]+)\.name\s*=\s*(.*)$', line)
        if m:
            names[m.group(1)] = m.group(2).strip()
    return names


def build_name_candidates(name):
    nm = name
    for p in PREFIX_STRIP:
        if nm.startswith(p):
            nm = nm[len(p):]
    cands = [name, nm, 'Deco_' + nm, 'Furniture_' + nm]
    for suf in SUFFIX_STRIP:
        for c in list(cands):
            if c.endswith(suf):
                cands.append(c[:-len(suf)])
    # stage numbering variants (Stage1 -> Stage_0, Stage_1 -> Stage_0 below)
    for c in list(cands):
        m = re.match(r'^(.*Stage)(\d)(_.*)?$', c)
        if m:
            cands.append(m.group(1) + '_' + str(int(m.group(2)) - 1) + (m.group(3) or ''))
        m = re.match(r'^(.*?[A-Za-z])_Stage_(\d)(_.*)?$', c)
        if m and int(m.group(2)) > 0:
            cands.append(m.group(1) + '_Stage_' + str(int(m.group(2)) - 1) + (m.group(3) or ''))
    # crop growth stages map to the _Block/_Final icons
    extra = []
    for c in cands:
        s = re.sub(r'(_Stage_?[A-Za-z0-9]+)+$', '', c)
        if s != c:
            extra.append(s)
            extra.append(s + '_Block')
    return cands + extra


def walk_droplists(obj):
    """Yield DropList string values found anywhere in a definition (any nesting)."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == 'DropList':
                if isinstance(v, str) and v:
                    yield v
                elif isinstance(v, list):
                    for s in v:
                        if isinstance(s, str) and s:
                            yield s
            else:
                yield from walk_droplists(v)
    elif isinstance(obj, list):
        for v in obj:
            if isinstance(v, (dict, list)):
                yield from walk_droplists(v)


def scan_item_defs():
    """Index Item definitions: {def -> icon}, {def -> display name}, {dropName -> [def...]}.

    Defs without their own Icon inherit it along the Parent chain (crops etc.).
    """
    raw_icon = {}
    parent = {}
    def_display = {}
    by_droplist = {}
    skipped = 0
    for dp, _, fs in os.walk(ITEM_DEFS_DIR):
        for f in fs:
            if not f.endswith('.json'):
                continue
            full = os.path.join(dp, f)
            try:
                with open(full, encoding='utf-8') as fh:
                    body = json.load(fh)
            except (json.JSONDecodeError, OSError):
                skipped += 1
                continue
            if not isinstance(body, dict):
                skipped += 1
                continue
            def_name = os.path.splitext(f)[0]
            icon = body.get('Icon')
            if isinstance(icon, str) and icon:
                raw_icon[def_name] = icon.split('/')[-1].rsplit('.', 1)[0]
            if isinstance(body.get('Parent'), str) and body['Parent']:
                parent[def_name] = body['Parent']
            tp = (body.get('TranslationProperties') or {}).get('Name')
            if isinstance(tp, str):
                # "server.items.X.name" -> X
                parts = tp.split('.')
                if len(parts) >= 2:
                    key = parts[-2]
                    if key in item_names_lookup:
                        def_display[def_name] = item_names_lookup[key]
            for dl in walk_droplists(body):
                dl_name = dl.split('/')[-1]
                if dl_name.endswith('.json'):
                    dl_name = dl_name[:-5]
                by_droplist.setdefault(dl_name, []).append(def_name)
    # resolve icons along the parent chain (bounded depth)
    def_icon = dict(raw_icon)
    for base in raw_icon.keys() | parent.keys():
        if base in def_icon:
            continue
        cur, depth = base, 0
        while cur is not None and depth < 6:
            cur = parent.get(cur)
            depth += 1
            if cur is not None and cur in raw_icon:
                def_icon[base] = raw_icon[cur]
                break
    if skipped:
        print(f'  (skipped {skipped} unreadable Item JSONs)')
    return def_icon, def_display, by_droplist, raw_icon


def pick_reference_def(refs, drop_name, def_icons, def_display):
    """Choose which referencing Item def represents this drop's subject.

    Not all DropList refs are the subject block - debug spawners etc. also fill
    DropLists. Preference: def named like the drop (candidate chain) > defs with
    an icon + a display name > defs with an icon > others; excludes Debug defs.
    """
    cleaned = sorted({r for r in refs if not r.startswith('Debug') and not r.endswith('_Debug')})
    if not cleaned:
        cleaned = sorted(set(refs))
    cand_set = set(build_name_candidates(drop_name))
    by_name = [r for r in cleaned if r in cand_set]
    pool = by_name or cleaned
    with_both = [r for r in pool if r in def_icons and r in def_display]
    with_icon = [r for r in pool if r in def_icons]
    return (with_both or with_icon or pool)[0]


def scan_npc_defs():
    """Index NPC role definitions (context/NPC/Roles/**).

    Returns:
      role_appear: {role -> Appearance name}  (portrait = ModelsGenerated/<appear>.png)
      role_translation: {role -> npcRoles lang key from NameTranslationKey, if a string}
      role_by_droplist: {DropList value -> role def name}
    """
    role_appear = {}
    role_translation = {}
    role_by_droplist = {}
    for dp, _, fs in os.walk(NPC_DEFS_DIR):
        for f in fs:
            if not f.endswith('.json'):
                continue
            full = os.path.join(dp, f)
            try:
                with open(full, encoding='utf-8') as fh:
                    body = json.load(fh)
            except (json.JSONDecodeError, OSError):
                continue
            if not isinstance(body, dict):
                continue
            role = os.path.splitext(f)[0]
            modify = body.get('Modify') or {}
            ap = modify.get('Appearance')
            if isinstance(ap, str) and ap:
                role_appear[role] = ap
            ntx = modify.get('NameTranslationKey')
            if isinstance(ntx, str) and ntx:
                parts = ntx.split('.')
                if len(parts) >= 2:
                    role_translation[role] = parts[-2]
            for dl in walk_droplists(modify):
                dl_name = dl.split('/')[-1]
                if dl_name.endswith('.json'):
                    dl_name = dl_name[:-5]
                role_by_droplist.setdefault(dl_name, role)
    return role_appear, role_translation, role_by_droplist


def first_content_item(root):
    """First guaranteed Single item id in a drop tree (any nesting)."""
    def walk(node):
        if not isinstance(node, dict):
            return None
        if node.get('Type') == 'Single':
            item = node.get('Item')
            if isinstance(item, dict) and item.get('ItemId'):
                return item['ItemId']
            return None
        for child in node.get('Containers') or []:
            hit = walk(child)
            if hit:
                return hit
        return None
    if isinstance(root, dict):
        return walk(root.get('Container') or root)
    return None


def chest_token_icon(name, icons):
    """Themed chest icon for subjects named *_Chest_* with no defining def."""
    if not re.search(r'_Chest(_|$)|^Chest(_|$)', name):
        return None
    for token, icon in CHEST_TOKEN_ICON.items():
        if token in name:
            return icon if icon in icons else None
    generic = 'Furniture_Crude_Chest_Small'
    return generic if generic in icons else None


def scan_drops(item_names, npc_names, icons, def_icon, def_display, by_droplist,
               portraits, role_appear, role_translation, role_by_droplist):
    drops = []
    for dp, _, fs in os.walk(DROPS_DIR):
        for f in sorted(fs):
            if not f.endswith('.json'):
                continue
            full = os.path.join(dp, f)
            rel_dir = os.path.relpath(dp, DROPS_DIR).replace('\\', '/')
            name = os.path.splitext(f)[0]
            category = rel_dir.split('/')[0] if rel_dir != '.' else name.split('_')[0]

            try:
                with open(full, encoding='utf-8') as fh:
                    body = json.load(fh)
            except (json.JSONDecodeError, OSError) as err:
                print(f'  !! skipping {rel_dir}/{f}: {err}')
                continue
            root = body.get('Container') if isinstance(body, dict) else None

            icon = None
            display = None
            if category == 'NPCs':
                mob = name.replace('Drop_', '', 1) if name.startswith('Drop_') else name
                role = role_by_droplist.get(name) or mob
                # icon: the role's Appearance (or the role name itself) matches a portrait
                icon_pool = [role_appear.get(role), role, mob]
                for cand in icon_pool:
                    if cand and cand in portraits:
                        icon = f'ModelsGenerated/{cand}.png'
                        break
                if icon is None:
                    alias = NPC_PORTRAIT_ALIASES.get(name) or NPC_PORTRAIT_ALIASES.get(mob)
                    if alias and alias in portraits:
                        icon = f'ModelsGenerated/{alias}.png'
                # content icon: guaranteed first item of this mob's drop (arrows, scraps...)
                if icon is None:
                    content = first_content_item(root)
                    if content:
                        content_icon = def_icon.get(content)
                        if content_icon and os.path.exists(os.path.join(ITEM_ICONS_DIR, content_icon + '.png')):
                            icon = f'ItemsGenerated/{content_icon}.png'
                # display: explicit NameTranslationKey, else npcRoles.<role|mob>.name
                lang_role = role_translation.get(role) or role or mob
                if lang_role not in npc_names:
                    lang_role = mob
                display = npc_names.get(lang_role)
            else:
                # 1) definitive link: an Item definition's DropList references this drop
                refs = by_droplist.get(name)
                if refs:
                    ref = pick_reference_def(refs, name, def_icon, def_display)
                    icon_file = def_icon.get(ref)
                    if icon_file and os.path.exists(os.path.join(ITEM_ICONS_DIR, icon_file + '.png')):
                        icon = f'ItemsGenerated/{icon_file}.png'
                    display = def_display.get(ref)
                # 2) manual encounter/cache icon map, then *_Chest_* themed chests
                if icon is None and name in HAND_ICONS and HAND_ICONS[name] in icons:
                    icon = f'ItemsGenerated/{HAND_ICONS[name]}.png'
                if icon is None:
                    themed = chest_token_icon(name, icons)
                    if themed:
                        icon = f'ItemsGenerated/{themed}.png'
                # 3) fallback: heuristic candidate chain
                for cand in build_name_candidates(name):
                    if icon is None and cand in icons:
                        icon = f'ItemsGenerated/{cand}.png'
                    if display is None and cand in item_names:
                        display = item_names[cand]
                # 4) content icon: icon of the first guaranteed item in the drop
                if icon is None:
                    content = first_content_item(root)
                    if content:
                        content_icon = def_icon.get(content)
                        if content_icon and os.path.exists(os.path.join(ITEM_ICONS_DIR, content_icon + '.png')):
                            icon = f'ItemsGenerated/{content_icon}.png'

            drops.append({
                'name': name,
                'path': (rel_dir + '/' + os.path.splitext(f)[0]) if rel_dir != '.' else name,
                'category': category,
                'root': root,
                'icon': icon,
                'displayName': display,
            })
    return drops


def write_display_names_js(item_names, npc_names, drops):
    """display_names.js: every display name the app shows, in one file."""
    drop_names = {}
    for d in sorted(drops, key=lambda x: x['name']):
        if d['displayName'] and d['displayName'] != d['name']:
            drop_names[d['name']] = d['displayName']
    payload = {
        'items': {k: item_names[k] for k in sorted(item_names)},
        'npcRoles': {k: npc_names[k] for k in sorted(npc_names)},
        'drops': drop_names,
    }
    with open(NAMES_OUT_JS, 'w', encoding='utf-8') as fh:
        fh.write('window.DISPLAY_NAMES = ')
        json.dump(payload, fh, separators=(',', ':'), ensure_ascii=False)
        fh.write(';')


def write_icon_mappings_js(item_mismatches, drops):
    """icon_mappings.js: MISMATCH-ONLY icon maps + resolution helpers.

    Sections follow game-asset terminology: `items` for item slot icons,
    `drops` for the icons shown per drop entry.
    """
    drop_icons = {}
    for d in sorted(drops, key=lambda x: x['name']):
        guess = f'ItemsGenerated/{d["name"]}.png'
        if d['icon'] != guess:
            # null entry = generator verified no icon exists for this drop
            drop_icons[d['name']] = d['icon']

    lines = ['window.ICON_MAPPINGS = {']
    lines.append('    items: {')
    for k in sorted(item_mismatches):
        lines.append(f'        {json.dumps(k)}: {json.dumps(item_mismatches[k])},')
    lines.append('    },')
    lines.append('    drops: {')
    for k, v in drop_icons.items():
        val = 'null' if v is None else json.dumps(v)
        lines.append(f'        {json.dumps(k)}: {val},')
    lines.extend([
        '    },',
        '};',
        '',
        'function getIconPath(itemId) {',
        '    // state/quality variants ("*Item_State_Uncommon") share the base item\'s icon',
        "    const s = itemId.replace(/^\\*/, '').replace(/_State_[A-Za-z]+$/, '');",
        '    if(window.ICON_MAPPINGS.items[s]) {',
        '        return `ItemsGenerated/${window.ICON_MAPPINGS.items[s]}.png`;',
        '    }',
        '    return `ItemsGenerated/${s}.png`;',
        '}',
        '',
        'function getDropIcon(name) {',
        '    // null entry = no icon exists for this drop; otherwise try the',
        '    // convention (filename == name) before the known mismatches',
        '    if(Object.prototype.hasOwnProperty.call(window.ICON_MAPPINGS.drops, name)) {',
        '        return window.ICON_MAPPINGS.drops[name];',
        '    }',
        '    return `ItemsGenerated/${name}.png`;',
        '}',
        '',
    ])
    with open(ICON_OUT_JS, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines))


def main():
    global item_names_lookup
    with open(PREFABS_JSON, encoding='utf-8') as fh:
        prefabs_data = json.load(fh)

    print('Parsing language files...')
    lang_names = parse_lang(SERVER_LANG)
    item_names = {k[len('items.'):]: v for k, v in lang_names.items() if k.startswith('items.')}
    npc_names = {k[len('npcRoles.'):]: v for k, v in lang_names.items() if k.startswith('npcRoles.')}
    item_names_lookup = item_names
    print(f'  {len(item_names)} item names, {len(npc_names)} npc role names')

    print('Indexing Item definitions...')
    def_icon, def_display, by_droplist, def_icons_raw = scan_item_defs()
    print(f'  {len(by_droplist)} drops referenced by DropList, {len(def_icon)} def icons')

    print('Indexing NPC role definitions...')
    portraits = {f[:-4] for f in os.listdir(MOB_ICONS_DIR) if f.endswith('.png')}
    role_appear, role_translation, role_by_droplist = scan_npc_defs()
    print(f'  {len(role_appear)} appearances, {len(role_translation)} name keys, '
          f'{len(role_by_droplist)} droplists')

    print('Scanning drops...')
    icons = {f[:-4] for f in os.listdir(ITEM_ICONS_DIR) if f.endswith('.png')}
    drops = scan_drops(item_names, npc_names, icons, def_icon, def_display, by_droplist,
                       portraits, role_appear, role_translation, role_by_droplist)
    print(f'  {len(drops)} drop files scanned')

    # --- Batch E: separate structure data, display names, icon mappings ---
    data = {
        'loot_table_definitions': prefabs_data['loot_table_definitions'],
        'prefabs': prefabs_data['prefabs'],
        'drops': [{k: d[k] for k in ('name', 'path', 'category', 'root')} for d in drops],
    }

    with open(OUT_JS, 'w', encoding='utf-8') as fh:
        fh.write('window.DEFAULT_DATA = ')
        json.dump(data, fh, separators=(',', ':'), ensure_ascii=False)
        fh.write(';')
    size_mb = os.path.getsize(OUT_JS) / 1024 / 1024
    print(f'Wrote {OUT_JS} ({size_mb:.2f} MB)')

    item_ids = set()
    collect_item_ids(prefabs_data['loot_table_definitions'], item_ids)
    for d in drops:
        collect_item_ids(d['root'], item_ids)
    item_mismatches, unresolved = build_item_icon_map(item_ids, icons, def_icons_raw)
    write_icon_mappings_js(item_mismatches, drops)
    drop_icon_entries = sum(
        1 for d in drops
        if d['icon'] is None or d['icon'] != f'ItemsGenerated/{d["name"]}.png'
    )
    print(f'Wrote {ICON_OUT_JS} '
          f'({len(item_mismatches)} item mismatches, {drop_icon_entries} drop entries)')
    for message in unresolved[:8]:
        print(f'  unresolved item icon: {message}')
    if len(unresolved) > 8:
        print(f'  ... and {len(unresolved) - 8} more')

    write_display_names_js(item_names, npc_names, drops)
    print(f'Wrote {NAMES_OUT_JS} ({os.path.getsize(NAMES_OUT_JS) / 1024:.1f} KB)')

    # Audit: entries without icon / display name shown as id-only
    no_icon = {}
    no_name = {}
    for d in drops:
        if not d['root']:
            continue
        if not d['icon']:
            no_icon.setdefault(d['category'], []).append(d['name'])
        if not d['displayName']:
            no_name.setdefault(d['category'], []).append(d['name'])
    print('\nSubjects without icon (id shown unless name exists):')
    for cat in sorted(no_icon):
        print(f'  {cat}: {len(no_icon[cat])} e.g. {no_icon[cat][:3]}')
    print('Subjects without display name (title falls back to id):')
    for cat in sorted(no_name):
        print(f'  {cat}: {len(no_name[cat])} e.g. {no_name[cat][:3]}')


if __name__ == '__main__':
    main()
