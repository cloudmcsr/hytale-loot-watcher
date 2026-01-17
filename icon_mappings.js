// Icon name mappings - translates loot table item IDs to actual icon filenames
const ICON_MAPPINGS = {
    // Kebab -> Skewer
    'Food_Kebab_Fruit': 'Food_Skewer_Fruit',
    'Food_Kebab_Meat': 'Food_Skewer_Meat',
    'Food_Kebab_Mushroom': 'Food_Skewer_Mushroom',
    'Food_Kebab_Vegetable': 'Food_Skewer_Vegetable',
    
    // Shortbow -> Bow
    'Weapon_Shortbow_Crude': 'Weapon_Bow_Crude',
    'Weapon_Shortbow_Copper': 'Weapon_Bow_Copper',
    
    // Potion variants
    'Potion_Health_Lesser': 'Potion_Health_Small',
    'Potion_Stamina_Lesser': 'Potion_Stamina_Small',
    
    // Cooked food
    'Food_Vegetable_Cooked': 'Food_Skewer_Vegetable',
    
    // Materials
    'Ingredient_Charcoal': 'Rubble_Charcoal_Small',
    
    // Weapons - using closest equivalents
    'Weapon_Bomb': 'Weapon_Bomb_Fire_Goblin',
    'Weapon_Sword_Scrap': 'Weapon_Sword_Scrap_Goblin'
};

// Helper function to get correct icon path
function getIconPath(itemId) {
    const mappedId = ICON_MAPPINGS[itemId] || itemId;
    return `ItemsGenerated/${mappedId}.png`;
}
