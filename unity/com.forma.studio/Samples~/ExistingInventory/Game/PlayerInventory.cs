using System;
using System.Collections.Generic;

namespace ExistingGame.Inventory
{
    public sealed class ItemStack
    {
        public ItemDefinition Definition;
        public int Count;
    }

    public readonly struct InventoryResult
    {
        InventoryResult(bool ok, string reason)
        {
            Ok = ok;
            Reason = reason;
        }

        public bool Ok { get; }
        public string Reason { get; }

        public static InventoryResult Success => new InventoryResult(true, null);
        public static InventoryResult Fail(string reason) => new InventoryResult(false, reason);
    }

    /// <summary>The game's own wording for why it said no.</summary>
    public static class InventoryReasons
    {
        public const string EmptySlot = "There is nothing in that slot.";
        public const string WrongCategory = "Items stay in the bag of their own category.";
        public const string QuestItemNoDrop = "Quest items cannot be dropped.";
        public const string NotUsable = "That item cannot be used.";
        public const string NotEquipment = "That item cannot be equipped.";
        public const string WrongEquipSlot = "That item does not fit this equipment slot.";
        public const string LevelTooLow = "Your level is too low for that item.";
        public const string BadSplit = "Choose an amount between 1 and the stack size minus 1.";
        public const string NoFreeSlot = "There is no free slot.";
        public const string UnknownItem = "The game does not know that item.";
    }

    /// <summary>
    /// The game's inventory: one bag of fixed size per category, its own stacking rules and its own
    /// equipment rules. It knows nothing about any UI; observers only listen to <see cref="Changed"/>.
    /// </summary>
    public sealed class PlayerInventory
    {
        public const int SlotsPerCategory = 20;

        readonly GameItemDatabase database;
        readonly Dictionary<ItemCategory, ItemStack[]> bags = new Dictionary<ItemCategory, ItemStack[]>();
        readonly Dictionary<EquipSlot, ItemStack> equipped = new Dictionary<EquipSlot, ItemStack>();

        public PlayerInventory(GameItemDatabase database, int playerLevel = 1)
        {
            this.database = database;
            PlayerLevel = playerLevel;
            foreach (ItemCategory category in Enum.GetValues(typeof(ItemCategory)))
                bags[category] = new ItemStack[SlotsPerCategory];
        }

        public int PlayerLevel { get; set; }

        /// <summary>Raised after any successful change.</summary>
        public event Action Changed;

        public IReadOnlyList<ItemStack> GetSlots(ItemCategory category) => bags[category];

        public ItemStack GetEquipped(EquipSlot slot) => equipped.TryGetValue(slot, out var stack) ? stack : null;

        /// <summary>Adds items to existing stacks first, then to the first free slots of the item's category.</summary>
        public InventoryResult Add(string itemId, int count)
        {
            var definition = database.Get(itemId);
            if (definition == null) return InventoryResult.Fail(InventoryReasons.UnknownItem);
            var bag = bags[definition.Category];
            var remaining = count;
            foreach (var stack in bag)
            {
                if (remaining == 0) break;
                if (stack == null || stack.Definition != definition || stack.Count >= definition.MaxStack) continue;
                var taken = Math.Min(remaining, definition.MaxStack - stack.Count);
                stack.Count += taken;
                remaining -= taken;
            }
            for (var i = 0; i < bag.Length && remaining > 0; i++)
            {
                if (bag[i] != null) continue;
                var taken = Math.Min(remaining, definition.MaxStack);
                bag[i] = new ItemStack { Definition = definition, Count = taken };
                remaining -= taken;
            }
            Changed?.Invoke();
            return remaining == 0 ? InventoryResult.Success : InventoryResult.Fail(InventoryReasons.NoFreeSlot);
        }

        /// <summary>Moves a stack to another slot of the same bag: into an empty slot, merged up to the item's max stack, or swapped.</summary>
        public InventoryResult Move(ItemCategory fromCategory, int from, ItemCategory toCategory, int to)
        {
            var source = StackAt(fromCategory, from);
            if (source == null) return InventoryResult.Fail(InventoryReasons.EmptySlot);
            if (fromCategory != toCategory) return InventoryResult.Fail(InventoryReasons.WrongCategory);
            if (to < 0 || to >= SlotsPerCategory) return InventoryResult.Fail(InventoryReasons.EmptySlot);
            if (from == to) return InventoryResult.Success;

            var bag = bags[toCategory];
            var target = bag[to];
            if (target == null)
            {
                bag[to] = source;
                bag[from] = null;
            }
            else if (target.Definition == source.Definition && target.Count < target.Definition.MaxStack)
            {
                var moved = Math.Min(source.Count, target.Definition.MaxStack - target.Count);
                target.Count += moved;
                source.Count -= moved;
                if (source.Count == 0) bag[from] = null;
            }
            else
            {
                bag[to] = source;
                bag[from] = target;
            }
            Changed?.Invoke();
            return InventoryResult.Success;
        }

        public InventoryResult Use(ItemCategory category, int index)
        {
            var stack = StackAt(category, index);
            if (stack == null) return InventoryResult.Fail(InventoryReasons.EmptySlot);
            if (stack.Definition.Category != ItemCategory.Consumable) return InventoryResult.Fail(InventoryReasons.NotUsable);
            Consume(category, index, 1);
            Changed?.Invoke();
            return InventoryResult.Success;
        }

        public InventoryResult Drop(ItemCategory category, int index)
        {
            var stack = StackAt(category, index);
            if (stack == null) return InventoryResult.Fail(InventoryReasons.EmptySlot);
            if (stack.Definition.Category == ItemCategory.Quest) return InventoryResult.Fail(InventoryReasons.QuestItemNoDrop);
            bags[category][index] = null;
            Changed?.Invoke();
            return InventoryResult.Success;
        }

        public InventoryResult Split(ItemCategory category, int index, int amount)
        {
            var stack = StackAt(category, index);
            if (stack == null) return InventoryResult.Fail(InventoryReasons.EmptySlot);
            if (amount < 1 || amount >= stack.Count) return InventoryResult.Fail(InventoryReasons.BadSplit);
            var bag = bags[category];
            var free = Array.IndexOf(bag, null);
            if (free < 0) return InventoryResult.Fail(InventoryReasons.NoFreeSlot);
            stack.Count -= amount;
            bag[free] = new ItemStack { Definition = stack.Definition, Count = amount };
            Changed?.Invoke();
            return InventoryResult.Success;
        }

        /// <summary>Equips the stack at a bag slot; whatever was equipped there goes back to the slot it came from (or the first free slot of its own bag).</summary>
        public InventoryResult Equip(ItemCategory category, int index, EquipSlot slot)
        {
            var stack = StackAt(category, index);
            if (stack == null) return InventoryResult.Fail(InventoryReasons.EmptySlot);
            var definition = stack.Definition;
            if (definition.EquipSlot == EquipSlot.None) return InventoryResult.Fail(InventoryReasons.NotEquipment);
            if (definition.EquipSlot != slot) return InventoryResult.Fail(InventoryReasons.WrongEquipSlot);
            if (definition.RequiredLevel > PlayerLevel) return InventoryResult.Fail(InventoryReasons.LevelTooLow);

            var previous = GetEquipped(slot);
            if (previous != null && previous.Definition.Category != category)
            {
                var free = Array.IndexOf(bags[previous.Definition.Category], null);
                if (free < 0) return InventoryResult.Fail(InventoryReasons.NoFreeSlot);
                bags[previous.Definition.Category][free] = previous;
                previous = null;
            }
            bags[category][index] = previous;
            equipped[slot] = stack;
            Changed?.Invoke();
            return InventoryResult.Success;
        }

        ItemStack StackAt(ItemCategory category, int index) =>
            index >= 0 && index < SlotsPerCategory ? bags[category][index] : null;

        void Consume(ItemCategory category, int index, int amount)
        {
            var stack = bags[category][index];
            stack.Count -= amount;
            if (stack.Count <= 0) bags[category][index] = null;
        }
    }
}
