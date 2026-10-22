using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Forma.Studio.Editor
{
    /// <summary>
    /// Builds and updates the uGUI parts of one node (rect, image, text, button, outline, group, layout, scroll).
    /// Every property is written only when <see cref="NodeScope"/> says Forma owns it, so a re-import never overwrites
    /// what the developer changed outside the bundle's <c>managed</c> list.
    /// </summary>
    static class FormaNodeBuilder
    {
        public static GameObject CreateEmpty(string name, Transform parent, string nodeId)
        {
            var go = new GameObject(name, typeof(RectTransform));
            if (parent != null) go.transform.SetParent(parent, false);
            go.AddComponent<FormaId>().nodeId = nodeId;
            return go;
        }

        /// <summary>A child Forma adds for a node (<c>id/label</c>, <c>id/viewport</c>...). It carries its own <see cref="FormaId"/>.</summary>
        public static GameObject CreateSynthetic(FormaImportContext ctx, string id, string name, Transform parent)
        {
            var go = CreateEmpty(name, parent, id);
            ctx.Objects[id] = go;
            return go;
        }

        public static void ApplyVisuals(FormaImportContext ctx, GameObject go, BundleNode n, NodeScope scope)
        {
            if (scope.Owns("name") && !n.IsRoot) go.name = n.name;
            if (scope.Owns("rect")) ApplyRect((RectTransform)go.transform, n.rect);
            ApplyImage(ctx, go, n, scope);
            ApplyText(ctx, go, n, scope);
            ApplyButton(go, n, scope);
            ApplyOutline(go, n, scope);
            ApplyCanvasGroup(go, n, scope);
            ApplyScroll(ctx, go, n, scope);
            ApplyLayoutGroup(ctx, go, n, scope);
            ApplyItemQuantity(ctx, go, n, scope);
        }

        public static void ApplyRect(RectTransform rect, BundleRect source)
        {
            rect.anchorMin = source.anchorMin;
            rect.anchorMax = source.anchorMax;
            rect.pivot = source.pivot;
            rect.sizeDelta = source.sizeDelta;
            rect.anchoredPosition = source.anchoredPosition;
        }

        public static void Stretch(RectTransform rect, float inset = 0f)
        {
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = new Vector2(inset, inset);
            rect.offsetMax = new Vector2(-inset, -inset);
        }

        // ---- image ----

        static void ApplyImage(FormaImportContext ctx, GameObject go, BundleNode n, NodeScope scope)
        {
            var needsGraphic = n.image != null || n.kind == "button" || n.kind == "slot" || n.kind == "equipmentSlot";
            if (!needsGraphic) return;

            var graphic = go.GetComponent<Graphic>();
            var image = graphic as Image;
            var added = false;
            if (image == null)
            {
                if (graphic != null)
                {
                    ctx.Warn(n, $"El nodo ya tiene un {graphic.GetType().Name}: no se añadió un Image.");
                    return;
                }
                image = go.AddComponent<Image>();
                added = true;
                if (n.image == null)
                {
                    // a button or slot with no fill still needs a graphic to be clickable
                    image.color = Color.clear;
                    image.raycastTarget = true;
                }
            }

            if (n.image != null)
            {
                if (added || scope.Owns("image.color"))
                {
                    ApplyThemeBinding(ctx, go, n.image.color);
                    image.color = n.image.color.color;
                }
                if (added || scope.Owns("image.raycastTarget")) image.raycastTarget = n.image.raycastTarget;
                if (scope.IsNew && !string.IsNullOrEmpty(n.image.assetRef))
                    ctx.Warn(n, $"La imagen «{n.image.assetRef}» no se resuelve sola: asigná el sprite a mano en el Image.");
            }
            if (added || scope.Touches("cornerRadius")) ApplyCornerRadius(ctx, image, n, scope);
        }

        static void ApplyCornerRadius(FormaImportContext ctx, Image image, BundleNode n, NodeScope scope)
        {
            var current = image.sprite;
            if (n.cornerRadius.HasValue)
            {
                if (current == null || FormaSpriteFactory.IsGenerated(current))
                {
                    var rounded = ctx.RoundedSprite(n.cornerRadius.Value);
                    if (image.sprite != rounded) image.sprite = rounded;
                    if (image.type != Image.Type.Sliced) image.type = Image.Type.Sliced;
                }
                else
                {
                    ctx.Preserve(n.id, n.name, "sprite propio conservado: la esquina redondeada no se aplica sobre un sprite asignado a mano.");
                }
            }
            else if (FormaSpriteFactory.IsGenerated(current))
            {
                image.sprite = null;
                image.type = Image.Type.Simple;
            }
        }

        /// <summary>A color that came from a token follows the theme asset; one that no longer does stops following it.</summary>
        static void ApplyThemeBinding(FormaImportContext ctx, GameObject go, BundleColor color)
        {
            var binding = go.GetComponent<FormaThemeBinding>();
            if (color.HasToken && ctx.Theme != null && ctx.Theme.TryGetColor(color.token, out var tokenColor))
            {
                if (binding == null) binding = go.AddComponent<FormaThemeBinding>();
                if (binding.theme == null) binding.theme = ctx.Theme;
                binding.colorToken = color.token;
                binding.preserveAlpha = !Mathf.Approximately(tokenColor.a, color.color.a);
            }
            else if (binding != null)
            {
                Object.DestroyImmediate(binding);
            }
        }

        // ---- text ----

        static void ApplyText(FormaImportContext ctx, GameObject go, BundleNode n, NodeScope scope)
        {
            if (n.text == null) return;
            var target = go;
            var all = scope.IsNew;
            if (n.kind == "button")
            {
                target = ctx.Find(n.id + "/label");
                if (target == null)
                {
                    target = CreateSynthetic(ctx, n.id + "/label", "Label", go.transform);
                    Stretch((RectTransform)target.transform);
                    target.transform.SetAsFirstSibling();
                    all = true;
                }
            }

            var tmp = target.GetComponent<TMP_Text>();
            if (tmp == null)
            {
                var other = target.GetComponent<Graphic>();
                if (other != null)
                {
                    ctx.Warn(n, $"El nodo ya tiene un {other.GetType().Name}: no se añadió el texto.");
                    return;
                }
                tmp = target.AddComponent<TextMeshProUGUI>();
                tmp.raycastTarget = false;
                all = true;
            }

            var text = n.text;
            if (all || scope.Owns("text.value")) tmp.text = text.value;
            if (all || scope.Owns("text.fontSize")) tmp.fontSize = text.fontSize;
            if (all || scope.Owns("text.color"))
            {
                ApplyThemeBinding(ctx, target, text.color);
                tmp.color = text.color.color;
            }
            if (all || scope.Owns("text.alignment")) tmp.alignment = Alignment(text.alignment);
            if (all || scope.Owns("text.fontWeight"))
            {
                // only the bold flag is Forma's; a style the developer added (italic...) stays
                tmp.fontStyle = text.fontWeight >= 600 ? tmp.fontStyle | FontStyles.Bold : tmp.fontStyle & ~FontStyles.Bold;
            }
        }

        static TextAlignmentOptions Alignment(string alignment)
        {
            switch (alignment)
            {
                case "Center": return TextAlignmentOptions.Midline;
                case "Right": return TextAlignmentOptions.MidlineRight;
                default: return TextAlignmentOptions.MidlineLeft;
            }
        }

        // ---- button, outline, canvas group ----

        static void ApplyButton(GameObject go, BundleNode n, NodeScope scope)
        {
            if (n.kind != "button" && n.kind != "slot" && n.kind != "equipmentSlot") return;
            if (!scope.Owns("kind")) return;
            var button = go.GetComponent<Button>();
            var added = false;
            if (button == null)
            {
                if (go.GetComponent<Selectable>() != null) return; // the developer swapped it for another Selectable
                button = go.AddComponent<Button>();
                added = true;
            }
            if (added || (n.kind == "button" && scope.Owns("button"))) button.transition = Selectable.Transition.ColorTint;
            if (button.targetGraphic == null) button.targetGraphic = go.GetComponent<Graphic>();
        }

        static void ApplyOutline(GameObject go, BundleNode n, NodeScope scope)
        {
            if (!scope.Touches("outline")) return;
            var outline = go.GetComponent<Outline>();
            if (n.outline == null)
            {
                if (outline != null && scope.Dropped("outline")) Object.DestroyImmediate(outline);
                return;
            }
            if (outline == null) outline = go.AddComponent<Outline>();
            outline.effectColor = n.outline.color.color;
            outline.effectDistance = new Vector2(n.outline.width, -n.outline.width);
        }

        static void ApplyCanvasGroup(GameObject go, BundleNode n, NodeScope scope)
        {
            if (!scope.Touches("canvasGroupAlpha")) return;
            var group = go.GetComponent<CanvasGroup>();
            if (n.canvasGroupAlpha.HasValue)
            {
                if (group == null) group = go.AddComponent<CanvasGroup>();
                group.alpha = n.canvasGroupAlpha.Value;
            }
            else if (group != null && scope.Dropped("canvasGroupAlpha"))
            {
                if (n.IsRoot) group.alpha = 1f; // the root's group also belongs to the screen
                else Object.DestroyImmediate(group);
            }
        }

        // ---- scroll ----

        static void ApplyScroll(FormaImportContext ctx, GameObject go, BundleNode n, NodeScope scope)
        {
            if (n.kind != "scroll" || !scope.Owns("kind")) return;
            var scrollRect = go.GetComponent<ScrollRect>();
            if (scrollRect == null) scrollRect = go.AddComponent<ScrollRect>();

            var viewport = ctx.Find(n.id + "/viewport");
            if (viewport == null)
            {
                viewport = CreateSynthetic(ctx, n.id + "/viewport", "Viewport", go.transform);
                Stretch((RectTransform)viewport.transform);
                viewport.AddComponent<Image>().color = Color.white;
                viewport.AddComponent<Mask>().showMaskGraphic = false;
            }
            var content = ctx.Find(n.id + "/content");
            if (content == null)
            {
                content = CreateSynthetic(ctx, n.id + "/content", "Content", viewport.transform);
                var rect = (RectTransform)content.transform;
                Stretch(rect);
                rect.pivot = new Vector2(0f, 1f);
            }

            if (scrollRect.viewport == null) scrollRect.viewport = (RectTransform)viewport.transform;
            if (scrollRect.content == null) scrollRect.content = (RectTransform)content.transform;
            if (n.scroll != null && scope.Owns("scroll"))
            {
                scrollRect.horizontal = n.scroll.horizontal;
                scrollRect.vertical = n.scroll.vertical;
            }
        }

        // ---- layout group ----

        static void ApplyLayoutGroup(FormaImportContext ctx, GameObject go, BundleNode n, NodeScope scope)
        {
            if (!scope.Touches("layoutGroup")) return;
            var container = ctx.ContainerOf(n);
            var host = container != null ? container.gameObject : go;
            var existing = host.GetComponent<LayoutGroup>();

            if (n.layoutGroup == null)
            {
                if (existing != null && scope.Dropped("layoutGroup")) Object.DestroyImmediate(existing);
                return;
            }

            var group = n.layoutGroup;
            var wanted = group.type == "Grid" ? typeof(GridLayoutGroup)
                : group.type == "Horizontal" ? typeof(HorizontalLayoutGroup)
                : typeof(VerticalLayoutGroup);
            if (existing != null && existing.GetType() != wanted)
            {
                Object.DestroyImmediate(existing);
                existing = null;
            }
            if (existing == null) existing = (LayoutGroup)host.AddComponent(wanted);

            existing.padding = new RectOffset(group.left, group.right, group.top, group.bottom);
            existing.childAlignment = TextAnchor.UpperLeft;
            if (existing is GridLayoutGroup grid)
            {
                if (group.cellSize.HasValue) grid.cellSize = group.cellSize.Value;
                grid.spacing = new Vector2(group.spacing, group.spacing);
                grid.startCorner = GridLayoutGroup.Corner.UpperLeft;
                grid.startAxis = GridLayoutGroup.Axis.Horizontal;
                if (group.fixedColumnCount && group.constraintCount > 0)
                {
                    grid.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
                    grid.constraintCount = group.constraintCount;
                }
                else
                {
                    grid.constraint = GridLayoutGroup.Constraint.Flexible;
                }
            }
            else if (existing is HorizontalOrVerticalLayoutGroup line)
            {
                // children keep the sizes the design gave them
                line.spacing = group.spacing;
                line.childControlWidth = line.childControlHeight = false;
                line.childForceExpandWidth = line.childForceExpandHeight = false;
            }
        }

        // ---- item view quantity ----

        static void ApplyItemQuantity(FormaImportContext ctx, GameObject go, BundleNode n, NodeScope scope)
        {
            if (n.kind != "itemView" || !scope.Touches("components.FormaItemView")) return;
            var item = n.Component("FormaItemView");
            var child = ctx.Find(n.id + "/quantity");
            if (item != null && item.quantity != null)
            {
                if (child != null) return;
                child = CreateSynthetic(ctx, n.id + "/quantity", "Cantidad", go.transform);
                Stretch((RectTransform)child.transform, 2f);
                var tmp = child.AddComponent<TextMeshProUGUI>();
                tmp.raycastTarget = false;
                tmp.text = "×1";
                tmp.fontSize = 14f;
                tmp.fontStyle = FontStyles.Bold;
                tmp.alignment = TextAlignmentOptions.BottomRight;
                tmp.color = Color.white;
            }
            else if (child != null)
            {
                Object.DestroyImmediate(child);
                ctx.Objects.Remove(n.id + "/quantity");
            }
        }
    }
}
