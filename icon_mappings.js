const ICON_MAPPINGS = {
    'Armor_Trork_Chest': 'Armor_Trork_Warrior_Chest',
    'Armor_Trork_Hands': 'Armor_Trork_Warrior_Hands',
    'Armor_Trork_Head': 'Armor_Trork_Warrior_Head',
    'Armor_Trork_Legs': 'Armor_Trork_Warrior_Legs',
    'Food_Kebab_Fruit': 'Food_Skewer_Fruit',
    'Food_Kebab_Meat': 'Food_Skewer_Meat',
    'Food_Kebab_Vegetable': 'Food_Skewer_Vegetable',
    'Food_Meat_Kebab': 'Food_Skewer_Meat',
    'Food_Vegetable_Cooked': 'Food_Roasted_Corn',
    'Ingredient_Charcoal': 'Rubble_Charcoal_Small',
    'Ingredient_Salt': 'Food_Salt',
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
    'Potion_Antidote': 'Weapon_Bomb_Potion_Poison',
    'Recipe_Goblin_Painting_Fail_Replica': 'Recipe_Page',
    'Recipe_Goblin_Painting_ForgottenTemple_Replica': 'Recipe_Page',
    'Recipe_Goblin_Painting_Orbis_Replica': 'Recipe_Page',
    'Recipe_Goblin_Painting_Portal_Replica': 'Recipe_Page',
    'Recipe_Goblin_Painting_Repair_Replica': 'Recipe_Page',
    'Weapon_Bomb': 'Weapon_Bomb_Fire_Goblin',
    'Weapon_Crossbow_Ancient_Steel': 'Weapon_Crossbow_Iron_Rusty',
    'Weapon_Shortbow_Cobalt': 'Weapon_Bow_Cobalt',
    'Weapon_Shortbow_Copper': 'Weapon_Bow_Copper',
    'Weapon_Shortbow_Crude': 'Weapon_Bow_Crude',
    'Weapon_Shortbow_Doomed': 'Weapon_Bow_Doomed',
    'Weapon_Shortbow_Iron': 'Weapon_Bow_Iron',
    'Weapon_Shortbow_Iron_Rusty': 'Weapon_Bow_Iron_Rusty',
    'Weapon_Shortbow_Thorium': 'Weapon_Bow_Thorium',
};

function getIconPath(itemId) {
    // state/quality variants ("*Item_State_Uncommon") share the base item's icon
    const s = itemId.replace(/^\*/, '').replace(/_State_[A-Za-z]+$/, '');
    if (ICON_MAPPINGS[s]) {
        return `ItemsGenerated/${ICON_MAPPINGS[s]}.png`;
    }
    return `ItemsGenerated/${s}.png`;
}
