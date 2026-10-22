using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Forma.Studio
{
    /// <summary>
    /// A menu of actions for the slot it sits on. It opens on right click, long press or a plain click/Submit
    /// depending on <see cref="trigger"/>, and raises the chosen action's intent with
    /// <c>actionId</c>, <c>slotId</c> and (when the slot holds an item) <c>itemId</c>.
    /// The menu panel is built at runtime unless <see cref="panel"/> is assigned.
    /// </summary>
    [AddComponentMenu("Forma/Forma Context Menu")]
    public sealed class FormaContextMenu : MonoBehaviour,
        IPointerClickHandler, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler, IBeginDragHandler, ISubmitHandler
    {
        public enum MenuTrigger
        {
            SecondaryClick,
            LongPress,
            Button,
        }

        [Serializable]
        public sealed class Action
        {
            public string id;
            public string label;
            public string intent;
        }

        public MenuTrigger trigger = MenuTrigger.SecondaryClick;
        public List<Action> actions = new List<Action>();
        public float longPressSeconds = 0.5f;

        [Tooltip("Optional panel whose Button children (in order) stand for the actions. Empty builds one at runtime.")]
        public RectTransform panel;

        RectTransform openPanel;
        GameObject blocker;
        bool builtPanel;
        bool pressing;
        bool longPressed;
        float pressStart;
        Vector2 pressPosition;

        public bool IsOpen { get; private set; }

        FormaSlot Slot
        {
            get
            {
                var own = GetComponent<FormaSlot>();
                return own != null ? own : GetComponentInParent<FormaSlot>();
            }
        }

        /// <summary>The split action is unavailable on a stack of one.</summary>
        public bool IsDisabled(Action action)
        {
            var split = GetComponentInParent<FormaSplit>();
            var record = Slot != null ? Slot.Record : null;
            return split != null && action.intent == split.intent && record != null && record.GetInt("quantity", 1) <= 1;
        }

        // ---- triggers ----

        public void OnPointerClick(PointerEventData eventData)
        {
            if (longPressed) { longPressed = false; return; }
            if (trigger == MenuTrigger.SecondaryClick && eventData.button == PointerEventData.InputButton.Right)
                Open(eventData.position);
            else if (trigger == MenuTrigger.Button && eventData.button == PointerEventData.InputButton.Left)
                Open(eventData.position);
        }

        public void OnSubmit(BaseEventData eventData)
        {
            if (trigger != MenuTrigger.Button) return;
            var rect = (RectTransform)transform;
            var corners = new Vector3[4];
            rect.GetWorldCorners(corners);
            var canvas = FormaScreen.Of(this)?.RootCanvas;
            var camera = canvas != null && canvas.renderMode != RenderMode.ScreenSpaceOverlay ? canvas.worldCamera : null;
            Open(RectTransformUtility.WorldToScreenPoint(camera, corners[0]));
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            if (trigger != MenuTrigger.LongPress || eventData.button != PointerEventData.InputButton.Left) return;
            pressing = true;
            longPressed = false;
            pressStart = Time.unscaledTime;
            pressPosition = eventData.position;
        }

        public void OnPointerUp(PointerEventData eventData) => pressing = false;

        public void OnPointerExit(PointerEventData eventData) => pressing = false;

        public void OnBeginDrag(PointerEventData eventData) => pressing = false;

        void Update()
        {
            if (!pressing || Time.unscaledTime - pressStart < longPressSeconds) return;
            pressing = false;
            longPressed = true;
            Open(pressPosition);
        }

        // ---- open / close ----

        /// <summary>Opens the menu at a screen point. Nothing happens on an empty slot (nothing to act on).</summary>
        public void Open(Vector2 screenPoint)
        {
            var screen = FormaScreen.Of(this);
            var slot = Slot;
            if (screen == null || actions.Count == 0) return;
            if (slot != null && slot.Record == null) return;
            Close();

            var canvas = screen.RootCanvas;
            if (canvas == null) return;
            blocker = FormaUi.CreateBlocker(canvas.transform, Color.clear, Close).gameObject;
            blocker.AddComponent<FormaScreenLink>().screen = screen;
            blocker.AddComponent<FormaCancelRelay>();

            builtPanel = panel == null;
            openPanel = builtPanel ? BuildPanel(canvas.transform, screen.font) : panel;
            if (!builtPanel)
            {
                openPanel.SetParent(canvas.transform, true);
                BindPanel(openPanel);
            }
            if (openPanel.GetComponent<FormaScreenLink>() == null) openPanel.gameObject.AddComponent<FormaScreenLink>();
            openPanel.GetComponent<FormaScreenLink>().screen = screen;
            openPanel.gameObject.SetActive(true);
            openPanel.SetAsLastSibling();
            FormaUi.PlaceAtScreenPoint(openPanel, canvas, screenPoint);

            IsOpen = true;
            screen.SetMenuOpen(true, Close);
            var first = openPanel.GetComponentInChildren<Button>();
            if (first != null && EventSystem.current != null) EventSystem.current.SetSelectedGameObject(first.gameObject);
        }

        public void Close()
        {
            if (blocker != null) FormaUi.Dispose(blocker);
            blocker = null;
            if (openPanel != null)
            {
                if (builtPanel) FormaUi.Dispose(openPanel.gameObject);
                else openPanel.gameObject.SetActive(false);
            }
            openPanel = null;
            if (!IsOpen) return;
            IsOpen = false;
            FormaScreen.Of(this)?.SetMenuOpen(false);
            if (EventSystem.current != null && Slot != null) EventSystem.current.SetSelectedGameObject(Slot.gameObject);
        }

        RectTransform BuildPanel(Transform parent, TMP_FontAsset font)
        {
            var image = FormaUi.CreateImage("Forma Context Menu", parent, FormaUi.PanelColor);
            var layout = image.gameObject.AddComponent<VerticalLayoutGroup>();
            layout.padding = new RectOffset(6, 6, 6, 6);
            layout.spacing = 4f;
            layout.childControlWidth = layout.childControlHeight = true;
            layout.childForceExpandWidth = layout.childForceExpandHeight = false;
            var fitter = image.gameObject.AddComponent<ContentSizeFitter>();
            fitter.horizontalFit = fitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            foreach (var action in actions)
            {
                var captured = action;
                var button = FormaUi.CreateButton(image.transform, action.label, font);
                button.interactable = !IsDisabled(action);
                button.onClick.AddListener(() => Invoke(captured));
            }
            return image.rectTransform;
        }

        void BindPanel(RectTransform existing)
        {
            var buttons = existing.GetComponentsInChildren<Button>(true);
            for (var i = 0; i < buttons.Length && i < actions.Count; i++)
            {
                var captured = actions[i];
                buttons[i].onClick.RemoveAllListeners();
                buttons[i].onClick.AddListener(() => Invoke(captured));
                buttons[i].interactable = !IsDisabled(captured);
            }
        }

        // ---- action ----

        /// <summary>Runs an action: opens the split dialog for the split action, else raises its intent.</summary>
        public void Invoke(Action action)
        {
            if (IsDisabled(action)) return;
            Close();
            var screen = FormaScreen.Of(this);
            if (screen == null) return;
            var slot = Slot;
            var record = slot != null ? slot.Record : null;

            var split = GetComponentInParent<FormaSplit>();
            if (split != null && split.intent == action.intent && record != null)
            {
                split.Open(slot);
                return;
            }

            var payload = new Dictionary<string, object>
            {
                ["actionId"] = action.id,
                ["slotId"] = FormaId.NodeIdOf(this),
            };
            if (record != null && record.Id != null) payload["itemId"] = record.Id;
            screen.Raise(new FormaIntent(action.intent, payload));
        }
    }
}
