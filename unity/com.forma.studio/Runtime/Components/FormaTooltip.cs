using System.Collections.Generic;
using System.Text;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Forma.Studio
{
    /// <summary>
    /// Shows the item row under the pointer: name, quantity, category and rarity. Suppressed while a drag, a
    /// context menu or the split dialog is active. The panel is built at runtime unless <see cref="panel"/> is assigned.
    /// </summary>
    [AddComponentMenu("Forma/Forma Tooltip")]
    public sealed class FormaTooltip : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler, IPointerMoveHandler
    {
        [Tooltip("The row shown. Empty uses the FormaSlot on this node.")]
        public FormaBinding binding = new FormaBinding();

        [Tooltip("Optional exported tooltip panel (its bound texts fill themselves). Empty builds a simple one at runtime.")]
        public RectTransform panel;

        public Vector2 offset = new Vector2(14f, -14f);

        TMP_Text builtText;
        GameObject builtPanel;
        FormaScreen subscribedTo;

        public bool IsShown { get; private set; }

        public void OnPointerEnter(PointerEventData eventData) => Show(eventData.position);

        public void OnPointerMove(PointerEventData eventData)
        {
            if (IsShown) Place(eventData.position);
        }

        public void OnPointerExit(PointerEventData eventData) => Hide();

        void OnDisable() => Hide();

        void OnDestroy()
        {
            if (subscribedTo != null) subscribedTo.InteractionChanged -= OnInteractionChanged;
            if (builtPanel != null) FormaUi.Dispose(builtPanel);
        }

        void OnInteractionChanged()
        {
            if (subscribedTo != null && subscribedTo.IsOverlayActive) Hide();
        }

        /// <summary>The row to describe, or null when the slot is empty.</summary>
        public FormaRecord CurrentRecord()
        {
            var screen = FormaScreen.Of(this);
            if (screen == null) return null;
            if (!binding.IsEmpty)
            {
                var equipment = GetComponentInParent<FormaEquipmentSlot>();
                return FormaBindingResolver.ResolveRecord(
                    screen.GetSource(binding.dataSourceId), binding, equipment != null ? equipment.SlotId : null);
            }
            var own = GetComponent<FormaSlot>();
            var slot = own != null ? own : GetComponentInParent<FormaSlot>();
            return slot != null ? slot.Record : null;
        }

        /// <summary>Shows the tooltip near a screen point; false (and hidden) when suppressed or there is nothing to show.</summary>
        public bool Show(Vector2 screenPoint)
        {
            var screen = FormaScreen.Of(this);
            if (screen != null && subscribedTo != screen)
            {
                if (subscribedTo != null) subscribedTo.InteractionChanged -= OnInteractionChanged;
                subscribedTo = screen;
                screen.InteractionChanged += OnInteractionChanged;
            }

            var record = screen == null || screen.IsOverlayActive ? null : CurrentRecord();
            if (record == null)
            {
                Hide();
                return false;
            }

            var target = EnsurePanel(screen);
            if (target == null)
            {
                Hide();
                return false;
            }
            if (builtText != null) builtText.text = Describe(record);
            target.gameObject.SetActive(true);
            IsShown = true;
            Place(screenPoint);
            return true;
        }

        public void Hide()
        {
            IsShown = false;
            if (panel != null) panel.gameObject.SetActive(false);
            if (builtPanel != null) builtPanel.SetActive(false);
        }

        RectTransform EnsurePanel(FormaScreen screen)
        {
            if (panel != null) return panel;
            if (builtPanel != null) return (RectTransform)builtPanel.transform;
            var canvas = screen.RootCanvas;
            if (canvas == null) return null;

            var image = FormaUi.CreateImage("Forma Tooltip", canvas.transform, FormaUi.PanelColor);
            image.raycastTarget = false;
            builtPanel = image.gameObject;
            var group = builtPanel.AddComponent<CanvasGroup>();
            group.blocksRaycasts = false;
            group.interactable = false;
            var layout = builtPanel.AddComponent<VerticalLayoutGroup>();
            layout.padding = new RectOffset(10, 10, 6, 6);
            layout.childControlWidth = layout.childControlHeight = true;
            layout.childForceExpandWidth = layout.childForceExpandHeight = false;
            var fitter = builtPanel.AddComponent<ContentSizeFitter>();
            fitter.horizontalFit = fitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            builtText = FormaUi.CreateText(builtPanel.transform, string.Empty, 14, screen.font, TextAlignmentOptions.TopLeft);
            builtText.textWrappingMode = TextWrappingModes.NoWrap;
            return image.rectTransform;
        }

        void Place(Vector2 screenPoint)
        {
            var screen = FormaScreen.Of(this);
            var canvas = screen != null ? screen.RootCanvas : null;
            var target = panel != null ? panel : builtPanel != null ? (RectTransform)builtPanel.transform : null;
            if (canvas == null || target == null) return;
            FormaUi.PlaceAtScreenPoint(target, canvas, screenPoint + new Vector2(offset.x, offset.y));
        }

        static readonly KeyValuePair<string, string>[] Details =
        {
            new KeyValuePair<string, string>("quantity", "Cantidad"),
            new KeyValuePair<string, string>("category", "Categoría"),
            new KeyValuePair<string, string>("rarity", "Rareza"),
        };

        static string Describe(FormaRecord record)
        {
            var name = record.GetString("name") ?? record.Id ?? "Objeto";
            var text = new StringBuilder($"<b>{name}</b>");
            foreach (var detail in Details)
            {
                var value = record.GetString(detail.Key);
                if (value != null) text.Append('\n').Append(detail.Value).Append(": ").Append(value);
            }
            return text.ToString();
        }
    }
}
