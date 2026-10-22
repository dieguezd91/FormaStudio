using System;
using System.Collections.Generic;
using System.Linq;
using ExistingGame.FormaAdapter;
using ExistingGame.Inventory;
using Forma.Studio;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Forma.E2E
{
    /// <summary>An imported screen Prefab instantiated under a Canvas, next to the existing game's inventory.</summary>
    sealed class E2EHarness : IDisposable
    {
        public const string Armas = "Armas";
        public const string Armaduras = "Armaduras";
        public const string Consumibles = "Consumibles";
        public const string Materiales = "Materiales";

        readonly GameObject canvas;

        E2EHarness(GameObject canvas, FormaScreen screen, PlayerInventory inventory)
        {
            this.canvas = canvas;
            Screen = screen;
            Inventory = inventory;
        }

        public FormaScreen Screen { get; }
        public PlayerInventory Inventory { get; }
        public PlayerInventoryFormaAdapter Adapter => Screen.GetComponent<PlayerInventoryFormaAdapter>();

        /// <summary>
        /// Instantiates the Prefab. With <paramref name="wireAtRuntime"/> the harness adds the adapter and connects it with
        /// SetDataSource / SetIntentHandler; otherwise the Prefab must already carry the developer's adapter and serialized wiring.
        /// </summary>
        public static E2EHarness Open(string prefabPath, bool wireAtRuntime)
        {
            var asset = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            Assert.IsNotNull(asset, "Prefab " + prefabPath);
            var canvas = new GameObject("E2ECanvas", typeof(Canvas));
            var root = (GameObject)PrefabUtility.InstantiatePrefab(asset, canvas.transform);
            var screen = root.GetComponent<FormaScreen>();
            Assert.IsNotNull(screen, "the Prefab root has a FormaScreen");

            var inventory = new PlayerInventory(GameItemDatabase.CreateDefault(), playerLevel: 1);
            Seed(inventory);
            var harness = new E2EHarness(canvas, screen, inventory);
            var adapter = wireAtRuntime ? root.AddComponent<PlayerInventoryFormaAdapter>() : harness.Adapter;
            Assert.IsNotNull(adapter, "the screen has a PlayerInventoryFormaAdapter");
            if (wireAtRuntime)
            {
                screen.SetDataSource(adapter);
                screen.SetIntentHandler(adapter);
            }
            adapter.Bind(inventory);
            screen.Refresh(); // EditMode never calls Awake, so the serialized wiring is resolved here and not on Bind's Changed
            return harness;
        }

        public static void Seed(PlayerInventory inventory)
        {
            foreach (var (id, count) in new[]
                     {
                         ("iron-sword", 1), ("dragon-blade", 1), ("oak-shield", 1), ("steel-helm", 1),
                         ("healing-potion", 5), ("ancient-key", 1),
                     })
                Assert.IsTrue(inventory.Add(id, count).Ok, "seed " + id);
        }

        public void Dispose()
        {
            if (canvas != null) UnityEngine.Object.DestroyImmediate(canvas);
        }

        // ---- the screen ----

        /// <summary>The bag slot of a tab (<c>category</c> filter) at a binding index.</summary>
        public FormaSlot Bag(string category, int index)
        {
            var slot = Screen.GetComponentsInChildren<FormaSlot>(true).FirstOrDefault(s =>
                !s.IsEquipment && s.binding.index == index && s.binding.filters.Any(f => f.field == "category" && f.value == category));
            Assert.IsNotNull(slot, $"bag slot {category}[{index}] in the screen");
            return slot;
        }

        public IEnumerable<FormaSlot> BagSlots(string category) =>
            Screen.GetComponentsInChildren<FormaSlot>(true).Where(s =>
                !s.IsEquipment && s.binding.filters.Any(f => f.field == "category" && f.value == category));

        /// <summary>The equipment slot of a type (<c>weapon</c>, <c>head</c>...).</summary>
        public FormaSlot Equipment(string slotType)
        {
            var slot = Screen.GetComponentsInChildren<FormaEquipmentSlot>(true)
                .Where(e => e.slotType == slotType).Select(e => e.GetComponent<FormaSlot>()).FirstOrDefault();
            Assert.IsNotNull(slot, $"equipment slot «{slotType}» in the screen (the e2e bundle needs equipment slots)");
            return slot;
        }

        public static FormaItemView ItemView(FormaSlot slot) => slot.GetComponentInChildren<FormaItemView>(true);

        /// <summary>What every slot of the screen shows, to prove a rejected intent leaves the UI untouched.</summary>
        public string Snapshot() =>
            string.Join("|", Screen.GetComponentsInChildren<FormaSlot>(true)
                .Select(s => $"{s.NodeId}={(s.Record == null ? "-" : s.Record.Id + "x" + s.Record.GetInt("quantity"))}"));

        // ---- intents the way the Forma components raise them ----

        public FormaIntentResult Move(FormaSlot from, FormaSlot to) =>
            Screen.Raise(FormaIntent.Create(FormaIntentNames.MoveItem,
                ("itemId", from.Record?.Id), ("fromSlot", from.NodeId), ("toSlot", to.NodeId)));

        public FormaIntentResult Equip(FormaSlot from, FormaSlot equipment) =>
            Screen.Raise(FormaIntent.Create(FormaIntentNames.EquipItem,
                ("itemId", from.Record?.Id), ("fromSlot", from.NodeId), ("toSlot", equipment.NodeId),
                ("slotType", equipment.GetComponent<FormaEquipmentSlot>().slotType)));

        public FormaIntentResult Menu(string intentName, string actionId, FormaSlot slot) =>
            Screen.Raise(FormaIntent.Create(intentName, ("actionId", actionId), ("slotId", slot.NodeId), ("itemId", slot.Record?.Id)));

        public FormaIntentResult Split(FormaSlot slot, int amount) =>
            Screen.Raise(FormaIntent.Create(FormaIntentNames.SplitStack,
                ("itemId", slot.Record?.Id), ("amount", (double)amount), ("slotId", slot.NodeId)));
    }
}
