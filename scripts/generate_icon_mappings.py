import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "mapped_prefabs_data.json"
ITEM_PATH = ROOT / "context" / "Item"
ICON_PATH = ROOT / "ItemsGenerated"
OUTPUT_PATH = ROOT / "icon_mappings.js"

ITEM_ALIASES = {
    "Food_Meat_Kebab": "Food_Kebab_Meat",
}


def collect_item_ids(node, found):
    if isinstance(node, dict):
        item_id = node.get("ItemId")
        if isinstance(item_id, str):
            found.add(item_id)
        for value in node.values():
            collect_item_ids(value, found)
    elif isinstance(node, list):
        for value in node:
            collect_item_ids(value, found)


def load_item_icons():
    icons = {}
    for path in ITEM_PATH.rglob("*.json"):
        try:
            with path.open(encoding="utf-8") as handle:
                item = json.load(handle)
        except (OSError, json.JSONDecodeError):
            continue
        icon = item.get("Icon")
        if isinstance(icon, str):
            icons[path.stem] = icon
    return icons


def main():
    with DATA_PATH.open(encoding="utf-8") as handle:
        data = json.load(handle)

    item_ids = set()
    collect_item_ids(data, item_ids)

    item_icons = load_item_icons()
    icon_files = {path.stem.lower(): path.stem for path in ICON_PATH.glob("*.png")}

    mappings = {}
    unresolved = []
    for item_id in sorted(item_ids):
        source_id = ITEM_ALIASES.get(item_id, item_id)
        icon_reference = item_icons.get(source_id)
        if icon_reference is None:
            unresolved.append(f"{item_id}: no Item definition")
            continue

        icon_name = Path(icon_reference).stem
        icon_file = icon_files.get(icon_name.lower())
        if icon_file is None:
            unresolved.append(f"{item_id}: {icon_name}.png not found")
            continue

        if icon_file != item_id:
            mappings[item_id] = icon_file

    lines = ["const ICON_MAPPINGS = {"]
    for item_id, icon_name in sorted(mappings.items()):
        lines.append(f"    '{item_id}': '{icon_name}',")
    lines.extend(
        [
            "};",
            "",
            "function getIconPath(itemId) {",
            "    if (ICON_MAPPINGS[itemId]) {",
            "        return `ItemsGenerated/${ICON_MAPPINGS[itemId]}.png`;",
            "    }",
            "    return `ItemsGenerated/${itemId}.png`;",
            "}",
            "",
        ]
    )
    OUTPUT_PATH.write_text("\n".join(lines), encoding="utf-8")

    print(f"Scanned {len(item_ids)} items; wrote {len(mappings)} mappings to {OUTPUT_PATH.name}")
    for message in unresolved:
        print(f"Unresolved: {message}")


if __name__ == "__main__":
    main()
