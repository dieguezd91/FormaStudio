using System;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Forma.Studio
{
    /// <summary>
    /// Modal dialog that asks how many units to split off a stack. Forma builds a default one at runtime
    /// (<see cref="CreateDefault"/>); a project can assign its own and reference its Slider, label and buttons here.
    /// The dialog only collects the amount; the intent is raised by <see cref="FormaSplit"/>.
    /// </summary>
    [AddComponentMenu("Forma/Forma Split Dialog")]
    public sealed class FormaSplitDialog : MonoBehaviour
    {
        public Slider slider;
        public TMP_Text amountLabel;
        public Button confirmButton;
        public Button cancelButton;

        Action<int> onConfirm;
        Action onCancel;
        bool wired;

        public bool IsOpen { get; private set; }

        /// <summary>Largest amount that can be split off (quantity - 1).</summary>
        public int Max { get; private set; }

        public int Amount { get; private set; }

        /// <summary>Opens the dialog for a stack that allows splitting off 1..<paramref name="max"/> units.</summary>
        public void Show(int max, Action<int> confirm, Action cancel = null)
        {
            Wire();
            Max = Mathf.Max(1, max);
            onConfirm = confirm;
            onCancel = cancel;
            IsOpen = true;
            gameObject.SetActive(true);
            transform.SetAsLastSibling();
            if (slider != null)
            {
                slider.minValue = 1;
                slider.maxValue = Max;
                slider.wholeNumbers = true;
            }
            SetAmount(Mathf.Max(1, Max / 2));

            var screen = FormaScreen.Of(this);
            screen?.SetSplitOpen(true, Cancel);
            var events = EventSystem.current;
            if (events != null && slider != null) events.SetSelectedGameObject(slider.gameObject);
        }

        public void SetAmount(int amount)
        {
            Amount = Mathf.Clamp(amount, 1, Max);
            if (slider != null && Mathf.RoundToInt(slider.value) != Amount) slider.SetValueWithoutNotify(Amount);
            if (amountLabel != null) amountLabel.text = Amount.ToString();
        }

        public void Confirm()
        {
            if (!IsOpen) return;
            var amount = Amount;
            var callback = onConfirm;
            Close();
            callback?.Invoke(amount);
        }

        public void Cancel()
        {
            if (!IsOpen) return;
            var callback = onCancel;
            Close();
            callback?.Invoke();
        }

        void Close()
        {
            IsOpen = false;
            onConfirm = null;
            onCancel = null;
            gameObject.SetActive(false);
            FormaScreen.Of(this)?.SetSplitOpen(false);
        }

        void Wire()
        {
            if (wired) return;
            wired = true;
            if (slider != null) slider.onValueChanged.AddListener(value => SetAmount(Mathf.RoundToInt(value)));
            if (confirmButton != null) confirmButton.onClick.AddListener(Confirm);
            if (cancelButton != null) cancelButton.onClick.AddListener(Cancel);
        }

        /// <summary>Builds the default dialog (dimmed blocker, panel, slider, Confirm/Cancel) under the screen's root canvas, inactive.</summary>
        public static FormaSplitDialog CreateDefault(FormaScreen screen)
        {
            var canvas = screen.RootCanvas;
            var parent = canvas != null ? canvas.transform : screen.transform;
            var font = screen.font;

            var root = FormaUi.Create("Forma Split Dialog", parent);
            FormaUi.Stretch(root);
            root.gameObject.AddComponent<FormaScreenLink>().screen = screen;
            var dialog = root.gameObject.AddComponent<FormaSplitDialog>();
            // The blocker swallows clicks outside the panel and cancels, like the web preview.
            FormaUi.CreateBlocker(root, new Color(0f, 0f, 0f, 0.5f), dialog.Cancel);

            var panel = FormaUi.CreateImage("Panel", root, FormaUi.PanelColor);
            panel.rectTransform.sizeDelta = new Vector2(280f, 150f);
            panel.rectTransform.anchorMin = panel.rectTransform.anchorMax = panel.rectTransform.pivot = new Vector2(0.5f, 0.5f);

            var title = FormaUi.CreateText(panel.transform, "Dividir pila", 16, font);
            title.rectTransform.anchorMin = new Vector2(0f, 1f);
            title.rectTransform.anchorMax = Vector2.one;
            title.rectTransform.pivot = new Vector2(0.5f, 1f);
            title.rectTransform.sizeDelta = new Vector2(0f, 32f);
            title.rectTransform.anchoredPosition = Vector2.zero;

            dialog.amountLabel = FormaUi.CreateText(panel.transform, "1", 20, font);
            var label = dialog.amountLabel.rectTransform;
            label.anchorMin = new Vector2(0f, 0.5f);
            label.anchorMax = new Vector2(1f, 0.5f);
            label.sizeDelta = new Vector2(0f, 28f);
            label.anchoredPosition = new Vector2(0f, 14f);

            dialog.slider = FormaUi.CreateSlider(panel.transform);
            var sliderRect = (RectTransform)dialog.slider.transform;
            sliderRect.anchorMin = new Vector2(0.08f, 0.5f);
            sliderRect.anchorMax = new Vector2(0.92f, 0.5f);
            sliderRect.sizeDelta = new Vector2(0f, 24f);
            sliderRect.anchoredPosition = new Vector2(0f, -14f);

            var buttons = FormaUi.Create("Buttons", panel.transform);
            buttons.anchorMin = new Vector2(0f, 0f);
            buttons.anchorMax = new Vector2(1f, 0f);
            buttons.pivot = new Vector2(0.5f, 0f);
            buttons.sizeDelta = new Vector2(0f, 40f);
            buttons.anchoredPosition = new Vector2(0f, 8f);
            var layout = buttons.gameObject.AddComponent<HorizontalLayoutGroup>();
            layout.childAlignment = TextAnchor.MiddleCenter;
            layout.spacing = 12f;
            layout.childControlWidth = layout.childControlHeight = true;
            layout.childForceExpandWidth = layout.childForceExpandHeight = false;
            dialog.confirmButton = FormaUi.CreateButton(buttons, "Confirmar", font, 110f);
            dialog.cancelButton = FormaUi.CreateButton(buttons, "Cancelar", font, 110f);

            root.gameObject.AddComponent<FormaCancelRelay>();
            root.gameObject.SetActive(false);
            return dialog;
        }
    }
}
