using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Forma.Studio
{
    /// <summary>Builders for the small pieces of UI Forma creates at runtime (menu, split dialog, tooltip, drag ghost).</summary>
    static class FormaUi
    {
        public static readonly Color PanelColor = new Color(0.11f, 0.12f, 0.15f, 0.97f);
        public static readonly Color ButtonColor = new Color(0.2f, 0.22f, 0.27f, 1f);
        public static readonly Color TextColor = new Color(0.93f, 0.94f, 0.96f, 1f);

        /// <summary>Destroys a runtime-built object (immediately outside Play mode, where Destroy is not allowed).</summary>
        public static void Dispose(Object target)
        {
            if (Application.isPlaying) Object.Destroy(target);
            else Object.DestroyImmediate(target);
        }

        public static RectTransform Create(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            return (RectTransform)go.transform;
        }

        public static void Stretch(RectTransform rect)
        {
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = rect.offsetMax = Vector2.zero;
        }

        public static Image CreateImage(string name, Transform parent, Color color)
        {
            var rect = Create(name, parent);
            var image = rect.gameObject.AddComponent<Image>();
            image.color = color;
            return image;
        }

        public static TextMeshProUGUI CreateText(Transform parent, string text, float size, TMP_FontAsset font,
            TextAlignmentOptions alignment = TextAlignmentOptions.Center)
        {
            var rect = Create("Text", parent);
            var tmp = rect.gameObject.AddComponent<TextMeshProUGUI>();
            if (font != null) tmp.font = font;
            tmp.text = text;
            tmp.fontSize = size;
            tmp.color = TextColor;
            tmp.alignment = alignment;
            tmp.raycastTarget = false;
            return tmp;
        }

        public static Button CreateButton(Transform parent, string label, TMP_FontAsset font, float width = 160f, float height = 30f)
        {
            var image = CreateImage("Button", parent, ButtonColor);
            var button = image.gameObject.AddComponent<Button>();
            button.targetGraphic = image;
            var element = image.gameObject.AddComponent<LayoutElement>();
            element.minHeight = element.preferredHeight = height;
            element.minWidth = element.preferredWidth = width;
            var text = CreateText(image.transform, label, 14, font);
            Stretch(text.rectTransform);
            image.gameObject.AddComponent<FormaCancelRelay>();
            return button;
        }

        public static Slider CreateSlider(Transform parent)
        {
            var root = Create("Slider", parent);
            var background = CreateImage("Background", root, new Color(0.25f, 0.27f, 0.32f, 1f));
            background.rectTransform.anchorMin = new Vector2(0f, 0.4f);
            background.rectTransform.anchorMax = new Vector2(1f, 0.6f);
            background.rectTransform.offsetMin = background.rectTransform.offsetMax = Vector2.zero;

            var fillArea = Create("Fill Area", root);
            fillArea.anchorMin = new Vector2(0f, 0.4f);
            fillArea.anchorMax = new Vector2(1f, 0.6f);
            fillArea.offsetMin = new Vector2(5f, 0f);
            fillArea.offsetMax = new Vector2(-5f, 0f);
            var fill = CreateImage("Fill", fillArea, new Color(0.85f, 0.65f, 0.2f, 1f));
            fill.rectTransform.anchorMin = Vector2.zero;
            fill.rectTransform.anchorMax = new Vector2(0f, 1f);
            fill.rectTransform.offsetMin = fill.rectTransform.offsetMax = Vector2.zero;

            var handleArea = Create("Handle Slide Area", root);
            Stretch(handleArea);
            handleArea.offsetMin = new Vector2(10f, 0f);
            handleArea.offsetMax = new Vector2(-10f, 0f);
            var handle = CreateImage("Handle", handleArea, Color.white);
            handle.rectTransform.sizeDelta = new Vector2(20f, 0f);

            var slider = root.gameObject.AddComponent<Slider>();
            slider.fillRect = fill.rectTransform;
            slider.handleRect = handle.rectTransform;
            slider.targetGraphic = handle;
            slider.direction = Slider.Direction.LeftToRight;
            slider.wholeNumbers = true;
            root.gameObject.AddComponent<FormaCancelRelay>();
            return slider;
        }

        /// <summary>A full-screen click catcher under <paramref name="parent"/>; clicking it runs <paramref name="onClick"/>.</summary>
        public static Button CreateBlocker(Transform parent, Color color, UnityEngine.Events.UnityAction onClick)
        {
            var image = CreateImage("Blocker", parent, color);
            Stretch(image.rectTransform);
            var button = image.gameObject.AddComponent<Button>();
            button.transition = Selectable.Transition.None;
            button.targetGraphic = image;
            button.onClick.AddListener(onClick);
            return button;
        }

        /// <summary>Puts <paramref name="panel"/> at a screen point (top-left pivot), kept inside the canvas.</summary>
        public static void PlaceAtScreenPoint(RectTransform panel, Canvas canvas, Vector2 screenPoint)
        {
            var canvasRect = (RectTransform)canvas.transform;
            var camera = canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : canvas.worldCamera;
            panel.pivot = new Vector2(0f, 1f);
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(canvasRect, screenPoint, camera, out var local))
                return;

            LayoutRebuilder.ForceRebuildLayoutImmediate(panel);
            var size = panel.rect.size;
            var bounds = canvasRect.rect;
            local.x = Mathf.Clamp(local.x, bounds.xMin, Mathf.Max(bounds.xMin, bounds.xMax - size.x));
            local.y = Mathf.Clamp(local.y, Mathf.Min(bounds.yMax, bounds.yMin + size.y), bounds.yMax);
            panel.position = canvasRect.TransformPoint(local);
        }
    }
}
