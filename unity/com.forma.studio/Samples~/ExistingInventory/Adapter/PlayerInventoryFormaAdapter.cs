using System;
using System.Collections.Generic;
using ExistingGame.Inventory;
using Forma.Studio;
using UnityEngine;

namespace ExistingGame.FormaAdapter
{
    /// <summary>
    /// The only Forma-aware code of the sample: it shows <see cref="PlayerInventory"/> on a Forma screen and
    /// forwards the player's intents to it. Every rule (what can be dropped, stacked, equipped) stays in the game;
    /// the adapter only translates names, slot ids and results. Put it on the same GameObject as <see cref="FormaScreen"/>
    /// and call <see cref="Bind"/> with the game's inventory.
    /// </summary>
    [AddComponentMenu("Forma Samples/Player Inventory Forma Adapter")]
    public sealed class PlayerInventoryFormaAdapter : MonoBehaviour, IFormaDataSource, IFormaIntentHandler
    {
        /// <summary>The data source id the design binds to (<c>dataSourceId</c> in the bundle).</summary>
        public const string DataSourceId = "inventory.items";

        // The design filters its tabs by these category labels (the library's inventory tabs); the fourth tab,
        // "Materiales", is where this game keeps its quest items.
        static readonly Dictionary<ItemCategory, string> CategoryLabels = new Dictionary<ItemCategory, string>
        {
            [ItemCategory.Weapon] = "Armas",
            [ItemCategory.Armor] = "Armaduras",
            [ItemCategory.Consumable] = "Consumibles",
            [ItemCategory.Quest] = "Materiales",
        };

        [SerializeField] bool logIntents;

        PlayerInventory inventory;
        FormaScreen screen;

        public string Id => DataSourceId;

        public event Action Changed;

        public void Bind(PlayerInventory value)
        {
            if (inventory != null) inventory.Changed -= RaiseChanged;
            inventory = value;
            if (inventory != null) inventory.Changed += RaiseChanged;
            RaiseChanged();
        }

        void OnDestroy()
        {
            if (inventory != null) inventory.Changed -= RaiseChanged;
        }

        void RaiseChanged() => Changed?.Invoke();

        // ---- what the game shows ----

        public IReadOnlyList<FormaRecord> GetView(FormaBinding view)
        {
            var result = new List<FormaRecord>();
            if (inventory == null || !TryCategoryOf(view.filters, out var category)) return result;
            foreach (var stack in inventory.GetSlots(category)) result.Add(ToRecord(stack));
            return result;
        }

        public FormaRecord GetEquipped(string equipmentSlotId) =>
            inventory != null && TryEquipSlotOf(equipmentSlotId, out var slot) ? ToRecord(inventory.GetEquipped(slot)) : null;

        static FormaRecord ToRecord(ItemStack stack)
        {
            if (stack == null) return null;
            var definition = stack.Definition;
            return new FormaRecord(definition.Id, new Dictionary<string, object>
            {
                ["id"] = definition.Id,
                ["name"] = definition.Name,
                ["icon"] = definition.IconKey,
                ["quantity"] = (double)stack.Count,
                ["maxStack"] = (double)definition.MaxStack,
                ["category"] = CategoryLabels[definition.Category],
                ["slotType"] = definition.EquipSlot == EquipSlot.None ? "none" : definition.EquipSlot.ToString().ToLowerInvariant(),
                ["rarity"] = definition.Rarity.ToString(),
            });
        }

        // ---- what the player asks for ----

        public FormaIntentResult Handle(FormaIntent intent)
        {
            if (inventory == null) return FormaIntentResult.Reject("No inventory is bound.");
            var result = Dispatch(intent);
            if (logIntents) Debug.Log($"[PlayerInventoryFormaAdapter] {intent.Name} -> {(result.Accepted ? "accepted" : result.Reason)}");
            return result;
        }

        FormaIntentResult Dispatch(FormaIntent intent)
        {
            switch (intent.Name)
            {
                case FormaIntentNames.MoveItem:
                case FormaIntentNames.EquipItem:
                    return Move(Text(intent, "fromSlot"), Text(intent, "toSlot"));
                case FormaIntentNames.UseItem:
                    return AtSlot(Text(intent, "slotId"), (category, index) => inventory.Use(category, index));
                case FormaIntentNames.DropItem:
                    return AtSlot(Text(intent, "slotId"), (category, index) => inventory.Drop(category, index));
                case FormaIntentNames.SplitStack:
                    var amount = intent.Payload.TryGetValue("amount", out var raw) && FormaValue.TryNumber(raw, out var number) ? (int)number : 0;
                    return AtSlot(Text(intent, "slotId"), (category, index) => inventory.Split(category, index, amount));
                default:
                    return FormaIntentResult.Reject($"The game does not handle «{intent.Name}».");
            }
        }

        FormaIntentResult Move(string fromSlot, string toSlot)
        {
            if (!TryBagSlot(fromSlot, out var fromCategory, out var from))
                return FormaIntentResult.Reject("Unknown source slot.");
            if (TryEquipSlotOf(toSlot, out var equipSlot))
                return Translate(inventory.Equip(fromCategory, from, equipSlot));
            if (!TryBagSlot(toSlot, out var toCategory, out var to))
                return FormaIntentResult.Reject("Unknown target slot.");
            return Translate(inventory.Move(fromCategory, from, toCategory, to));
        }

        FormaIntentResult AtSlot(string slotId, Func<ItemCategory, int, InventoryResult> action) =>
            TryBagSlot(slotId, out var category, out var index)
                ? Translate(action(category, index))
                : FormaIntentResult.Reject("Unknown slot.");

        static FormaIntentResult Translate(InventoryResult result) =>
            result.Ok ? FormaIntentResult.Accept() : FormaIntentResult.Reject(result.Reason);

        static string Text(FormaIntent intent, string key) =>
            intent.Payload.TryGetValue(key, out var value) && value is string text ? text : string.Empty;

        // ---- design slot ids -> game slots ----

        FormaScreen Owner => screen != null ? screen : screen = GetComponentInParent<FormaScreen>();

        /// <summary>A bag slot node of the design: its category comes from the slot's filter, its position from the binding index.</summary>
        bool TryBagSlot(string nodeId, out ItemCategory category, out int index)
        {
            category = default;
            index = -1;
            if (Owner == null) return false;
            foreach (var slot in Owner.GetComponentsInChildren<FormaSlot>(true))
            {
                if (slot.IsEquipment || slot.NodeId != nodeId) continue;
                index = slot.binding.index;
                return index >= 0 && TryCategoryOf(slot.binding.filters, out category);
            }
            return false;
        }

        bool TryEquipSlotOf(string nodeId, out EquipSlot slot)
        {
            slot = EquipSlot.None;
            if (Owner == null) return false;
            foreach (var equipment in Owner.GetComponentsInChildren<FormaEquipmentSlot>(true))
                if (equipment.SlotId == nodeId)
                    return Enum.TryParse(equipment.slotType, true, out slot) && slot != EquipSlot.None;
            return false;
        }

        static bool TryCategoryOf(FormaFilter[] filters, out ItemCategory category)
        {
            category = default;
            foreach (var filter in filters ?? Array.Empty<FormaFilter>())
            {
                if (filter.field != "category") continue;
                foreach (var pair in CategoryLabels)
                {
                    if (pair.Value != filter.value) continue;
                    category = pair.Key;
                    return true;
                }
            }
            return false;
        }
    }
}
