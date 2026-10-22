using System.Collections.Generic;

namespace ExistingGame.Inventory
{
    public enum ItemCategory
    {
        Weapon,
        Armor,
        Consumable,
        Quest,
    }

    public enum EquipSlot
    {
        None,
        Head,
        Chest,
        Legs,
        Weapon,
        Offhand,
    }

    public enum Rarity
    {
        Common,
        Uncommon,
        Rare,
        Epic,
    }

    /// <summary>What the game knows about an item type. Nothing here refers to any UI.</summary>
    public sealed class ItemDefinition
    {
        public string Id;
        public string Name;
        public ItemCategory Category;
        public EquipSlot EquipSlot = EquipSlot.None;
        public int MaxStack = 1;
        public int RequiredLevel = 1;
        public Rarity Rarity = Rarity.Common;
        public string IconKey;
    }

    /// <summary>The game's item catalogue, as a studio would already have it.</summary>
    public sealed class GameItemDatabase
    {
        readonly Dictionary<string, ItemDefinition> items = new Dictionary<string, ItemDefinition>();

        public void Register(ItemDefinition definition) => items[definition.Id] = definition;

        public ItemDefinition Get(string id) => items.TryGetValue(id, out var definition) ? definition : null;

        public static GameItemDatabase CreateDefault()
        {
            var db = new GameItemDatabase();
            db.Register(new ItemDefinition { Id = "iron-sword", Name = "Iron Sword", Category = ItemCategory.Weapon, EquipSlot = EquipSlot.Weapon, IconKey = "sword" });
            db.Register(new ItemDefinition { Id = "dragon-blade", Name = "Dragon Blade", Category = ItemCategory.Weapon, EquipSlot = EquipSlot.Weapon, RequiredLevel = 10, Rarity = Rarity.Epic, IconKey = "blade" });
            db.Register(new ItemDefinition { Id = "oak-shield", Name = "Oak Shield", Category = ItemCategory.Armor, EquipSlot = EquipSlot.Offhand, IconKey = "shield" });
            db.Register(new ItemDefinition { Id = "steel-helm", Name = "Steel Helm", Category = ItemCategory.Armor, EquipSlot = EquipSlot.Head, Rarity = Rarity.Uncommon, IconKey = "helm" });
            db.Register(new ItemDefinition { Id = "healing-potion", Name = "Healing Potion", Category = ItemCategory.Consumable, MaxStack = 10, IconKey = "potion" });
            db.Register(new ItemDefinition { Id = "trail-bread", Name = "Trail Bread", Category = ItemCategory.Consumable, MaxStack = 20, IconKey = "bread" });
            db.Register(new ItemDefinition { Id = "ancient-key", Name = "Ancient Key", Category = ItemCategory.Quest, Rarity = Rarity.Rare, IconKey = "key" });
            return db;
        }
    }
}
