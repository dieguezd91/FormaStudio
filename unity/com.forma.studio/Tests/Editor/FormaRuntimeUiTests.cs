using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Forma.Studio.Editor.Tests
{
    /// <summary>The UI Forma builds at runtime (menu, split dialog, tooltip, drag ghost), exercised under a real Canvas.</summary>
    public class FormaRuntimeUiTests
    {
        readonly List<GameObject> created = new List<GameObject>();
        Canvas canvas;
        FormaScreen screen;
        FormaSlot slot;

        sealed class Source : IFormaDataSource
        {
            public string Id => "inventory.items";
            public event System.Action Changed { add { } remove { } }
            public List<FormaRecord> Rows = new List<FormaRecord>();
            public IReadOnlyList<FormaRecord> GetView(FormaBinding view) => Rows;
            public FormaRecord GetEquipped(string id) => null;
        }

        sealed class Handler : IFormaIntentHandler
        {
            public readonly List<FormaIntent> Received = new List<FormaIntent>();
            public FormaIntentResult Handle(FormaIntent intent)
            {
                Received.Add(intent);
                return FormaIntentResult.Accept();
            }
        }

        [SetUp]
        public void SetUp()
        {
            var canvasGo = new GameObject("Canvas", typeof(RectTransform), typeof(Canvas));
            created.Add(canvasGo);
            canvas = canvasGo.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var screenGo = new GameObject("Screen", typeof(RectTransform));
            screenGo.transform.SetParent(canvasGo.transform, false);
            screen = screenGo.AddComponent<FormaScreen>();

            var slotGo = new GameObject("slot", typeof(RectTransform));
            slotGo.transform.SetParent(screenGo.transform, false);
            ((RectTransform)slotGo.transform).sizeDelta = new Vector2(48, 48);
            slotGo.AddComponent<FormaId>().nodeId = "s0";
            slot = slotGo.AddComponent<FormaSlot>();
            slot.binding = new FormaBinding("inventory.items", "items", 0);
        }

        [TearDown]
        public void TearDown()
        {
            foreach (var go in created) if (go != null) Object.DestroyImmediate(go);
            created.Clear();
        }

        static FormaRecord Potion(int quantity) => new FormaRecord("r1", new Dictionary<string, object>
        {
            ["id"] = "pocion", ["name"] = "Poción", ["quantity"] = (double)quantity, ["category"] = "Consumibles", ["rarity"] = "común",
        });

        void Show(FormaRecord record, Handler handler = null)
        {
            if (handler != null) screen.SetIntentHandler(handler);
            screen.SetDataSource(new Source { Rows = new List<FormaRecord> { record } });
        }

        int CanvasChildren => canvas.transform.childCount;

        [Test]
        public void ContextMenu_BuildsOneButtonPerActionAndTearsDownOnClose()
        {
            Show(Potion(1));
            slot.gameObject.AddComponent<FormaSplit>();
            var menu = slot.gameObject.AddComponent<FormaContextMenu>();
            menu.actions.Add(new FormaContextMenu.Action { id = "use", label = "Usar", intent = FormaIntentNames.UseItem });
            menu.actions.Add(new FormaContextMenu.Action { id = "split", label = "Dividir", intent = FormaIntentNames.SplitStack });
            var before = CanvasChildren;

            menu.Open(new Vector2(10, 10));

            Assert.IsTrue(menu.IsOpen);
            Assert.IsTrue(screen.IsMenuOpen);
            Assert.AreEqual(before + 2, CanvasChildren, "a blocker and the panel");
            var buttons = canvas.GetComponentsInChildren<Button>();
            Assert.AreEqual(3, buttons.Length, "blocker + 2 actions");
            var actionButtons = buttons.Where(b => b.GetComponentInChildren<TMP_Text>() != null).ToArray();
            Assert.IsTrue(actionButtons[0].interactable);
            Assert.IsFalse(actionButtons[1].interactable, "Dividir is disabled on a stack of one");

            menu.Close();

            Assert.IsFalse(menu.IsOpen);
            Assert.IsFalse(screen.IsMenuOpen);
            Assert.AreEqual(before, CanvasChildren);
        }

        [Test]
        public void ContextMenu_CancelClosesTheMenu()
        {
            Show(Potion(3));
            var menu = slot.gameObject.AddComponent<FormaContextMenu>();
            menu.actions.Add(new FormaContextMenu.Action { id = "use", label = "Usar", intent = FormaIntentNames.UseItem });
            menu.Open(Vector2.zero);

            var panelButton = canvas.GetComponentsInChildren<Button>().Last();
            panelButton.GetComponent<FormaCancelRelay>().OnCancel(new BaseEventData(null));

            Assert.IsFalse(menu.IsOpen, "Cancel on a menu entry reaches the screen through the screen link");
            Assert.IsFalse(screen.IsMenuOpen);
        }

        [Test]
        public void Slot_ReusesAnExistingButtonAsItsSelectable()
        {
            var go = new GameObject("slot2", typeof(RectTransform), typeof(Image), typeof(Button));
            go.transform.SetParent(screen.transform, false);

            go.AddComponent<FormaSlot>();

            Assert.AreEqual(1, go.GetComponents<Selectable>().Length);
        }

        [Test]
        public void ContextMenu_DoesNotOpenOnAnEmptySlot()
        {
            Show(null);
            var menu = slot.gameObject.AddComponent<FormaContextMenu>();
            menu.actions.Add(new FormaContextMenu.Action { id = "use", label = "Usar", intent = FormaIntentNames.UseItem });

            menu.Open(Vector2.zero);

            Assert.IsFalse(menu.IsOpen);
            Assert.IsFalse(screen.IsMenuOpen);
        }

        [Test]
        public void ContextMenu_OnlyReactsToItsOwnTrigger()
        {
            Show(Potion(3));
            var menu = slot.gameObject.AddComponent<FormaContextMenu>();
            menu.actions.Add(new FormaContextMenu.Action { id = "use", label = "Usar", intent = FormaIntentNames.UseItem });
            menu.trigger = FormaContextMenu.MenuTrigger.SecondaryClick;

            menu.OnPointerClick(new PointerEventData(null) { button = PointerEventData.InputButton.Left });
            Assert.IsFalse(menu.IsOpen, "left click does not open a secondary-click menu");

            menu.OnPointerClick(new PointerEventData(null) { button = PointerEventData.InputButton.Right });
            Assert.IsTrue(menu.IsOpen);
            menu.Close();

            menu.trigger = FormaContextMenu.MenuTrigger.Button;
            menu.OnPointerClick(new PointerEventData(null) { button = PointerEventData.InputButton.Right });
            Assert.IsFalse(menu.IsOpen);
            menu.OnPointerClick(new PointerEventData(null) { button = PointerEventData.InputButton.Left });
            Assert.IsTrue(menu.IsOpen);
        }

        [Test]
        public void SplitDialog_DefaultDialogConfirmsTheChosenAmount()
        {
            var handler = new Handler();
            Show(Potion(5), handler);
            var split = slot.gameObject.AddComponent<FormaSplit>();

            Assert.IsTrue(split.Open(slot));

            var dialog = screen.GetDefaultSplitDialog();
            Assert.IsTrue(dialog.IsOpen);
            Assert.AreEqual(1, dialog.slider.minValue);
            Assert.AreEqual(4, dialog.slider.maxValue);
            dialog.slider.value = 3; // moves the slider like the player would
            Assert.AreEqual(3, dialog.Amount);
            Assert.AreEqual("3", dialog.amountLabel.text);

            dialog.confirmButton.onClick.Invoke();

            Assert.AreEqual(3, handler.Received[0].Payload["amount"]);
            Assert.IsFalse(dialog.IsOpen);
            Assert.IsFalse(screen.IsSplitOpen);
        }

        [Test]
        public void SplitDialog_CancelRaisesNothing_AndAStackOfOneCannotOpen()
        {
            var handler = new Handler();
            Show(Potion(5), handler);
            var split = slot.gameObject.AddComponent<FormaSplit>();
            split.Open(slot);
            var dialog = screen.GetDefaultSplitDialog();

            screen.Cancel();

            Assert.IsFalse(dialog.IsOpen);
            Assert.AreEqual(0, handler.Received.Count);

            Show(Potion(1), handler);
            Assert.IsFalse(split.Open(slot));
        }

        [Test]
        public void Drag_CreatesAGhostUnderTheCanvasAndRemovesItWhenDone()
        {
            Show(Potion(2));
            var dd = slot.gameObject.AddComponent<FormaDragDrop>();
            var before = CanvasChildren;

            dd.OnBeginDrag(new PointerEventData(null) { position = new Vector2(20, 20) });

            Assert.IsTrue(screen.IsDragging);
            Assert.AreEqual(before + 1, CanvasChildren);
            Assert.AreEqual("Forma Drag Ghost", canvas.transform.GetChild(canvas.transform.childCount - 1).name);

            dd.OnEndDrag(new PointerEventData(null));

            Assert.IsFalse(screen.IsDragging);
            Assert.AreEqual(before, CanvasChildren);
        }

        [Test]
        public void Drag_CancelAbortsTheDragAndASubsequentDropIsIgnored()
        {
            var handler = new Handler();
            Show(Potion(2), handler);
            var dd = slot.gameObject.AddComponent<FormaDragDrop>();
            var targetGo = new GameObject("target", typeof(RectTransform));
            targetGo.transform.SetParent(screen.transform, false);
            targetGo.AddComponent<FormaId>().nodeId = "s1";
            var target = targetGo.AddComponent<FormaDragDrop>();

            dd.OnBeginDrag(new PointerEventData(null));
            screen.Cancel();
            target.OnDrop(new PointerEventData(null) { pointerDrag = slot.gameObject });

            Assert.IsFalse(screen.IsDragging);
            Assert.AreEqual(0, handler.Received.Count);
        }

        [Test]
        public void Drag_HoverTintsAcceptOrRejectAndRestoresTheColor()
        {
            Show(Potion(2));
            var dd = slot.gameObject.AddComponent<FormaDragDrop>();
            var targetGo = new GameObject("target", typeof(RectTransform), typeof(Image));
            targetGo.transform.SetParent(screen.transform, false);
            var image = targetGo.GetComponent<Image>();
            image.color = Color.white;
            var target = targetGo.AddComponent<FormaDragDrop>();
            target.acceptTint = Color.green;
            target.rejectTint = Color.red;
            var drag = new PointerEventData(null) { pointerDrag = slot.gameObject };

            target.OnPointerEnter(drag);
            Assert.AreEqual(Color.green, image.color);
            target.OnPointerExit(drag);
            Assert.AreEqual(Color.white, image.color);

            target.accepts = new[] { "weapon" };
            target.OnPointerEnter(drag);
            Assert.AreEqual(Color.red, image.color);
            target.OnDrop(drag);
            Assert.AreEqual(Color.white, image.color, "dropping clears the tint");
        }

        [Test]
        public void Tooltip_BuiltPanelListsNameQuantityCategoryAndRarity()
        {
            Show(Potion(5));
            var tooltip = slot.gameObject.AddComponent<FormaTooltip>();

            Assert.IsTrue(tooltip.Show(new Vector2(30, 30)));

            var text = canvas.GetComponentsInChildren<TMP_Text>().Single().text;
            StringAssert.Contains("Poción", text);
            StringAssert.Contains("Cantidad: 5", text);
            StringAssert.Contains("Categoría: Consumibles", text);
            StringAssert.Contains("Rareza: común", text);

            screen.SetMenuOpen(true);
            Assert.IsFalse(tooltip.IsShown);
        }

        [Test]
        public void ItemView_ShowsFallbackSquareWithInitialAndCount()
        {
            Show(Potion(5));
            var go = new GameObject("itemView", typeof(RectTransform), typeof(Image));
            go.transform.SetParent(slot.transform, false);
            var view = go.AddComponent<FormaItemView>();
            view.icon = go.GetComponent<Image>();
            view.iconBinding = new FormaBinding("inventory.items", "items", 0) { field = "icon" };
            view.quantityText = FormaUiTestText(go.transform);
            view.initialText = FormaUiTestText(go.transform);
            view.quantityBinding = new FormaBinding("inventory.items", "items", 0) { field = "quantity" };

            screen.Refresh();

            Assert.IsTrue(view.icon.enabled);
            Assert.AreEqual(FormaIconProvider.FallbackColor("Poción"), view.icon.color);
            Assert.AreEqual("×5", view.quantityText.text);
            Assert.AreEqual("P", view.initialText.text);

            slot.gameObject.AddComponent<FormaStack>().showCount = false;
            screen.Refresh();
            Assert.IsFalse(view.quantityText.gameObject.activeSelf);

            Show(null);
            Assert.IsFalse(view.icon.enabled);
        }

        static TMP_Text FormaUiTestText(Transform parent)
        {
            var go = new GameObject("t", typeof(RectTransform), typeof(TextMeshProUGUI));
            go.transform.SetParent(parent, false);
            return go.GetComponent<TMP_Text>();
        }
    }
}
