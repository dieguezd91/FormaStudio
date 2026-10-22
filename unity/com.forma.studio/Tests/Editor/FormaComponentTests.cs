using System;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Forma.Studio.Editor.Tests
{
    public class FormaComponentTests
    {
        readonly List<GameObject> created = new List<GameObject>();

        [TearDown]
        public void TearDown()
        {
            foreach (var go in created) if (go != null) UnityEngine.Object.DestroyImmediate(go);
            created.Clear();
        }

        GameObject Make(string name, Transform parent = null)
        {
            var go = new GameObject(name, typeof(RectTransform));
            if (parent != null) go.transform.SetParent(parent, false);
            else created.Add(go);
            return go;
        }

        sealed class FakeSource : IFormaDataSource
        {
            public string Id => "inventory.items";
            public event Action Changed;
            public List<FormaRecord> Rows = new List<FormaRecord>();
            public Dictionary<string, FormaRecord> Equipped = new Dictionary<string, FormaRecord>();
            public IReadOnlyList<FormaRecord> GetView(FormaBinding view) => Rows;
            public FormaRecord GetEquipped(string id) => Equipped.TryGetValue(id, out var r) ? r : null;
            public void Raise() => Changed?.Invoke();
        }

        sealed class RecordingHandler : IFormaIntentHandler
        {
            public readonly List<FormaIntent> Received = new List<FormaIntent>();
            public bool Accept = true;
            public FormaIntentResult Handle(FormaIntent intent)
            {
                Received.Add(intent);
                return Accept ? FormaIntentResult.Accept() : FormaIntentResult.Reject("no");
            }
        }

        static FormaRecord Potion(int quantity = 5) => new FormaRecord("r1", new Dictionary<string, object>
        {
            ["id"] = "pocion", ["name"] = "Poción", ["quantity"] = (double)quantity, ["slotType"] = "none",
            ["category"] = "Consumibles",
        });

        // ---- FormaTabs ----

        [Test]
        public void Tabs_ShowOnlyTheInitialContent_AndSwitchOnSelect()
        {
            var root = Make("tabs");
            var tabs = root.AddComponent<FormaTabs>();
            var buttons = new List<Button>();
            var contents = new List<GameObject>();
            foreach (var id in new[] { "a", "b", "c" })
            {
                buttons.Add(Make("btn-" + id, root.transform).AddComponent<Button>());
                contents.Add(Make("content-" + id, root.transform));
                tabs.tabs.Add(new FormaTabs.Entry { id = id, label = id.ToUpperInvariant(), button = buttons[^1], content = contents[^1] });
            }
            tabs.initialTabId = "b";

            tabs.Initialize();

            Assert.AreEqual("b", tabs.ActiveTabId);
            Assert.AreEqual(new[] { false, true, false }, new[] { contents[0].activeSelf, contents[1].activeSelf, contents[2].activeSelf });

            Assert.IsTrue(tabs.Select("c"));
            Assert.AreEqual(new[] { false, false, true }, new[] { contents[0].activeSelf, contents[1].activeSelf, contents[2].activeSelf });

            buttons[0].onClick.Invoke();
            Assert.AreEqual("a", tabs.ActiveTabId, "clicking the tab button selects its tab");
            Assert.IsTrue(contents[0].activeSelf);
            Assert.IsFalse(contents[2].activeSelf);
        }

        [Test]
        public void Tabs_UnknownTab_IsIgnored()
        {
            var root = Make("tabs");
            var tabs = root.AddComponent<FormaTabs>();
            var content = Make("content", root.transform);
            tabs.tabs.Add(new FormaTabs.Entry { id = "a", content = content });
            tabs.initialTabId = "a";
            tabs.Initialize();

            Assert.IsFalse(tabs.Select("zzz"));
            Assert.AreEqual("a", tabs.ActiveTabId);
            Assert.IsTrue(content.activeSelf);
        }

        [Test]
        public void Tabs_FallBackToTheFirstTabWhenInitialIsMissing()
        {
            var root = Make("tabs");
            var tabs = root.AddComponent<FormaTabs>();
            tabs.tabs.Add(new FormaTabs.Entry { id = "a", content = Make("ca", root.transform) });
            tabs.tabs.Add(new FormaTabs.Entry { id = "b", content = Make("cb", root.transform) });

            tabs.Initialize();

            Assert.AreEqual("a", tabs.ActiveTabId);
        }

        // ---- FormaSelectable ----

        [Test]
        public void Selectable_SingleModeKeepsOneSelectedPerParent()
        {
            var parent = Make("grid");
            var a = Make("a", parent.transform).AddComponent<FormaSelectable>();
            var b = Make("b", parent.transform).AddComponent<FormaSelectable>();
            var other = Make("other", Make("grid2").transform).AddComponent<FormaSelectable>();

            other.Select(false);
            a.Select(false);
            b.Select(true);

            Assert.IsFalse(a.IsSelected);
            Assert.IsTrue(b.IsSelected);
            Assert.IsTrue(other.IsSelected, "another parent is another scope");
        }

        [Test]
        public void Selectable_MultiModeTogglesWhenAdditive()
        {
            var parent = Make("grid");
            var a = Make("a", parent.transform).AddComponent<FormaSelectable>();
            var b = Make("b", parent.transform).AddComponent<FormaSelectable>();
            a.mode = b.mode = FormaSelectable.SelectionMode.Multi;

            a.Select(false);
            b.Select(true);
            Assert.IsTrue(a.IsSelected && b.IsSelected);

            a.Select(true);
            Assert.IsFalse(a.IsSelected);
            Assert.IsTrue(b.IsSelected);

            a.Select(false);
            Assert.IsTrue(a.IsSelected);
            Assert.IsFalse(b.IsSelected, "a plain click replaces the selection");
        }

        // ---- Layout and the simulated source ----

        [Test]
        public void SimLayout_ReadsSlotsDragDropStackAndEquipmentFromComponents()
        {
            var root = Make("screen");
            var bag = Make("bag", root.transform);
            bag.AddComponent<FormaStack>().maxStack = 20;
            var slot = Make("slot0", bag.transform);
            slot.AddComponent<FormaId>().nodeId = "n-slot0";
            var slotComponent = slot.AddComponent<FormaSlot>();
            slotComponent.binding = new FormaBinding("inventory.items", "items", 0, new FormaFilter("category", "Consumibles"));
            var dd = slot.AddComponent<FormaDragDrop>();
            dd.role = FormaDragRole.Both;
            dd.accepts = new[] { "item" };

            var eq = Make("head", root.transform);
            eq.AddComponent<FormaId>().nodeId = "n-head";
            eq.AddComponent<FormaSlot>().binding = new FormaBinding("inventory.items", "items", 0, new FormaFilter("category", "Armaduras"));
            eq.AddComponent<FormaEquipmentSlot>().slotType = "head";
            eq.AddComponent<FormaDragDrop>().role = FormaDragRole.Target;

            var layout = FormaSimLayout.Build(root.transform);

            Assert.AreEqual(2, layout.Count);
            var s = layout[0];
            Assert.AreEqual("n-slot0", s.NodeId);
            Assert.AreEqual("inventory.items", s.DataSourceId);
            Assert.AreEqual("items", s.Root);
            Assert.AreEqual(0, s.Index);
            Assert.AreEqual("Consumibles", s.Filters[0].value);
            Assert.AreEqual(20, s.MaxStack, "the nearest FormaStack up the hierarchy applies");
            Assert.IsTrue(s.HasDragDrop);
            Assert.AreEqual(new[] { "item" }, s.Accepts);
            Assert.IsFalse(s.IsEquipment);

            var e = layout[1];
            Assert.IsTrue(e.IsEquipment);
            Assert.AreEqual("head", e.EquipmentSlotType);
            Assert.AreEqual(FormaDragRole.Target, e.Role);
        }

        [Test]
        public void SimulatedSource_HandlesIntentsAndNotifiesChanges()
        {
            var root = Make("screen");
            for (var i = 0; i < 3; i++)
            {
                var slot = Make("slot" + i, root.transform);
                slot.AddComponent<FormaId>().nodeId = "s" + i;
                slot.AddComponent<FormaSlot>().binding = new FormaBinding("inventory.items", "items", i);
                slot.AddComponent<FormaDragDrop>().role = FormaDragRole.Both;
            }
            var source = root.AddComponent<FormaSimulatedInventorySource>();
            source.LoadMockJson("inventory.items", @"[ { ""id"": ""a"", ""quantity"": 1, ""maxStack"": 1 }, { ""id"": ""b"", ""quantity"": 1, ""maxStack"": 1 } ]");
            source.Initialize();
            var changes = 0;
            source.Changed += () => changes++;

            var rejected = source.Handle(FormaIntent.Create(FormaIntentNames.MoveItem, ("itemId", "a"), ("fromSlot", "s2"), ("toSlot", "s1")));
            Assert.IsFalse(rejected.Accepted);
            Assert.AreEqual(0, changes, "a rejection changes nothing");

            var ok = source.Handle(FormaIntent.Create(FormaIntentNames.MoveItem, ("itemId", "a"), ("fromSlot", "s0"), ("toSlot", "s2")));
            Assert.IsTrue(ok.Accepted, ok.Reason);
            Assert.AreEqual(1, changes);

            var view = source.GetView(new FormaBinding("inventory.items", "items"));
            Assert.AreEqual(new[] { null, "b", "a" }, new[] { view[0]?.Id, view[1]?.Id, view[2]?.Id });

            source.ResetSimulation();
            Assert.AreEqual(2, changes);
            Assert.AreEqual("a", source.GetView(new FormaBinding("inventory.items", "items"))[0].Id);
            Assert.IsTrue(source.Label.Contains("simulad"), "the source labels itself as simulated");
        }

        // ---- FormaScreen ----

        [Test]
        public void Screen_RaisesIntentsThroughTheHandlerAndReportsThem()
        {
            var screen = Make("screen").AddComponent<FormaScreen>();
            var handler = new RecordingHandler();
            screen.SetIntentHandler(handler);
            var seen = new List<(FormaIntent, FormaIntentResult)>();
            screen.OnIntent.AddListener((i, r) => seen.Add((i, r)));

            var result = screen.Raise(FormaIntent.Create("inventory.useItem", ("actionId", "use"), ("slotId", "s0")));

            Assert.IsTrue(result.Accepted);
            Assert.AreEqual(1, handler.Received.Count);
            Assert.AreEqual(1, seen.Count);
            Assert.AreEqual("inventory.useItem", seen[0].Item1.Name);
        }

        [Test]
        public void Screen_WithoutHandler_RejectsAndStillReports()
        {
            var screen = Make("screen").AddComponent<FormaScreen>();
            var reported = 0;
            screen.OnIntent.AddListener((i, r) => reported++);

            var result = screen.Raise(FormaIntent.Create("inventory.useItem"));

            Assert.IsFalse(result.Accepted);
            Assert.AreEqual("Sin manejador: nadie atiende «inventory.useItem».", result.Reason);
            Assert.AreEqual(1, reported);
        }

        [Test]
        public void Screen_RefreshesSlotsWhenTheSourceChanges()
        {
            var screen = Make("screen").AddComponent<FormaScreen>();
            var slot = Make("slot", screen.transform).AddComponent<FormaSlot>();
            slot.binding = new FormaBinding("inventory.items", "items", 0);
            var source = new FakeSource { Rows = new List<FormaRecord> { Potion() } };
            screen.SetDataSource(source);
            Assert.AreEqual("pocion", slot.Record?.Id);

            source.Rows = new List<FormaRecord> { null };
            source.Raise();

            Assert.IsNull(slot.Record);
        }

        [Test]
        public void Screen_EquipmentSlotReadsTheEquippedRecord()
        {
            var screen = Make("screen").AddComponent<FormaScreen>();
            var go = Make("eq", screen.transform);
            go.AddComponent<FormaId>().nodeId = "n-head";
            go.AddComponent<FormaEquipmentSlot>().slotType = "head";
            var slot = go.AddComponent<FormaSlot>();
            slot.binding = new FormaBinding("inventory.items", "items", 0);
            screen.SetDataSource(new FakeSource { Equipped = { ["n-head"] = Potion() } });

            Assert.AreEqual("pocion", slot.Record?.Id);
        }

        // ---- FormaDragDrop ----

        (FormaScreen screen, GameObject source, FormaDragDrop target, RecordingHandler handler) DragFixture(bool equipmentTarget = false)
        {
            var screen = Make("screen").AddComponent<FormaScreen>();
            var handler = new RecordingHandler();
            screen.SetIntentHandler(handler);

            var src = Make("src", screen.transform);
            src.AddComponent<FormaId>().nodeId = "s0";
            src.AddComponent<FormaSlot>().binding = new FormaBinding("inventory.items", "items", 0);
            var srcDrag = src.AddComponent<FormaDragDrop>();
            srcDrag.role = FormaDragRole.Source;
            srcDrag.intent = FormaIntentNames.MoveItem;

            var dst = Make("dst", screen.transform);
            dst.AddComponent<FormaId>().nodeId = "s1";
            dst.AddComponent<FormaSlot>().binding = new FormaBinding("inventory.items", "items", 1);
            if (equipmentTarget) dst.AddComponent<FormaEquipmentSlot>().slotType = "head";
            var dstDrag = dst.AddComponent<FormaDragDrop>();
            dstDrag.role = FormaDragRole.Target;
            dstDrag.intent = equipmentTarget ? FormaIntentNames.EquipItem : FormaIntentNames.MoveItem;

            screen.SetDataSource(new FakeSource { Rows = new List<FormaRecord> { Potion(), null } });
            return (screen, src, dstDrag, handler);
        }

        [Test]
        public void DragDrop_DropRaisesTheIntentWithTheDocumentedPayload()
        {
            var (_, src, target, handler) = DragFixture();

            target.OnDrop(new PointerEventData(null) { pointerDrag = src });

            Assert.AreEqual(1, handler.Received.Count);
            var intent = handler.Received[0];
            Assert.AreEqual("inventory.moveItem", intent.Name);
            Assert.AreEqual("pocion", intent.Payload["itemId"]);
            Assert.AreEqual("s0", intent.Payload["fromSlot"]);
            Assert.AreEqual("s1", intent.Payload["toSlot"]);
            Assert.IsFalse(intent.Payload.ContainsKey("slotType"));
        }

        [Test]
        public void DragDrop_DropOnEquipmentSlotAddsTheSlotType()
        {
            var (_, src, target, handler) = DragFixture(equipmentTarget: true);

            target.OnDrop(new PointerEventData(null) { pointerDrag = src });

            Assert.AreEqual("inventory.equipItem", handler.Received[0].Name);
            Assert.AreEqual("head", handler.Received[0].Payload["slotType"]);
        }

        [Test]
        public void DragDrop_IgnoresDropsFromEmptySlotsTargetOnlySourcesAndSelf()
        {
            var (screen, src, target, handler) = DragFixture();

            target.OnDrop(new PointerEventData(null) { pointerDrag = target.gameObject });
            Assert.AreEqual(0, handler.Received.Count, "dropping on itself");

            target.OnDrop(new PointerEventData(null) { pointerDrag = null });
            Assert.AreEqual(0, handler.Received.Count, "no drag in progress");

            src.GetComponent<FormaDragDrop>().role = FormaDragRole.Target;
            target.OnDrop(new PointerEventData(null) { pointerDrag = src });
            Assert.AreEqual(0, handler.Received.Count, "a target-only node cannot be dragged");

            src.GetComponent<FormaDragDrop>().role = FormaDragRole.Source;
            target.role = FormaDragRole.Source;
            target.OnDrop(new PointerEventData(null) { pointerDrag = src });
            Assert.AreEqual(0, handler.Received.Count, "a source-only node cannot receive");

            target.role = FormaDragRole.Target;
            screen.SetDataSource(new FakeSource { Rows = new List<FormaRecord> { null, null } });
            target.OnDrop(new PointerEventData(null) { pointerDrag = src });
            Assert.AreEqual(0, handler.Received.Count, "the source slot is empty");
        }

        [Test]
        public void DragDrop_PreviewUsesAcceptsTagsWhenTheSourceCannotValidate()
        {
            var (_, src, target, _) = DragFixture();
            var item = src.GetComponent<FormaSlot>().Record;

            target.accepts = new[] { "item" };
            Assert.IsTrue(target.Preview(item).Accepted);
            target.accepts = new[] { "Consumibles" };
            Assert.IsTrue(target.Preview(item).Accepted);
            target.accepts = new[] { "weapon" };
            Assert.IsFalse(target.Preview(item).Accepted);
            target.accepts = Array.Empty<string>();
            Assert.IsTrue(target.Preview(item).Accepted, "empty accepts takes everything");
        }

        // ---- Tooltip suppression ----

        [Test]
        public void Tooltip_IsSuppressedWhileDraggingOrAMenuIsOpen()
        {
            var screen = Make("screen").AddComponent<FormaScreen>();
            var slot = Make("slot", screen.transform);
            slot.AddComponent<FormaSlot>().binding = new FormaBinding("inventory.items", "items", 0);
            var tooltip = slot.AddComponent<FormaTooltip>();
            var panel = Make("panel", screen.transform);
            tooltip.panel = panel.GetComponent<RectTransform>();
            screen.SetDataSource(new FakeSource { Rows = new List<FormaRecord> { Potion() } });

            tooltip.Show(Vector2.zero);
            Assert.IsTrue(panel.activeSelf);

            screen.SetDragging(true);
            Assert.IsFalse(panel.activeSelf, "starting a drag hides it");
            tooltip.Show(Vector2.zero);
            Assert.IsFalse(panel.activeSelf);

            screen.SetDragging(false);
            screen.SetMenuOpen(true);
            tooltip.Show(Vector2.zero);
            Assert.IsFalse(panel.activeSelf);

            screen.SetMenuOpen(false);
            tooltip.Show(Vector2.zero);
            Assert.IsTrue(panel.activeSelf);
        }

        [Test]
        public void Tooltip_HasNothingToShowOnAnEmptySlot()
        {
            var screen = Make("screen").AddComponent<FormaScreen>();
            var slot = Make("slot", screen.transform);
            slot.AddComponent<FormaSlot>().binding = new FormaBinding("inventory.items", "items", 0);
            var tooltip = slot.AddComponent<FormaTooltip>();
            tooltip.panel = Make("panel", screen.transform).GetComponent<RectTransform>();
            screen.SetDataSource(new FakeSource { Rows = new List<FormaRecord> { null } });

            tooltip.Show(Vector2.zero);

            Assert.IsFalse(tooltip.panel.gameObject.activeSelf);
        }

        // ---- Context menu ----

        [Test]
        public void ContextMenu_ActionPayloadCarriesSlotAndItemId()
        {
            var screen = Make("screen").AddComponent<FormaScreen>();
            var handler = new RecordingHandler();
            screen.SetIntentHandler(handler);
            var slot = Make("slot", screen.transform);
            slot.AddComponent<FormaId>().nodeId = "s0";
            slot.AddComponent<FormaSlot>().binding = new FormaBinding("inventory.items", "items", 0);
            var menu = slot.AddComponent<FormaContextMenu>();
            menu.actions.Add(new FormaContextMenu.Action { id = "use", label = "Usar", intent = FormaIntentNames.UseItem });
            screen.SetDataSource(new FakeSource { Rows = new List<FormaRecord> { Potion() } });

            menu.Invoke(menu.actions[0]);

            var intent = handler.Received[0];
            Assert.AreEqual("inventory.useItem", intent.Name);
            Assert.AreEqual("use", intent.Payload["actionId"]);
            Assert.AreEqual("s0", intent.Payload["slotId"]);
            Assert.AreEqual("pocion", intent.Payload["itemId"]);
        }

        [Test]
        public void ContextMenu_SplitActionOpensTheDialogInsteadOfRaising()
        {
            var screen = Make("screen").AddComponent<FormaScreen>();
            var handler = new RecordingHandler();
            screen.SetIntentHandler(handler);
            var slot = Make("slot", screen.transform);
            slot.AddComponent<FormaId>().nodeId = "s0";
            slot.AddComponent<FormaSlot>().binding = new FormaBinding("inventory.items", "items", 0);
            slot.AddComponent<FormaSplit>().intent = FormaIntentNames.SplitStack;
            var dialog = Make("dialog", screen.transform).AddComponent<FormaSplitDialog>();
            slot.GetComponent<FormaSplit>().dialog = dialog;
            var menu = slot.AddComponent<FormaContextMenu>();
            menu.actions.Add(new FormaContextMenu.Action { id = "split", label = "Dividir", intent = FormaIntentNames.SplitStack });
            screen.SetDataSource(new FakeSource { Rows = new List<FormaRecord> { Potion(5) } });

            menu.Invoke(menu.actions[0]);

            Assert.AreEqual(0, handler.Received.Count);
            Assert.IsTrue(dialog.IsOpen);
            Assert.AreEqual(4, dialog.Max, "max = quantity - 1");
            Assert.IsTrue(screen.IsSplitOpen);

            dialog.SetAmount(3);
            dialog.Confirm();

            var intent = handler.Received[0];
            Assert.AreEqual("inventory.splitStack", intent.Name);
            Assert.AreEqual("pocion", intent.Payload["itemId"]);
            Assert.AreEqual(3, intent.Payload["amount"]);
            Assert.AreEqual("s0", intent.Payload["slotId"]);
            Assert.IsFalse(dialog.IsOpen);
            Assert.IsFalse(screen.IsSplitOpen);
        }

        [Test]
        public void ContextMenu_SplitIsDisabledOnAStackOfOne()
        {
            var screen = Make("screen").AddComponent<FormaScreen>();
            var slot = Make("slot", screen.transform);
            slot.AddComponent<FormaId>().nodeId = "s0";
            slot.AddComponent<FormaSlot>().binding = new FormaBinding("inventory.items", "items", 0);
            slot.AddComponent<FormaSplit>().intent = FormaIntentNames.SplitStack;
            var menu = slot.AddComponent<FormaContextMenu>();
            var split = new FormaContextMenu.Action { id = "split", label = "Dividir", intent = FormaIntentNames.SplitStack };
            var use = new FormaContextMenu.Action { id = "use", label = "Usar", intent = FormaIntentNames.UseItem };
            menu.actions.Add(split);
            menu.actions.Add(use);
            screen.SetDataSource(new FakeSource { Rows = new List<FormaRecord> { Potion(1) } });

            Assert.IsTrue(menu.IsDisabled(split));
            Assert.IsFalse(menu.IsDisabled(use));
        }

        [Test]
        public void Cancel_ClosesTheSplitDialogBeforeTheMenuBeforeTheDrag()
        {
            var screen = Make("screen").AddComponent<FormaScreen>();
            screen.SetDragging(true);
            screen.SetMenuOpen(true);
            screen.SetSplitOpen(true);

            screen.Cancel();
            Assert.IsFalse(screen.IsSplitOpen);
            Assert.IsTrue(screen.IsMenuOpen);

            screen.Cancel();
            Assert.IsFalse(screen.IsMenuOpen);
            Assert.IsTrue(screen.IsDragging);

            screen.Cancel();
            Assert.IsFalse(screen.IsDragging);
        }

        // ---- Theme and icons ----

        [Test]
        public void Theme_ParsesHexAndRethemesBoundGraphics()
        {
            Assert.IsTrue(FormaTheme.TryParseHex("#ff8000", out var c));
            Assert.AreEqual(1f, c.r, 0.01f);
            Assert.AreEqual(0.5f, c.g, 0.01f);
            Assert.AreEqual(1f, c.a, 0.01f);
            Assert.IsTrue(FormaTheme.TryParseHex("#00000080", out var half));
            Assert.AreEqual(128f / 255f, half.a, 0.01f);
            Assert.IsFalse(FormaTheme.TryParseHex("nope", out _));

            var theme = ScriptableObject.CreateInstance<FormaTheme>();
            theme.SetColor("colors.surface", new Color(0.1f, 0.2f, 0.3f, 1f));
            var go = Make("img");
            var image = go.AddComponent<Image>();
            var binding = go.AddComponent<FormaThemeBinding>();
            binding.theme = theme;
            binding.colorToken = "colors.surface";

            binding.Apply();
            Assert.AreEqual(0.2f, image.color.g, 0.001f);

            theme.SetColor("colors.surface", Color.red);
            binding.Apply();
            Assert.AreEqual(Color.red, image.color);

            UnityEngine.Object.DestroyImmediate(theme);
        }

        [Test]
        public void IconProvider_MapsKeysAndFallsBackToAStableColorAndInitial()
        {
            var provider = ScriptableObject.CreateInstance<FormaIconProvider>();
            var texture = new Texture2D(2, 2);
            var sprite = Sprite.Create(texture, new Rect(0, 0, 2, 2), Vector2.zero);
            provider.Add("mock/icons/a.png", sprite);

            Assert.AreSame(sprite, provider.Get("mock/icons/a.png"));
            Assert.IsNull(provider.Get("mock/icons/b.png"));
            Assert.AreEqual(FormaIconProvider.FallbackColor("espada"), FormaIconProvider.FallbackColor("espada"));
            Assert.AreNotEqual(FormaIconProvider.FallbackColor("espada"), FormaIconProvider.FallbackColor("arco"));
            Assert.AreEqual("P", FormaIconProvider.Initial("poción"));
            Assert.AreEqual("?", FormaIconProvider.Initial(null));

            UnityEngine.Object.DestroyImmediate(sprite);
            UnityEngine.Object.DestroyImmediate(texture);
            UnityEngine.Object.DestroyImmediate(provider);
        }
    }
}
