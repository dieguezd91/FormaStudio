using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using NUnit.Framework;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.TestTools;
using UnityEngine.UI;
using Forma.Studio.Tests;
using static Forma.Studio.Editor.Tests.FormaTestBundles;

namespace Forma.Studio.Editor.Tests
{
    /// <summary>The Editor importer: bundle -> Prefab, and the safe update on re-export. Uses the exported fixtures.</summary>
    public class FormaImporterTests
    {
        readonly List<GameObject> sceneObjects = new List<GameObject>();

        [SetUp]
        public void SetUp()
        {
            FormaBundlePostprocessor.Enabled = false;
            ResetTempFolder();
        }

        [TearDown]
        public void TearDown()
        {
            foreach (var go in sceneObjects)
                if (go != null) UnityEngine.Object.DestroyImmediate(go);
            sceneObjects.Clear();
            foreach (var eventSystem in UnityEngine.Object.FindObjectsByType<EventSystem>(FindObjectsSortMode.None))
                UnityEngine.Object.DestroyImmediate(eventSystem.gameObject);
            DeleteTempFolder();
            FormaBundlePostprocessor.Enabled = true;
        }

        // ---- helpers ----

        static ImportReport ImportTree(Dictionary<string, object> tree)
        {
            WriteBundle(tree);
            var report = FormaPrefabImporter.Import(BundlePath);
            Assert.IsTrue(report.Ok, report.error);
            return report;
        }

        static GameObject LoadPrefab(ImportReport report) =>
            AssetDatabase.LoadAssetAtPath<GameObject>(report.prefabPath);

        static GameObject Find(GameObject root, string nodeId)
        {
            var id = root.GetComponentsInChildren<FormaId>(true).FirstOrDefault(f => f.nodeId == nodeId);
            return id != null ? id.gameObject : null;
        }

        static T Get<T>(GameObject root, string nodeId) where T : Component
        {
            var go = Find(root, nodeId);
            Assert.IsNotNull(go, "node " + nodeId);
            var component = go.GetComponent<T>();
            Assert.IsNotNull(component, $"{typeof(T).Name} on {nodeId}");
            return component;
        }

        static void EditPrefab(string path, Action<GameObject> edit)
        {
            var root = PrefabUtility.LoadPrefabContents(path);
            try
            {
                edit(root);
                PrefabUtility.SaveAsPrefabAsset(root, path);
            }
            finally
            {
                PrefabUtility.UnloadPrefabContents(root);
            }
        }

        static Color Hex(string hex)
        {
            Assert.IsTrue(FormaTheme.TryParseHex(hex, out var color), hex);
            return color;
        }

        static void AssertColor(string expectedHex, Color actual) =>
            Assert.That((Vector4)actual, Is.EqualTo((Vector4)Hex(expectedHex)).Using(new Vec4Comparer()), expectedHex);

        sealed class Vec4Comparer : IEqualityComparer<Vector4>
        {
            public bool Equals(Vector4 a, Vector4 b) => (a - b).magnitude < 0.01f;
            public int GetHashCode(Vector4 v) => 0;
        }

        /// <summary>GameObjects the importer adds besides one per node: a label under each button, a quantity text under item views that show one.</summary>
        static int SyntheticCount(Dictionary<string, object> tree) =>
            Nodes(tree).Cast<Dictionary<string, object>>().Count(n =>
                (string)n["kind"] == "button" ||
                ((List<object>)n["components"]).Cast<Dictionary<string, object>>()
                    .Any(c => (string)c["type"] == "FormaItemView" && c.ContainsKey("quantity")));

        // ---- first import ----

        [Test]
        public void FirstImport_CreatesPrefabThemeAndReport()
        {
            var report = ImportTree(LoadFixture("grid-equipment"));

            Assert.AreEqual(ImportReport.StatusCreated, report.status);
            Assert.AreEqual("Assets/FormaImporterTests/Inventario.prefab", report.prefabPath);
            Assert.IsNotNull(LoadPrefab(report));
            var theme = AssetDatabase.LoadAssetAtPath<FormaTheme>("Assets/FormaImporterTests/Inventario.theme.asset");
            Assert.IsNotNull(theme);
            Assert.IsTrue(theme.TryGetColor("colors.surface", out var surface));
            AssertColor("#1f2430", surface);
            Assert.IsTrue(File.Exists("Assets/FormaImporterTests/Inventario.import-report.json"));
            var saved = ImportReport.Load("Assets/FormaImporterTests/Inventario.import-report.json");
            Assert.AreEqual(ImportReport.StatusCreated, saved.status);
            Assert.AreEqual(report.created.Count, saved.created.Count);
        }

        [Test]
        public void FirstImport_CreatesOneFormaIdPerBundleNode()
        {
            var tree = LoadFixture("grid-equipment");
            var report = ImportTree(tree);

            var ids = LoadPrefab(report).GetComponentsInChildren<FormaId>(true).Select(f => f.nodeId).ToList();
            var nodeIds = Nodes(tree).Cast<Dictionary<string, object>>().Select(n => (string)n["id"]).ToList();
            CollectionAssert.IsSubsetOf(nodeIds, ids);
            Assert.AreEqual(nodeIds.Count + SyntheticCount(tree), ids.Count);
            Assert.AreEqual(20, SyntheticCount(tree), "the 20 inventory slots show a quantity");
            Assert.AreEqual(nodeIds.Count, report.created.Count, "synthetic children are not reported on their own");
        }

        [Test]
        public void FirstImport_TabsFixture_OneFormaIdPerNodePlusSyntheticChildren()
        {
            var tree = LoadFixture("tabs");
            var report = ImportTree(tree);

            var ids = LoadPrefab(report).GetComponentsInChildren<FormaId>(true);
            Assert.AreEqual(Nodes(tree).Count + SyntheticCount(tree), ids.Length);
            Assert.AreEqual(4 + 80, SyntheticCount(tree), "4 tab labels and one quantity text per item view");
            Assert.AreEqual(ids.Length, ids.Select(f => f.nodeId).Distinct().Count());
        }

        [Test]
        public void FirstImport_AppliesBundleRectsAndPrefabRootIsStretched()
        {
            var tree = LoadFixture("grid-equipment");
            var prefab = LoadPrefab(ImportTree(tree));

            var nodes = Nodes(tree).Cast<Dictionary<string, object>>().ToList();
            var layoutParents = new HashSet<string>(nodes.Where(n => n.ContainsKey("layoutGroup")).Select(n => (string)n["id"]));
            foreach (var node in nodes)
            {
                if (node["parentId"] != null && layoutParents.Contains((string)node["parentId"])) continue;
                var rect = Child(node, "rect");
                var transform = (RectTransform)Find(prefab, (string)node["id"]).transform;
                Assert.AreEqual(V(Child(rect, "anchorMin")), transform.anchorMin, node["id"] + " anchorMin");
                Assert.AreEqual(V(Child(rect, "anchorMax")), transform.anchorMax, node["id"] + " anchorMax");
                Assert.AreEqual(V(Child(rect, "pivot")), transform.pivot, node["id"] + " pivot");
                Assert.AreEqual(V(Child(rect, "anchoredPosition")), transform.anchoredPosition, node["id"] + " pos");
                Assert.AreEqual(V(Child(rect, "sizeDelta")), transform.sizeDelta, node["id"] + " size");
            }

            var root = (RectTransform)prefab.transform;
            Assert.AreEqual(Vector2.zero, root.anchorMin);
            Assert.AreEqual(Vector2.one, root.anchorMax);
            var panel = (RectTransform)Find(prefab, "node_1").transform;
            Assert.AreEqual(new Vector2(0, 1), panel.anchorMin);
            Assert.AreEqual(new Vector2(616, 324), panel.sizeDelta);
            var head = (RectTransform)Find(prefab, "node_4").transform;
            Assert.AreEqual(new Vector2(84, -48), head.anchoredPosition);
        }

        static Vector2 V(Dictionary<string, object> v) => new Vector2((float)(double)v["x"], (float)(double)v["y"]);

        [Test]
        public void FirstImport_RootCarriesScreenSimulatedSourceAndCanvasGroup()
        {
            var prefab = LoadPrefab(ImportTree(LoadFixture("grid-equipment")));

            Assert.IsNotNull(prefab.GetComponent<FormaScreen>());
            Assert.IsNotNull(prefab.GetComponent<FormaSimulatedInventorySource>());
            Assert.IsNotNull(prefab.GetComponent<CanvasGroup>());
            Assert.IsNull(prefab.GetComponent<Canvas>(), "the prefab root is a RectTransform, not a Canvas");
            var bundleField = new SerializedObject(prefab.GetComponent<FormaSimulatedInventorySource>()).FindProperty("bundle");
            Assert.AreEqual(BundlePath, AssetDatabase.GetAssetPath(bundleField.objectReferenceValue));
        }

        [Test]
        public void FirstImport_StylesImagesOutlinesAndRoundedSprites()
        {
            var report = ImportTree(LoadFixture("grid-equipment"));
            var prefab = LoadPrefab(report);

            var panel = Get<Image>(prefab, "node_1");
            AssertColor("#1f2430", panel.color);
            Assert.IsFalse(panel.raycastTarget);
            Assert.AreEqual(Image.Type.Sliced, panel.type);
            Assert.IsNotNull(panel.sprite);
            Assert.AreEqual(new Vector4(8, 8, 8, 8), panel.sprite.border);
            StringAssert.StartsWith("Assets/FormaImporterTests/Sprites/", AssetDatabase.GetAssetPath(panel.sprite));

            var outline = Get<Outline>(prefab, "node_1");
            AssertColor("#3b4458", outline.effectColor);
            Assert.AreEqual(new Vector2(1, -1), outline.effectDistance);

            var slot = Get<Image>(prefab, "node_4");
            Assert.IsTrue(slot.raycastTarget);
            Assert.AreEqual(new Vector4(4, 4, 4, 4), Get<Image>(prefab, "node_16").sprite.border);
            Assert.IsTrue(report.assets.Any(a => a.EndsWith(".png")));
        }

        [Test]
        public void FirstImport_TokenColorsGetAThemeBinding()
        {
            var report = ImportTree(LoadFixture("grid-equipment"));
            var prefab = LoadPrefab(report);

            var binding = Get<FormaThemeBinding>(prefab, "node_1");
            Assert.AreEqual("colors.surface", binding.colorToken);
            Assert.AreEqual(AssetDatabase.LoadAssetAtPath<FormaTheme>(report.themePath), binding.theme);
            var title = Get<FormaThemeBinding>(prefab, "node_3");
            Assert.AreEqual("colors.text", title.colorToken);
            Assert.AreSame(title.GetComponent<TMP_Text>(), title.GetComponent<Graphic>());
        }

        [Test]
        public void FirstImport_TextNodeUsesTextMeshPro()
        {
            var prefab = LoadPrefab(ImportTree(LoadFixture("grid-equipment")));

            var title = Get<TextMeshProUGUI>(prefab, "node_3");
            Assert.AreEqual("Equipamiento", title.text);
            Assert.AreEqual(16f, title.fontSize);
            Assert.AreEqual(TextAlignmentOptions.MidlineLeft, title.alignment);
            AssertColor("#e8ecf4", title.color);
            Assert.IsFalse(title.raycastTarget);
            Assert.IsNull(title.GetComponent<Image>());
        }

        [Test]
        public void FirstImport_GridLayoutGroupKeepsCellSizes()
        {
            var prefab = LoadPrefab(ImportTree(LoadFixture("grid-equipment")));

            var grid = Get<GridLayoutGroup>(prefab, "node_15");
            Assert.AreEqual(new Vector2(64, 64), grid.cellSize);
            Assert.AreEqual(new Vector2(4, 4), grid.spacing);
            Assert.AreEqual(GridLayoutGroup.Constraint.FixedColumnCount, grid.constraint);
            Assert.AreEqual(5, grid.constraintCount);
            Assert.AreEqual(TextAnchor.UpperLeft, grid.childAlignment);
            Assert.AreEqual(0, grid.padding.left);
        }

        [Test]
        public void FirstImport_SlotsAreButtonsWithTheirFormaComponents()
        {
            var prefab = LoadPrefab(ImportTree(LoadFixture("grid-equipment")));

            var slotGo = Find(prefab, "node_16");
            var button = slotGo.GetComponent<Button>();
            Assert.IsNotNull(button);
            Assert.AreEqual(Selectable.Transition.ColorTint, button.transition);
            Assert.AreSame(slotGo.GetComponent<Image>(), button.targetGraphic);

            var slot = slotGo.GetComponent<FormaSlot>();
            Assert.AreEqual("inventory.items", slot.binding.dataSourceId);
            Assert.AreEqual("items", slot.binding.root);
            Assert.AreEqual(0, slot.binding.index);
            var dragDrop = slotGo.GetComponent<FormaDragDrop>();
            Assert.AreEqual(FormaDragRole.Both, dragDrop.role);
            CollectionAssert.AreEqual(new[] { "item" }, dragDrop.accepts);
            Assert.AreEqual("inventory.moveItem", dragDrop.intent);
            Assert.AreEqual(99, slotGo.GetComponent<FormaStack>().maxStack);
            Assert.AreEqual(FormaSelectable.SelectionMode.Single, slotGo.GetComponent<FormaSelectable>().mode);
            Assert.AreEqual("inventory.splitStack", slotGo.GetComponent<FormaSplit>().intent);
            var menu = slotGo.GetComponent<FormaContextMenu>();
            Assert.AreEqual(FormaContextMenu.MenuTrigger.SecondaryClick, menu.trigger);
            CollectionAssert.AreEqual(new[] { "use", "split", "drop" }, menu.actions.Select(a => a.id));
            Assert.AreEqual("inventory.dropItem", menu.actions[2].intent);
            Assert.AreEqual("Soltar", menu.actions[2].label);
            Assert.IsNotNull(slotGo.GetComponent<FormaTooltip>());
        }

        [Test]
        public void FirstImport_EquipmentSlotsAndItemViewsAreBound()
        {
            var prefab = LoadPrefab(ImportTree(LoadFixture("grid-equipment")));

            var head = Find(prefab, "node_4");
            Assert.AreEqual("head", head.GetComponent<FormaEquipmentSlot>().slotType);
            var dragDrop = head.GetComponent<FormaDragDrop>();
            Assert.AreEqual(FormaDragRole.Target, dragDrop.role);
            CollectionAssert.AreEqual(new[] { "head" }, dragDrop.accepts);
            Assert.AreEqual("slotType", head.GetComponent<FormaSlot>().binding.filters.Single().field);

            var view = Get<FormaItemView>(prefab, "node_5");
            Assert.AreSame(view.GetComponent<Image>(), view.icon);
            Assert.AreEqual("icon", view.iconBinding.field);
            Assert.AreEqual("inventory.items", view.iconBinding.dataSourceId);
            Assert.AreEqual(0, view.iconBinding.index);
            Assert.AreEqual("head", view.iconBinding.filters.Single().value);
            var allViews = prefab.GetComponentsInChildren<FormaItemView>(true);
            Assert.AreEqual(25, allViews.Length);
            Assert.IsTrue(allViews.All(v => v.icon != null));
        }

        [Test]
        public void FirstImport_TabsFixture_WiresTabsButtonsAndContent()
        {
            var tree = LoadFixture("tabs");
            var prefab = LoadPrefab(ImportTree(tree));

            var bar = Get<FormaTabs>(prefab, "node_3");
            Assert.AreEqual("tab-1", bar.initialTabId);
            Assert.AreEqual(4, bar.tabs.Count);
            var expected = new[] { ("tab-1", "node_4", "node_8"), ("tab-2", "node_5", "node_50"), ("tab-3", "node_6", "node_92"), ("tab-4", "node_7", "node_134") };
            for (var i = 0; i < expected.Length; i++)
            {
                Assert.AreEqual(expected[i].Item1, bar.tabs[i].id);
                Assert.AreSame(Get<Button>(prefab, expected[i].Item2), bar.tabs[i].button);
                Assert.AreSame(Find(prefab, expected[i].Item3), bar.tabs[i].content);
            }
            Assert.AreEqual("Armas", bar.tabs[0].label);

            var layout = Get<HorizontalLayoutGroup>(prefab, "node_3");
            Assert.AreEqual(8f, layout.spacing);
            Assert.IsFalse(layout.childControlWidth);
            Assert.IsFalse(layout.childForceExpandWidth);

            var label = Find(prefab, "node_4/label");
            Assert.IsNotNull(label);
            Assert.AreSame(Find(prefab, "node_4").transform, label.transform.parent);
            Assert.AreEqual("Armas", label.GetComponent<TMP_Text>().text);
            Assert.AreEqual(TextAlignmentOptions.Midline, label.GetComponent<TMP_Text>().alignment);
            AssertColor("#d9a441", Get<Image>(prefab, "node_4").color);
        }

        [Test]
        public void FirstImport_TabsFixture_SwitchingTabsShowsOnlyItsContent()
        {
            var prefab = LoadPrefab(ImportTree(LoadFixture("tabs")));
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            sceneObjects.Add(instance);

            var tabs = instance.GetComponentInChildren<FormaTabs>(true);
            tabs.Initialize();
            Assert.AreEqual("tab-1", tabs.ActiveTabId);
            Assert.IsTrue(tabs.tabs[0].content.activeSelf);
            Assert.IsFalse(tabs.tabs[1].content.activeSelf);
            Assert.IsTrue(tabs.Select("tab-2"));
            Assert.IsFalse(tabs.tabs[0].content.activeSelf);
            Assert.IsTrue(tabs.tabs[1].content.activeSelf);
        }

        [Test]
        public void FirstImport_SiblingOrderFollowsSiblingIndex()
        {
            var tree = LoadFixture("grid-equipment");
            var prefab = LoadPrefab(ImportTree(tree));

            foreach (var node in Nodes(tree).Cast<Dictionary<string, object>>().Where(n => n["parentId"] != null))
            {
                var parent = Find(prefab, (string)node["parentId"]);
                var siblings = Nodes(tree).Cast<Dictionary<string, object>>()
                    .Where(n => (string)n["parentId"] == (string)node["parentId"])
                    .OrderBy(n => (double)n["siblingIndex"]).Select(n => (string)n["id"]).ToList();
                var actual = Enumerable.Range(0, parent.transform.childCount)
                    .Select(i => parent.transform.GetChild(i).GetComponent<FormaId>())
                    .Where(f => f != null && siblings.Contains(f.nodeId)).Select(f => f.nodeId).ToList();
                CollectionAssert.AreEqual(siblings, actual, "children of " + node["parentId"]);
            }
        }

        // ---- panels, scroll ----

        [Test]
        public void FirstImport_LinksContextMenuAndTooltipPanelsAndHidesThem()
        {
            var tree = LoadFixture("grid-equipment");
            AddNode(tree, "menu1", "Menú contextual", "root", 1, "contextMenu", 300, 10, 120, 80);
            AddNode(tree, "menu1_a", "Usar", "menu1", 0, "button", 0, 0, 100, 24, text: "Usar");
            AddNode(tree, "tip1", "Tooltip", "root", 2, "tooltip", 300, 100, 160, 60);
            AddNode(tree, "tip1_name", "Nombre", "tip1", 0, "text", 4, 4, 150, 20, text: "?",
                bindings: new List<object> { BindingMap("inventory.items", "name", 0, "text") });
            var prefab = LoadPrefab(ImportTree(tree));

            var menuPanel = Find(prefab, "menu1");
            Assert.IsFalse(menuPanel.activeSelf);
            Assert.AreSame(menuPanel.transform, Get<FormaContextMenu>(prefab, "node_16").panel);
            Assert.IsNotNull(Get<Button>(prefab, "menu1_a"));
            var tipPanel = Find(prefab, "tip1");
            Assert.IsFalse(tipPanel.activeSelf);
            Assert.AreSame(tipPanel.transform, Get<FormaTooltip>(prefab, "node_16").panel);

            var bound = Get<FormaBoundText>(prefab, "tip1_name");
            Assert.AreSame(bound.GetComponent<TMP_Text>(), bound.target);
            Assert.AreEqual("name", bound.binding.field);
        }

        [Test]
        public void FirstImport_ScrollNodeGetsViewportMaskAndContent()
        {
            var tree = LoadFixture("grid-equipment");
            var scroll = AddNode(tree, "sc1", "Lista", "root", 1, "scroll", 300, 10, 200, 100);
            scroll["scroll"] = new Dictionary<string, object> { ["horizontal"] = false, ["vertical"] = true };
            AddNode(tree, "sc1_row", "Fila", "sc1", 0, "text", 0, 0, 100, 20, text: "fila");
            var prefab = LoadPrefab(ImportTree(tree));

            var rect = Get<ScrollRect>(prefab, "sc1");
            Assert.IsTrue(rect.vertical);
            Assert.IsFalse(rect.horizontal);
            var content = Find(prefab, "sc1/content");
            var viewport = Find(prefab, "sc1/viewport");
            Assert.AreSame(content.GetComponent<RectTransform>(), rect.content);
            Assert.AreSame(viewport.GetComponent<RectTransform>(), rect.viewport);
            Assert.IsNotNull(viewport.GetComponent<Mask>());
            Assert.AreSame(content.transform, Find(prefab, "sc1_row").transform.parent);
            Assert.AreSame(viewport.transform, content.transform.parent);
        }

        // ---- re-import ----

        [Test]
        public void Reimport_SameBundle_ChangesNothingStructural()
        {
            var tree = LoadFixture("grid-equipment");
            var first = ImportTree(tree);
            var before = LoadPrefab(first).GetComponentsInChildren<Component>(true).Length;

            var second = ImportTree(tree);

            Assert.AreEqual(ImportReport.StatusUpdated, second.status);
            Assert.AreEqual(0, second.created.Count);
            Assert.AreEqual(0, second.removed.Count);
            Assert.AreEqual(0, second.conflicts.Count);
            Assert.AreEqual(0, second.updated.Count,
                "nothing changed in the design, nothing is rewritten: " + string.Join(",", second.updated.Select(e => e.nodeId)));
            Assert.AreEqual(before, LoadPrefab(second).GetComponentsInChildren<Component>(true).Length);
        }

        [Test]
        public void Reimport_UpdatesManagedPropertiesAndAppliesDesignChanges()
        {
            var tree = LoadFixture("grid-equipment");
            ImportTree(tree);

            Child(Child(Node(tree, "node_1"), "image"), "color").Remove("token");
            Child(Child(Node(tree, "node_1"), "image"), "color")["value"] = "#445566";
            Node(tree, "node_2")["name"] = "Panel renombrado";
            Child(Node(tree, "node_3"), "text")["value"] = "Equipo";
            Child(Child(tree, "theme"), "colors")["border"] = "#ff0000";
            Child(Node(tree, "node_15"), "layoutGroup")["spacing"] = 10.0;
            AddNode(tree, "node_new", "Nuevo", "node_1", 1, "text", 40, 4, 100, 20, text: "nuevo");
            RemoveNode(tree, "node_14");
            var report = ImportTree(tree);
            var prefab = LoadPrefab(report);

            AssertColor("#445566", Get<Image>(prefab, "node_1").color);
            Assert.IsNull(Find(prefab, "node_1").GetComponent<FormaThemeBinding>(), "the token is gone");
            Assert.AreEqual("Panel renombrado", Find(prefab, "node_2").name);
            Assert.AreEqual("Equipo", Get<TMP_Text>(prefab, "node_3").text);
            Assert.AreEqual(new Vector2(10, 10), Get<GridLayoutGroup>(prefab, "node_15").spacing);
            Assert.IsNull(Find(prefab, "node_14"), "removed from the design and held nothing of the developer's");
            var created = Find(prefab, "node_new");
            Assert.IsNotNull(created);
            Assert.AreEqual("nuevo", created.GetComponent<TMP_Text>().text);
            Assert.Less(created.transform.GetSiblingIndex(), Find(prefab, "node_15").transform.GetSiblingIndex());
            Assert.Greater(created.transform.GetSiblingIndex(), Find(prefab, "node_2").transform.GetSiblingIndex());

            CollectionAssert.AreEqual(new[] { "node_new" }, report.created.Select(e => e.nodeId));
            CollectionAssert.AreEqual(new[] { "node_14" }, report.removed.Select(e => e.nodeId));
            Assert.IsTrue(report.updated.Any(e => e.nodeId == "node_2"));
            var theme = AssetDatabase.LoadAssetAtPath<FormaTheme>(report.themePath);
            Assert.IsTrue(theme.TryGetColor("colors.border", out var border));
            AssertColor("#ff0000", border);
        }

        [Test]
        public void Reimport_KeepsDeveloperComponentsChildrenAndUnmanagedChanges()
        {
            var tree = LoadFixture("grid-equipment");
            var first = ImportTree(tree);
            EditPrefab(first.prefabPath, root =>
            {
                Find(root, "node_16").AddComponent<FormaTestDevMarker>().note = "mio";
                Find(root, "node_16").GetComponent<Button>().interactable = false;
                Find(root, "node_16").GetComponent<Image>().preserveAspect = true;
                var child = new GameObject("DevChild", typeof(RectTransform));
                child.transform.SetParent(Find(root, "node_2").transform, false);
                Get<TMP_Text>(root, "node_3").fontStyle = FontStyles.Italic;
                Get<FormaContextMenu>(root, "node_16").longPressSeconds = 3f;
            });

            Child(Child(Node(tree, "node_16"), "image"), "color")["value"] = "#abcdef";
            Child(Child(Node(tree, "node_16"), "image"), "color").Remove("token");
            Node(tree, "node_2")["name"] = "Otro nombre";
            var prefab = LoadPrefab(ImportTree(tree));

            var slot = Find(prefab, "node_16");
            Assert.AreEqual("mio", slot.GetComponent<FormaTestDevMarker>().note);
            Assert.IsFalse(slot.GetComponent<Button>().interactable);
            Assert.IsTrue(slot.GetComponent<Image>().preserveAspect);
            AssertColor("#abcdef", slot.GetComponent<Image>().color);
            Assert.IsNotNull(Find(prefab, "node_2").transform.Find("DevChild"));
            Assert.AreEqual("Otro nombre", Find(prefab, "node_2").name);
            Assert.AreEqual(FontStyles.Italic, Get<TMP_Text>(prefab, "node_3").fontStyle);
            Assert.AreEqual(3f, slot.GetComponent<FormaContextMenu>().longPressSeconds);
        }

        [Test]
        public void Reimport_RemovedNodeWithDeveloperContent_IsPreservedAndReported()
        {
            var tree = LoadFixture("grid-equipment");
            var first = ImportTree(tree);
            EditPrefab(first.prefabPath, root =>
            {
                Find(root, "node_14").AddComponent<FormaTestDevMarker>();
                var child = new GameObject("DevChild", typeof(RectTransform));
                child.transform.SetParent(Find(root, "node_2").transform, false);
            });
            RemoveNode(tree, "node_14");
            RemoveNode(tree, "node_3");

            var report = ImportTree(tree);
            var prefab = LoadPrefab(report);

            Assert.IsNotNull(Find(prefab, "node_14"), "developer component keeps the node");
            Assert.IsNotNull(Find(prefab, "node_14").GetComponent<FormaTestDevMarker>());
            Assert.IsTrue(Find(prefab, "node_14").activeSelf);
            Assert.IsTrue(report.preserved.Any(e => e.nodeId == "node_14" && e.message.Contains("desarrollador")));
            Assert.IsNull(Find(prefab, "node_3"), "a node holding only Forma content is deleted");
            Assert.IsTrue(report.removed.Any(e => e.nodeId == "node_3"));
            Assert.IsNotNull(Find(prefab, "node_2").transform.Find("DevChild"));
        }

        [Test]
        public void Reimport_RemovedNodeWithDeveloperChild_IsPreserved()
        {
            var tree = LoadFixture("grid-equipment");
            var first = ImportTree(tree);
            EditPrefab(first.prefabPath, root =>
            {
                var child = new GameObject("DevChild", typeof(RectTransform));
                child.transform.SetParent(Find(root, "node_15").transform, false);
            });
            RemoveSubtree(tree, "node_15");

            var report = ImportTree(tree);
            var prefab = LoadPrefab(report);

            Assert.IsNotNull(Find(prefab, "node_15"));
            Assert.IsNotNull(Find(prefab, "node_15").transform.Find("DevChild"));
            Assert.IsTrue(report.preserved.Any(e => e.nodeId == "node_15"));
            Assert.IsNotNull(Find(prefab, "node_16"), "its subtree is left untouched");
        }

        [Test]
        public void Reimport_DeveloperReparentingOfAManagedNode_IsAConflictAndKeepsTheParent()
        {
            var tree = LoadFixture("grid-equipment");
            var first = ImportTree(tree);
            EditPrefab(first.prefabPath, root =>
                Find(root, "node_16").transform.SetParent(Find(root, "node_2").transform, false));

            var report = ImportTree(tree);
            var prefab = LoadPrefab(report);

            Assert.AreSame(Find(prefab, "node_2").transform, Find(prefab, "node_16").transform.parent);
            Assert.IsTrue(report.conflicts.Any(e => e.nodeId == "node_16"));
        }

        [Test]
        public void Reimport_DisappearedManagedPathRemovesWhatWasCreatedForIt()
        {
            var tree = LoadFixture("grid-equipment");
            ImportTree(tree);
            var node = Node(tree, "node_16");
            node.Remove("outline");
            node.Remove("cornerRadius");
            node["components"] = ((List<object>)node["components"]).Cast<Dictionary<string, object>>()
                .Where(c => (string)c["type"] != "FormaSplit").Cast<object>().ToList();
            ((Dictionary<string, object>)tree["managed"])["node_16"] = ((List<object>)((Dictionary<string, object>)tree["managed"])["node_16"])
                .Cast<string>().Where(p => p != "outline" && p != "cornerRadius" && p != "components.FormaSplit").Cast<object>().ToList();

            var slot = Find(LoadPrefab(ImportTree(tree)), "node_16");

            Assert.IsNull(slot.GetComponent<Outline>());
            Assert.IsNull(slot.GetComponent<FormaSplit>());
            Assert.IsNull(slot.GetComponent<Image>().sprite);
            Assert.IsNotNull(slot.GetComponent<FormaDragDrop>());
        }

        [Test]
        public void Reimport_KeepsAHandAssignedSpriteOverTheRoundedOne()
        {
            var tree = LoadFixture("grid-equipment");
            var first = ImportTree(tree);
            var texture = new Texture2D(8, 8);
            File.WriteAllBytes(TempFolder + "/hand.png", texture.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(texture);
            AssetDatabase.ImportAsset(TempFolder + "/hand.png");
            var importer = (TextureImporter)AssetImporter.GetAtPath(TempFolder + "/hand.png");
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.SaveAndReimport();
            var hand = AssetDatabase.LoadAssetAtPath<Sprite>(TempFolder + "/hand.png");
            var generated = Get<Image>(LoadPrefab(first), "node_1").sprite;
            EditPrefab(first.prefabPath, root => Get<Image>(root, "node_16").sprite = hand);

            var report = ImportTree(tree);
            var prefab = LoadPrefab(report);

            Assert.AreSame(hand, Get<Image>(prefab, "node_16").sprite);
            Assert.AreSame(generated, Get<Image>(prefab, "node_1").sprite);
            Assert.IsTrue(report.preserved.Any(e => e.nodeId == "node_16" && e.message.Contains("sprite")));
        }

        // ---- failures and backups ----

        static string[] InvalidBundles()
        {
            var tree = LoadFixture("grid-equipment");
            string Mutated(Action<Dictionary<string, object>> edit)
            {
                var copy = (Dictionary<string, object>)FormaMockParser.ParseJson(Write(tree));
                edit(copy);
                return Write(copy);
            }
            return new[]
            {
                "{ this is not json",
                Mutated(t => t["format"] = "forma.ugui-bundle/v2"),
                Mutated(t => Child(t, "meta")["bundleVersion"] = 2.0),
                Mutated(t => t.Remove("nodes")),
                Mutated(t => Nodes(t).Add(Nodes(t)[0])),
                Mutated(t => Node(t, "node_2")["parentId"] = "missing"),
            };
        }

        [Test]
        public void InvalidBundle_LeavesTheExistingPrefabUntouched([NUnit.Framework.Range(0, 5)] int which)
        {
            var first = ImportTree(LoadFixture("grid-equipment"));
            var before = File.ReadAllBytes(first.prefabPath);
            var backups = Directory.Exists(FormaPrefabImporter.BackupFolderFor(BundlePath))
                ? Directory.GetFiles(FormaPrefabImporter.BackupFolderFor(BundlePath)).Length
                : 0;

            WriteText(InvalidBundles()[which]);
            LogAssert.Expect(LogType.Error, new Regex(@"\[Forma\].*fallida"));
            var report = FormaPrefabImporter.Import(BundlePath);

            Assert.IsFalse(report.Ok);
            Assert.AreEqual(ImportReport.StatusFailed, report.status);
            Assert.IsNotEmpty(report.error);
            CollectionAssert.AreEqual(before, File.ReadAllBytes(first.prefabPath));
            var after = Directory.Exists(FormaPrefabImporter.BackupFolderFor(BundlePath))
                ? Directory.GetFiles(FormaPrefabImporter.BackupFolderFor(BundlePath)).Length
                : 0;
            Assert.AreEqual(backups, after, "a failed import writes no backup");
        }

        [Test]
        public void InvalidBundle_OnFirstImport_CreatesNoPrefab()
        {
            WriteText("{ \"format\": \"forma.ugui-bundle/v2\" }");
            LogAssert.Expect(LogType.Error, new Regex(@"\[Forma\].*fallida"));

            var report = FormaPrefabImporter.Import(BundlePath);

            Assert.IsFalse(report.Ok);
            StringAssert.Contains("forma.ugui-bundle/v1", report.error);
            Assert.IsNull(AssetDatabase.LoadAssetAtPath<GameObject>("Assets/FormaImporterTests/Inventario.prefab"));
        }

        [Test]
        public void Reimport_WritesABackupAndKeepsTheLastThree()
        {
            var tree = LoadFixture("grid-equipment");
            ImportTree(tree);
            var folder = FormaPrefabImporter.BackupFolderFor(BundlePath);
            Assert.IsFalse(Directory.Exists(folder) && Directory.GetFiles(folder).Length > 0, "no backup on first import");

            var report = ImportTree(tree);
            Assert.AreEqual(1, Directory.GetFiles(folder, "Inventario-*.prefab").Length);
            StringAssert.StartsWith(folder, report.backupPath);
            Assert.IsTrue(File.Exists(report.backupPath));

            for (var i = 0; i < 4; i++) ImportTree(tree);
            Assert.AreEqual(3, Directory.GetFiles(folder, "Inventario-*.prefab").Length);
        }

        // ---- automatic trigger ----

        [Test]
        public void IsBundlePath_OnlyMatchesFormaJsonUnderAssets()
        {
            Assert.IsTrue(FormaBundlePostprocessor.IsBundlePath("Assets/FormaStudio/Generated/Inventario.forma.json"));
            Assert.IsFalse(FormaBundlePostprocessor.IsBundlePath("Assets/FormaStudio/Generated/Inventario.json"));
            Assert.IsFalse(FormaBundlePostprocessor.IsBundlePath("Assets/FormaStudio/Generated/Inventario.import-report.json"));
            Assert.IsFalse(FormaBundlePostprocessor.IsBundlePath("Packages/com.forma.studio/Tests/Editor/Fixtures/tabs.forma.json"));
        }

        [UnityTest]
        public IEnumerator Postprocessor_ImportsAnImportedBundleOnceTheImportHasFinished()
        {
            FormaBundlePostprocessor.Enabled = true;
            WriteBundle(LoadFixture("grid-equipment"));
            Assert.IsNull(AssetDatabase.LoadAssetAtPath<GameObject>("Assets/FormaImporterTests/Inventario.prefab"),
                "nothing is created from inside OnPostprocessAllAssets");

            for (var frame = 0; frame < 300 && AssetDatabase.LoadAssetAtPath<GameObject>("Assets/FormaImporterTests/Inventario.prefab") == null; frame++)
                yield return null;

            Assert.IsNotNull(AssetDatabase.LoadAssetAtPath<GameObject>("Assets/FormaImporterTests/Inventario.prefab"));
            Assert.IsTrue(FormaPrefabImporter.IsUpToDate(BundlePath));
        }

        [Test]
        public void IsUpToDate_FalseOnceTheBundleChanges()
        {
            var tree = LoadFixture("grid-equipment");
            Assert.IsFalse(FormaPrefabImporter.IsUpToDate(BundlePath), "no bundle yet");
            ImportTree(tree);
            Assert.IsTrue(FormaPrefabImporter.IsUpToDate(BundlePath));

            Node(tree, "node_2")["name"] = "Distinto";
            WriteBundle(tree);
            Assert.IsFalse(FormaPrefabImporter.IsUpToDate(BundlePath));
        }

        // ---- canvas and play simulation ----

        [Test]
        public void CreateCanvas_UsesScaleWithScreenSizeAndAnEventSystem()
        {
            var canvas = FormaCanvasBuilder.CreateCanvas(new Vector2(1280, 720));
            sceneObjects.Add(canvas.gameObject);

            Assert.AreEqual(RenderMode.ScreenSpaceOverlay, canvas.renderMode);
            var scaler = canvas.GetComponent<CanvasScaler>();
            Assert.AreEqual(CanvasScaler.ScaleMode.ScaleWithScreenSize, scaler.uiScaleMode);
            Assert.AreEqual(new Vector2(1280, 720), scaler.referenceResolution);
            Assert.AreEqual(0.5f, scaler.matchWidthOrHeight);
            Assert.IsNotNull(canvas.GetComponent<GraphicRaycaster>());
            var eventSystem = UnityEngine.Object.FindFirstObjectByType<EventSystem>();
            Assert.IsNotNull(eventSystem);
            Assert.IsNotNull(eventSystem.GetComponent<BaseInputModule>());
        }

        [Test]
        public void PrefabUnderACanvas_RefreshShowsMockItemsAndQuantities()
        {
            var report = ImportTree(LoadFixture("grid-equipment"));

            var canvas = FormaCanvasBuilder.CreateCanvas(new Vector2(1920, 1080));
            sceneObjects.Add(canvas.gameObject);
            var instance = FormaCanvasBuilder.InstantiateInCanvas(LoadPrefab(report), canvas);
            var screen = instance.GetComponent<FormaScreen>();
            screen.Refresh();

            var view = Find(instance, "node_17").GetComponent<FormaItemView>();
            Assert.IsNotNull(view.Record, "the first slot shows the first mock item");
            var mock = FormaMockParser.ParseBundle(File.ReadAllText(BundlePath))["inventory.items"];
            Assert.IsTrue(mock.Any(r => r.Id == view.Record.Id || r.GetString("name") == view.Record.GetString("name")));
            Assert.IsNotNull(view.quantityText, "the quantity text is linked");
            Assert.AreSame(Find(instance, "node_17/quantity").GetComponent<TMP_Text>(), view.quantityText);
            Assert.AreEqual("×" + view.Record.GetInt("quantity"), view.quantityText.text);
            Assert.IsTrue(view.icon.enabled);
            var emptyViews = instance.GetComponentsInChildren<FormaItemView>(true).Count(v => v.Record == null);
            Assert.Greater(emptyViews, 0, "slots beyond the mock rows stay empty");
        }
    }
}
