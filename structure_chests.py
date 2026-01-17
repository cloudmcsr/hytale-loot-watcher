import json
from pathlib import Path

# Configuration - paths relative to script location
DROP_TABLES_DIR = Path("./Drops/Prefabs")
PREFABS_ROOT_DIR = Path("./Prefabs")
OUTPUT_FILE = "mapped_prefabs_data.json"

def load_loot_tables(directory):
    """Load all loot table JSON files."""
    loot_map = {}
    if not directory.exists():
        print(f"Error: {directory} not found")
        print("Extract 'Drops\\Prefabs' from Hytale/Install/package/latest/Assets.zip > Assets/Server/")
        return loot_map
    
    for file_path in directory.rglob("*.json"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                loot_map[file_path.stem] = json.load(f)
        except Exception as e:
            print(f"Error loading {file_path.name}: {e}")
    return loot_map

def process_prefabs(prefabs_dir, loot_tables):
    """Process all prefab files and extract chest data."""
    results = []
    used_loot_ids = set()
    
    if not prefabs_dir.exists():
        print(f"Error: {prefabs_dir} not found")
        print("Extract 'Prefabs' from Hytale/Install/package/latest/Assets.zip > Assets/Server/")
        return results, used_loot_ids
    
    for file_path in prefabs_dir.rglob("*.json"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except:
            continue
        
        blocks = data.get("blocks")
        if not isinstance(blocks, list):
            continue
        
        rel_path = file_path.relative_to(prefabs_dir)
        prefab_info = {
            "structure_name": rel_path.parts[0] if len(rel_path.parts) > 1 else "Root",
            "prefab_name": file_path.name,
            "relative_path_from_root": str(rel_path),
            "total_chests": 0,
            "chests": []
        }
        
        for block in blocks:
            if block.get("name") == "Block_Spawner_Block":
                components = block.get("components", {}).get("Components", {})
                tier_id = components.get("BlockSpawner", {}).get("BlockSpawnerId")
                
                if tier_id:
                    used_loot_ids.add(tier_id)
                    prefab_info["chests"].append({
                        "location": {"x": block["x"], "y": block["y"], "z": block["z"]},
                        "loot_table_id": tier_id
                    })
                    prefab_info["total_chests"] += 1
        
        if prefab_info["total_chests"] > 0:
            results.append(prefab_info)
    
    return results, used_loot_ids

def main():
    print("=" * 50)
    print("Hytale Loot Table Extractor")
    print("=" * 50)
    print()
    print("Setup Instructions:")
    print("1. Locate: ...\\Hytale\\Install\\package\\latest\\Assets.zip")
    print("2. Extract from Assets.zip > Assets/Server:")
    print("   - Drops\\Prefabs")
    print("   - Prefabs")
    print("3. Place extracted folders in same directory as this script")
    print()
    print("-" * 50)
    print(f"Looking for: {DROP_TABLES_DIR} and {PREFABS_ROOT_DIR}")
    print()
    
    all_loot_tables = load_loot_tables(DROP_TABLES_DIR)
    if not all_loot_tables:
        return
    print(f"✓ Loaded {len(all_loot_tables)} loot tables")
    
    prefabs_data, used_loot_ids = process_prefabs(PREFABS_ROOT_DIR, all_loot_tables)
    if not prefabs_data:
        return
    print(f"✓ Processed {len(prefabs_data)} prefabs with chests")
    
    filtered_definitions = {
        tid: all_loot_tables[tid] for tid in used_loot_ids if tid in all_loot_tables
    }
    
    output = {
        "loot_table_definitions": filtered_definitions,
        "prefabs": prefabs_data
    }
    
    print(f"✓ Writing to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)
    
    print()
    print("=" * 50)
    print(f"SUCCESS! Generated {OUTPUT_FILE}")
    print(f"  - {len(prefabs_data)} structures")
    print(f"  - {len(filtered_definitions)} loot tables")
    print("=" * 50)

if __name__ == "__main__":
    main()