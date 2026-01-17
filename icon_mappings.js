const ICON_MAPPINGS = {
    'Armor_Trork_Chest': 'Armor_Trooper_Chest',
    'Armor_Trork_Hands': 'Armor_Iron_Hands',
    'Armor_Trork_Head': 'Armor_Trooper_Head',
    'Armor_Trork_Legs': 'Armor_Trooper_Legs',
    'Food_Kebab_Fruit': 'Food_Skewer_Fruit',
    'Food_Kebab_Meat': 'Food_Skewer_Meat',
    'Food_Kebab_Mushroom': 'Food_Skewer_Mushroom',
    'Food_Kebab_Vegetable': 'Food_Skewer_Vegetable',
    'Food_Vegetable_Cooked': 'Food_Beef_Cooked',
    'Ingredient_Charcoal': 'Rubble_Charcoal_Small',
    'Ingredient_Salt': 'Ingredient_Stick',
    'Plant_Crop_Aubergine_Item': 'Plant_Crop_Aubergine',
    'Plant_Crop_Carrot_Item': 'Plant_Crop_Carrot',
    'Plant_Crop_Cauliflower_Item': 'Plant_Crop_Cauliflower',
    'Plant_Crop_Chilli_Item': 'Plant_Crop_Chilli',
    'Plant_Crop_Corn_Item': 'Plant_Crop_Corn',
    'Plant_Crop_Cotton_Item': 'Plant_Crop_Cotton',
    'Plant_Crop_Lettuce_Item': 'Plant_Crop_Lettuce',
    'Plant_Crop_Onion_Item': 'Plant_Crop_Onion',
    'Plant_Crop_Potato_Item': 'Plant_Crop_Potato',
    'Plant_Crop_Pumpkin_Item': 'Plant_Crop_Pumpkin',
    'Plant_Crop_Rice_Item': 'Plant_Crop_Rice',
    'Plant_Crop_Tomato_Item': 'Plant_Crop_Tomato',
    'Plant_Crop_Turnip_Item': 'Plant_Crop_Turnip',
    'Plant_Crop_Wheat_Item': 'Plant_Crop_Wheat',
    'Potion_Health_Greater': 'Potion_Health_Large',
    'Potion_Health_Lesser': 'Potion_Health_Small',
    'Potion_Stamina_Greater': 'Potion_Stamina_Large',
    'Potion_Stamina_Lesser': 'Potion_Stamina_Small',
    'Weapon_Bomb': 'Weapon_Bow_Flame',
    'Weapon_Crossbow_Ancient_Steel': 'Weapon_Crossbow_Iron',
    'Weapon_Shortbow_Cobalt': 'Weapon_Bow_Cobalt',
    'Weapon_Shortbow_Copper': 'Weapon_Bow_Copper',
    'Weapon_Shortbow_Crude': 'Weapon_Bow_Crude',
    'Weapon_Shortbow_Doomed': 'Weapon_Bow_Doomed',
    'Weapon_Shortbow_Iron': 'Weapon_Bow_Iron',
    'Weapon_Shortbow_Iron_Rusty': 'Weapon_Bow_Iron_Rusty',
    'Weapon_Shortbow_Thorium': 'Weapon_Bow_Thorium',
    'Weapon_Sword_Scrap': 'Weapon_Sword_Iron',
};


function getIconPath(itemId) {
    if (ICON_MAPPINGS[itemId]) {
        return `ItemsGenerated/${ICON_MAPPINGS[itemId]}.png`;
    }
    // Default fallback: try the item ID itself
    return `ItemsGenerated/${itemId}.png`;
}
