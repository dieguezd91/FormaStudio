using System.IO;
using System.Linq;
using ExistingGame.FormaAdapter;
using ExistingGame.Inventory;
using Forma.Studio;
using Forma.Studio.Editor;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Forma.E2E
{
    /// <summary>
    /// Scenario 13.1, part 1: a game with an existing item system imports the Forma bundle, connects it with one adapter, and saves its
    /// own work into the Prefab. The tests run in order and share only what is on disk (<see cref="E2EBundles.Folder"/>), which
    /// <see cref="Forma13_1_Reimport"/> reads in a later run.
    /// </summary>
    [TestFixture, Category("E2E13_1")]
    public sealed class Forma13_1_FirstImport
    {
        static string bundlePath;
        bool postprocessor;

        static string PrefabPath => FormaPrefabImporter.PrefabPathFor(bundlePath);

        [SetUp]
        public void SetUp()
        {
            postprocessor = FormaBundlePostprocessor.Enabled;
            FormaBundlePostprocessor.Enabled = false; // the tests call the importer themselves
        }

        [TearDown]
        public void TearDown() => FormaBundlePostprocessor.Enabled = postprocessor;

        [Test, Order(1)]
        public void Import_CreatesThePrefabFromTheBundle()
        {
            if (AssetDatabase.IsValidFolder(E2EBundles.Folder)) AssetDatabase.DeleteAsset(E2EBundles.Folder);
            Directory.CreateDirectory(E2EBundles.Folder);
            AssetDatabase.Refresh();

            var external = E2EBundles.ExternalBundle(E2EBundles.BundleEnv);
            bundlePath = external != null
                ? E2EBundles.PlaceExternal(external)
                : E2EBundles.PlaceText(E2EBundles.BuildStandaloneV1(), E2EBundles.DefaultBundlePath);
            TestContext.Out.WriteLine($"bundle: {(external ?? "package fixtures (standalone)")} -> {bundlePath}");

            var report = FormaPrefabImporter.Import(bundlePath);

            Assert.IsTrue(report.Ok, report.Summary);
            Assert.AreEqual(ImportReport.StatusCreated, report.status);
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            Assert.IsNotNull(prefab, PrefabPath);
            Assert.IsNotNull(prefab.GetComponent<FormaScreen>());
            Assert.IsNull(prefab.GetComponent<PlayerInventoryFormaAdapter>(), "the design knows nothing about the game's adapter");
        }

        [Test, Order(2)]
        public void Screen_ShowsTheGamesItems_NotTheMockData()
        {
            using (var h = Open(wireAtRuntime: true))
            {
                Assert.AreEqual("iron-sword", h.Bag(E2EHarness.Armas, 0).Record?.Id);
                Assert.AreEqual("dragon-blade", h.Bag(E2EHarness.Armas, 1).Record?.Id);
                Assert.IsNull(h.Bag(E2EHarness.Armas, 2).Record);
                Assert.AreEqual(2, h.BagSlots(E2EHarness.Armas).Count(s => s.Record != null), "only the game's two weapons");
                Assert.AreEqual("oak-shield", h.Bag(E2EHarness.Armaduras, 0).Record?.Id);
                Assert.AreEqual("ancient-key", h.Bag(E2EHarness.Materiales, 0).Record?.Id);

                var potions = h.Bag(E2EHarness.Consumibles, 0);
                Assert.AreEqual("healing-potion", potions.Record?.Id);
                Assert.AreEqual(5, E2EHarness.ItemView(potions).Record.GetInt("quantity"));
                Assert.AreEqual("Iron Sword", E2EHarness.ItemView(h.Bag(E2EHarness.Armas, 0)).Record.GetString("name"));

                var gameIds = new[] { "iron-sword", "dragon-blade", "oak-shield", "steel-helm", "healing-potion", "ancient-key" };
                var shown = h.Screen.GetComponentsInChildren<FormaSlot>(true).Where(s => s.Record != null).ToList();
                Assert.AreEqual(6, shown.Count);
                CollectionAssert.IsSubsetOf(shown.Select(s => s.Record.Id), gameIds);
            }
        }

        [Test, Order(3)]
        public void Intents_AreDecidedByTheGame()
        {
            using (var h = Open(wireAtRuntime: true))
            {
                // accepted: the game moves the stack and the UI follows
                var moved = h.Move(h.Bag(E2EHarness.Armas, 0), h.Bag(E2EHarness.Armas, 2));
                Assert.IsTrue(moved.Accepted, moved.Reason);
                Assert.AreEqual("iron-sword", h.Inventory.GetSlots(ItemCategory.Weapon)[2].Definition.Id);
                Assert.IsNull(h.Inventory.GetSlots(ItemCategory.Weapon)[0]);
                Assert.AreEqual("iron-sword", h.Bag(E2EHarness.Armas, 2).Record?.Id);
                Assert.IsNull(h.Bag(E2EHarness.Armas, 0).Record);

                // rejected: quest items cannot be dropped, with the game's own reason, and nothing changes
                var before = h.Snapshot();
                var key = h.Bag(E2EHarness.Materiales, 0);
                var drop = h.Menu(FormaIntentNames.DropItem, "drop", key);
                Assert.IsFalse(drop.Accepted);
                Assert.AreEqual(InventoryReasons.QuestItemNoDrop, drop.Reason);
                Assert.AreEqual("ancient-key", h.Inventory.GetSlots(ItemCategory.Quest)[0].Definition.Id);
                Assert.AreEqual(before, h.Snapshot(), "a rejected intent leaves the UI untouched");

                // rejected: an item only fits the equipment slot of its type
                var weapon = h.Equipment("weapon");
                var mismatch = h.Equip(h.Bag(E2EHarness.Armaduras, 1), weapon);
                Assert.IsFalse(mismatch.Accepted);
                Assert.AreEqual(InventoryReasons.WrongEquipSlot, mismatch.Reason);
                Assert.IsNull(h.Inventory.GetEquipped(EquipSlot.Weapon));
                Assert.IsNull(weapon.Record);
                Assert.AreEqual(before, h.Snapshot());

                // rejected: the game's level rule
                var tooLow = h.Equip(h.Bag(E2EHarness.Armas, 1), weapon);
                Assert.AreEqual(InventoryReasons.LevelTooLow, tooLow.Reason);
                Assert.AreEqual(before, h.Snapshot());

                // accepted: a matching item equips
                var equipped = h.Equip(h.Bag(E2EHarness.Armas, 2), weapon);
                Assert.IsTrue(equipped.Accepted, equipped.Reason);
                Assert.AreEqual("iron-sword", h.Inventory.GetEquipped(EquipSlot.Weapon).Definition.Id);
                Assert.AreEqual("iron-sword", weapon.Record?.Id);
                Assert.IsNull(h.Bag(E2EHarness.Armas, 2).Record);

                // use and split follow the game's stack rules
                var potions = h.Bag(E2EHarness.Consumibles, 0);
                Assert.IsTrue(h.Menu(FormaIntentNames.UseItem, "use", potions).Accepted);
                Assert.AreEqual(4, potions.Record.GetInt("quantity"));
                Assert.IsTrue(h.Split(potions, 1).Accepted);
                Assert.AreEqual(3, potions.Record.GetInt("quantity"));
                Assert.AreEqual(1, h.Bag(E2EHarness.Consumibles, 1).Record.GetInt("quantity"));
                var badSplit = h.Split(potions, 3);
                Assert.AreEqual(InventoryReasons.BadSplit, badSplit.Reason);
                Assert.IsTrue(h.Menu(FormaIntentNames.DropItem, "drop", h.Bag(E2EHarness.Armaduras, 0)).Accepted);
                Assert.IsNull(h.Bag(E2EHarness.Armaduras, 0).Record);
            }
        }

        [Test, Order(4)]
        public void DeveloperCustomization_IsSavedIntoThePrefab()
        {
            var lastSlot = E2EBundles.LastSlotNodeId(File.ReadAllText(bundlePath));
            var root = PrefabUtility.LoadPrefabContents(PrefabPath);
            try
            {
                var screen = root.GetComponent<FormaScreen>();
                var adapter = root.AddComponent<PlayerInventoryFormaAdapter>();

                var screenObject = new SerializedObject(screen);
                var sources = screenObject.FindProperty("dataSources");
                sources.arraySize = 1;
                sources.GetArrayElementAtIndex(0).objectReferenceValue = adapter;
                screenObject.FindProperty("intentHandler").objectReferenceValue = adapter;
                screenObject.ApplyModifiedPropertiesWithoutUndo();

                var adapterObject = new SerializedObject(adapter);
                adapterObject.FindProperty("logIntents").boolValue = true;
                adapterObject.ApplyModifiedPropertiesWithoutUndo();

                new GameObject("DevBadge", typeof(RectTransform), typeof(UnityEngine.UI.Image)).transform.SetParent(root.transform, false);
                var slot = root.GetComponentsInChildren<FormaId>(true).First(id => id.nodeId == lastSlot);
                new GameObject("DevSlotNote", typeof(RectTransform)).transform.SetParent(slot.transform, false);

                PrefabUtility.SaveAsPrefabAsset(root, PrefabPath);
            }
            finally
            {
                PrefabUtility.UnloadPrefabContents(root);
            }

            // the saved Prefab connects itself: no SetDataSource / SetIntentHandler this time
            using (var h = Open(wireAtRuntime: false))
            {
                Assert.IsTrue(new SerializedObject(h.Adapter).FindProperty("logIntents").boolValue);
                Assert.IsNotNull(h.Screen.transform.Find("DevBadge"));
                Assert.AreEqual(h.Adapter, h.Screen.GetSource(PlayerInventoryFormaAdapter.DataSourceId));
                Assert.AreEqual("iron-sword", h.Bag(E2EHarness.Armas, 0).Record?.Id);
                Assert.IsTrue(h.Move(h.Bag(E2EHarness.Armas, 0), h.Bag(E2EHarness.Armas, 3)).Accepted);
                Assert.AreEqual("iron-sword", h.Inventory.GetSlots(ItemCategory.Weapon)[3].Definition.Id);
            }
        }

        static E2EHarness Open(bool wireAtRuntime)
        {
            Assert.IsNotNull(bundlePath, "Import_CreatesThePrefabFromTheBundle runs first (same run)");
            return E2EHarness.Open(PrefabPath, wireAtRuntime);
        }
    }
}
