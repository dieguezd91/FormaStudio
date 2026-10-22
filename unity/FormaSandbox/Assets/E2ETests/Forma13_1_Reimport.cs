using System.IO;
using System.Linq;
using ExistingGame.FormaAdapter;
using ExistingGame.Inventory;
using Forma.Studio;
using Forma.Studio.Editor;
using NUnit.Framework;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;

namespace Forma.E2E
{
    /// <summary>
    /// Scenario 13.1, part 2: the design is exported again and the developer keeps everything. Reads what <see cref="Forma13_1_FirstImport"/>
    /// left in <see cref="E2EBundles.Folder"/>; run it after that fixture, in the same run or a later one.
    /// Only the checks that depend on the standalone V2 edits run when <c>FORMA_E2E_BUNDLE_V2</c> is not set.
    /// </summary>
    [TestFixture, Category("E2E13_1")]
    public sealed class Forma13_1_Reimport
    {
        static string bundlePath;
        static bool standalone;
        static string v1Json;
        static string lastSlotId;
        static string titleId;
        bool postprocessor;

        static string PrefabPath => FormaPrefabImporter.PrefabPathFor(bundlePath);

        [SetUp]
        public void SetUp()
        {
            postprocessor = FormaBundlePostprocessor.Enabled;
            FormaBundlePostprocessor.Enabled = false;
        }

        [TearDown]
        public void TearDown() => FormaBundlePostprocessor.Enabled = postprocessor;

        [Test, Order(1)]
        public void Reimport_UpdatesTheDesign_AndKeepsTheDevelopersWork()
        {
            var existing = AssetDatabase.IsValidFolder(E2EBundles.Folder)
                ? Directory.GetFiles(E2EBundles.Folder, "*.forma.json")
                : new string[0];
            Assert.AreEqual(1, existing.Length, $"Run Forma13_1_FirstImport first: expected its bundle in {E2EBundles.Folder}.");
            bundlePath = existing[0].Replace('\\', '/');
            Assert.IsTrue(File.Exists(PrefabPath), "Run Forma13_1_FirstImport first: no Prefab at " + PrefabPath);

            v1Json = File.ReadAllText(bundlePath);
            lastSlotId = E2EBundles.LastSlotNodeId(v1Json);
            titleId = E2EBundles.TitleNodeId(v1Json);
            var external = E2EBundles.ExternalBundle(E2EBundles.BundleV2Env);
            standalone = external == null;
            if (standalone) E2EBundles.PlaceText(E2EBundles.BuildStandaloneV2(v1Json), bundlePath);
            else Assert.AreEqual(bundlePath, E2EBundles.PlaceExternal(external), "V2 must have the same file name as V1");
            TestContext.Out.WriteLine($"bundle v2: {(external ?? "derived from the V1 bundle (standalone)")} -> {bundlePath}");
            Assert.AreNotEqual(v1Json, File.ReadAllText(bundlePath), "V2 differs from V1");

            var report = FormaPrefabImporter.Import(bundlePath);

            Assert.IsTrue(report.Ok, report.Summary);
            Assert.AreEqual(ImportReport.StatusUpdated, report.status);
            Assert.AreEqual(0, report.conflicts.Count, string.Join("; ", report.conflicts.Select(c => c.message)));
            Assert.IsTrue(report.updated.Count > 0, "the report lists the updated nodes");
            if (standalone)
            {
                Assert.IsTrue(report.updated.Any(e => e.nodeId == titleId), "the renamed title is reported as updated");
                Assert.IsTrue(report.created.Any(e => e.nodeId == E2EBundles.WeightNodeId), "the new node is reported as created");
                Assert.IsTrue(report.preserved.Any(e => e.nodeId == lastSlotId && e.message.Contains("desarrollador")),
                    "the removed slot kept the developer's note, so it is preserved and reported");
            }

            var saved = ImportReport.Load(FormaPrefabImporter.ReportPathFor(bundlePath));
            Assert.IsNotNull(saved, "the import report is written next to the Prefab");
            Assert.AreEqual(report.updated.Count, saved.updated.Count);
            Assert.AreEqual(report.preserved.Count, saved.preserved.Count);
        }

        [Test, Order(2)]
        public void Reimport_KeepsAdapterBadgeAndDeveloperFields()
        {
            RequireImported();
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            var adapter = prefab.GetComponent<PlayerInventoryFormaAdapter>();
            Assert.IsNotNull(adapter, "the adapter survives the re-import");
            Assert.IsTrue(new SerializedObject(adapter).FindProperty("logIntents").boolValue, "the developer's field value persists");
            Assert.IsNotNull(prefab.transform.Find("DevBadge"), "the developer's child survives");

            var screen = new SerializedObject(prefab.GetComponent<FormaScreen>());
            Assert.AreEqual(adapter, screen.FindProperty("intentHandler").objectReferenceValue, "the wiring survives");
            Assert.AreEqual(adapter, screen.FindProperty("dataSources").GetArrayElementAtIndex(0).objectReferenceValue);
            var slot = prefab.GetComponentsInChildren<FormaId>(true).FirstOrDefault(id => id.nodeId == lastSlotId);
            Assert.IsNotNull(slot, "a slot the design dropped stays when it holds developer content");
            Assert.IsNotNull(slot.transform.Find("DevSlotNote"));
        }

        [Test, Order(3)]
        public void Reimport_AppliesTheDesignChanges()
        {
            RequireImported();
            if (!standalone) Assert.Ignore("Design-specific checks only run against the derived V2 bundle.");
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            Find(prefab, titleId, out var title);
            Assert.AreEqual(E2EBundles.RenamedTitle, title.name, "renamed node");

            Find(prefab, E2EBundles.WeightNodeId, out var weight);
            Assert.AreEqual("Peso total", weight.name);
            Assert.AreEqual("Peso total", weight.GetComponent<TMP_Text>().text, "the new text node");

            var expected = ParseColor(E2EBundles.NewSurfaceColor);
            var theme = AssetDatabase.LoadAssetAtPath<FormaTheme>(FormaPrefabImporter.ThemePathFor(bundlePath));
            Assert.IsTrue(theme.TryGetColor("surfaceAlt", out var token));
            AssertColor(expected, token, "theme token");
            var bagSlot = prefab.GetComponentsInChildren<FormaSlot>(true).First(s => !s.IsEquipment);
            AssertColor(expected, bagSlot.GetComponent<Image>().color, "slot background");
        }

        [Test, Order(4)]
        public void Reimport_GameWiringStillWorks()
        {
            RequireImported();
            using (var h = E2EHarness.Open(PrefabPath, wireAtRuntime: false))
            {
                Assert.AreEqual("iron-sword", h.Bag(E2EHarness.Armas, 0).Record?.Id, "the screen still shows the game's items");
                Assert.AreEqual(2, h.BagSlots(E2EHarness.Armas).Count(s => s.Record != null));

                var moved = h.Move(h.Bag(E2EHarness.Armas, 0), h.Bag(E2EHarness.Armas, 2));
                Assert.IsTrue(moved.Accepted, moved.Reason);
                Assert.AreEqual("iron-sword", h.Inventory.GetSlots(ItemCategory.Weapon)[2].Definition.Id);
                Assert.AreEqual("iron-sword", h.Bag(E2EHarness.Armas, 2).Record?.Id);

                var before = h.Snapshot();
                var drop = h.Menu(FormaIntentNames.DropItem, "drop", h.Bag(E2EHarness.Materiales, 0));
                Assert.AreEqual(InventoryReasons.QuestItemNoDrop, drop.Reason, "the game still has the last word");
                Assert.AreEqual(before, h.Snapshot());
            }
        }

        static void RequireImported() =>
            Assert.IsNotNull(bundlePath, "Reimport_UpdatesTheDesign_AndKeepsTheDevelopersWork runs first (same run)");

        static void Find(GameObject prefab, string nodeId, out GameObject found)
        {
            var id = prefab.GetComponentsInChildren<FormaId>(true).FirstOrDefault(i => i.nodeId == nodeId);
            Assert.IsNotNull(id, "node " + nodeId);
            found = id.gameObject;
        }

        static Color ParseColor(string hex)
        {
            Assert.IsTrue(ColorUtility.TryParseHtmlString(hex, out var color), hex);
            return color;
        }

        static void AssertColor(Color expected, Color actual, string what) =>
            Assert.IsTrue(Mathf.Approximately(expected.r, actual.r) && Mathf.Approximately(expected.g, actual.g) && Mathf.Approximately(expected.b, actual.b),
                $"{what}: expected {ColorUtility.ToHtmlStringRGB(expected)}, was {ColorUtility.ToHtmlStringRGB(actual)}");
    }
}
