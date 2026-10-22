using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Forma.Studio
{
    /// <summary>
    /// Drag source and/or drop target. Dropping on a target raises <see cref="intent"/> with
    /// <c>itemId</c>, <c>fromSlot</c>, <c>toSlot</c> (+ <c>slotType</c> on equipment slots); the game decides and the
    /// screen shows whatever the data source returns afterwards. While dragging, a ghost of the item follows the
    /// pointer and hovered targets are tinted accept/reject.
    /// </summary>
    [AddComponentMenu("Forma/Forma Drag Drop")]
    public sealed class FormaDragDrop : MonoBehaviour,
        IBeginDragHandler, IDragHandler, IEndDragHandler, IDropHandler, IPointerEnterHandler, IPointerExitHandler
    {
        public FormaDragRole role = FormaDragRole.Both;

        [Tooltip("Tags a dropped item must match: 'item', its slotType or its category. Empty accepts everything.")]
        public string[] accepts = System.Array.Empty<string>();

        [Tooltip("Intent raised when something is dropped on this node.")]
        public string intent = FormaIntentNames.MoveItem;

        [Tooltip("Graphic tinted while a drag hovers this node. Empty uses the Graphic on this node.")]
        public Graphic tintTarget;
        public Color acceptTint = new Color(0.35f, 0.8f, 0.45f, 1f);
        public Color rejectTint = new Color(0.85f, 0.3f, 0.3f, 1f);

        RectTransform ghost;
        bool cancelled;
        bool tinted;
        Color tintOriginal;

        FormaSlot Slot
        {
            get
            {
                var own = GetComponent<FormaSlot>();
                return own != null ? own : GetComponentInParent<FormaSlot>();
            }
        }

        string NodeId => FormaId.NodeIdOf(this);

        /// <summary>The record this node would drag; null when it is target-only or empty.</summary>
        public FormaRecord DraggedRecord => role == FormaDragRole.Target || Slot == null ? null : Slot.Record;

        // ---- drag source ----

        public void OnBeginDrag(PointerEventData eventData)
        {
            cancelled = false;
            var screen = FormaScreen.Of(this);
            var record = DraggedRecord;
            if (screen == null || record == null) return;
            var canvas = screen.RootCanvas;
            if (canvas != null) ghost = CreateGhost(canvas, record, screen);
            screen.SetDragging(true, CancelDrag);
            MoveGhost(eventData);
        }

        public void OnDrag(PointerEventData eventData) => MoveGhost(eventData);

        public void OnEndDrag(PointerEventData eventData) => EndDrag();

        void EndDrag()
        {
            if (ghost != null) FormaUi.Dispose(ghost.gameObject);
            ghost = null;
            FormaScreen.Of(this)?.SetDragging(false);
        }

        void CancelDrag()
        {
            cancelled = true;
            EndDrag();
        }

        RectTransform CreateGhost(Canvas canvas, FormaRecord record, FormaScreen screen)
        {
            var image = FormaUi.CreateImage("Forma Drag Ghost", canvas.transform, Color.white);
            image.raycastTarget = false;
            var group = image.gameObject.AddComponent<CanvasGroup>();
            group.blocksRaycasts = false;
            group.alpha = 0.8f;
            image.rectTransform.SetAsLastSibling();
            image.rectTransform.pivot = new Vector2(0.5f, 0.5f);
            image.rectTransform.sizeDelta = ((RectTransform)transform).rect.size;

            var itemView = GetComponentInChildren<FormaItemView>();
            if (itemView != null && itemView.icon != null && itemView.icon.sprite != null)
            {
                image.sprite = itemView.icon.sprite;
                image.color = itemView.icon.color;
            }
            else
            {
                var key = record.GetSpriteKey() ?? record.GetString("name") ?? record.Id;
                var sprite = screen.iconProvider != null ? screen.iconProvider.Get(record.GetSpriteKey()) : null;
                image.sprite = sprite;
                image.color = sprite != null ? Color.white : FormaIconProvider.FallbackColor(key);
            }
            return image.rectTransform;
        }

        void MoveGhost(PointerEventData eventData)
        {
            if (ghost == null) return;
            var canvas = FormaScreen.Of(this)?.RootCanvas;
            if (canvas == null) return;
            var camera = canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : canvas.worldCamera;
            if (RectTransformUtility.ScreenPointToWorldPointInRectangle(
                    (RectTransform)canvas.transform, eventData.position, camera, out var world))
                ghost.position = world;
        }

        // ---- drop target ----

        public void OnDrop(PointerEventData eventData)
        {
            ClearTint();
            if (role == FormaDragRole.Source || eventData.pointerDrag == null) return;
            var source = eventData.pointerDrag.GetComponent<FormaDragDrop>();
            if (source == null || source == this || source.cancelled) return;
            var record = source.DraggedRecord;
            var screen = FormaScreen.Of(this);
            if (record == null || screen == null || string.IsNullOrEmpty(intent)) return;

            screen.Raise(BuildIntent(source, record));
        }

        FormaIntent BuildIntent(FormaDragDrop source, FormaRecord record)
        {
            var payload = new Dictionary<string, object>
            {
                ["itemId"] = record.Id,
                ["fromSlot"] = source.NodeId,
                ["toSlot"] = NodeId,
            };
            var equipment = GetComponent<FormaEquipmentSlot>();
            if (equipment != null) payload["slotType"] = equipment.slotType;
            return new FormaIntent(intent, payload);
        }

        /// <summary>
        /// Whether the item could be dropped here, judged only from this node's UI configuration:
        /// the <c>accepts</c> tags and, on equipment slots, the slot type. The game still decides on drop.
        /// </summary>
        public FormaIntentResult Preview(FormaRecord item)
        {
            if (role == FormaDragRole.Source) return FormaIntentResult.Reject("Esa casilla no admite objetos.");
            if (accepts != null && accepts.Length > 0)
            {
                var allowed = false;
                foreach (var tag in accepts)
                {
                    if (tag == "item" || tag == item.GetString("slotType") || tag == item.GetString("category"))
                    {
                        allowed = true;
                        break;
                    }
                }
                if (!allowed)
                    return FormaIntentResult.Reject($"Esa casilla no acepta «{item.GetString("name") ?? item.Id}».");
            }
            var equipment = GetComponent<FormaEquipmentSlot>();
            if (equipment != null && item.GetString("slotType") != equipment.slotType)
                return FormaIntentResult.Reject($"Esa casilla solo acepta objetos de tipo «{equipment.slotType}».");
            return FormaIntentResult.Accept();
        }

        /// <summary>Asks the game's validator when there is one, else falls back to <see cref="Preview(FormaRecord)"/>.</summary>
        public FormaIntentResult Preview(FormaDragDrop source)
        {
            var record = source.DraggedRecord;
            if (record == null) return FormaIntentResult.Reject("La casilla de origen está vacía.");
            var validator = FormaScreen.Of(this)?.GetDropValidator();
            return validator != null ? validator.Validate(BuildIntent(source, record)) : Preview(record);
        }

        public void OnPointerEnter(PointerEventData eventData)
        {
            if (eventData.pointerDrag == null || role == FormaDragRole.Source) return;
            var source = eventData.pointerDrag.GetComponent<FormaDragDrop>();
            if (source == null || source == this || source.DraggedRecord == null) return;
            var graphic = tintTarget != null ? tintTarget : GetComponent<Graphic>();
            if (graphic == null) return;
            if (!tinted)
            {
                tintOriginal = graphic.color;
                tinted = true;
            }
            graphic.color = Preview(source).Accepted ? acceptTint : rejectTint;
        }

        public void OnPointerExit(PointerEventData eventData) => ClearTint();

        void OnDisable() => ClearTint();

        void ClearTint()
        {
            if (!tinted) return;
            tinted = false;
            var graphic = tintTarget != null ? tintTarget : GetComponent<Graphic>();
            if (graphic != null) graphic.color = tintOriginal;
        }
    }
}
