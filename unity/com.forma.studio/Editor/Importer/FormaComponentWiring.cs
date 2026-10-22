using System;
using System.Collections.Generic;
using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Forma.Studio.Editor
{
    /// <summary>
    /// Attaches and configures the Forma MonoBehaviours of a node. It runs once every GameObject exists, because tabs,
    /// context menus and tooltips refer to other nodes by id. Only the fields the bundle carries are written: references
    /// the developer assigned (selected marker, active indicator, split dialog, icon provider...) are kept.
    /// </summary>
    static class FormaComponentWiring
    {
        static readonly Dictionary<string, Type> Types = new Dictionary<string, Type>
        {
            ["FormaTabs"] = typeof(FormaTabs),
            ["FormaSelectable"] = typeof(FormaSelectable),
            ["FormaDragDrop"] = typeof(FormaDragDrop),
            ["FormaStack"] = typeof(FormaStack),
            ["FormaSplit"] = typeof(FormaSplit),
            ["FormaContextMenu"] = typeof(FormaContextMenu),
            ["FormaTooltip"] = typeof(FormaTooltip),
            ["FormaSlot"] = typeof(FormaSlot),
            ["FormaItemView"] = typeof(FormaItemView),
            ["FormaEquipmentSlot"] = typeof(FormaEquipmentSlot),
        };

        public static void Wire(FormaImportContext ctx, GameObject go, BundleNode n, NodeScope scope)
        {
            foreach (var path in scope.Gone)
            {
                const string prefix = "components.";
                if (!path.StartsWith(prefix, StringComparison.Ordinal)) continue;
                if (Types.TryGetValue(path.Substring(prefix.Length), out var type))
                {
                    var stale = go.GetComponent(type);
                    if (stale != null) UnityEngine.Object.DestroyImmediate(stale);
                }
            }

            foreach (var component in n.components)
                if (scope.Owns("components." + component.type)) Apply(ctx, go, n, component);

            WireBoundText(go, n, scope);
        }

        static T Ensure<T>(GameObject go) where T : Component
        {
            var existing = go.GetComponent<T>();
            return existing != null ? existing : go.AddComponent<T>();
        }

        static void Apply(FormaImportContext ctx, GameObject go, BundleNode n, BundleComponent c)
        {
            switch (c.type)
            {
                case "FormaTabs": WireTabs(ctx, go, n, c); break;
                case "FormaSelectable":
                    Ensure<FormaSelectable>(go).mode = ParseEnum(c.mode, FormaSelectable.SelectionMode.Single);
                    break;
                case "FormaDragDrop":
                    var dragDrop = Ensure<FormaDragDrop>(go);
                    dragDrop.role = ParseEnum(c.role, FormaDragRole.Both);
                    dragDrop.accepts = c.accepts;
                    dragDrop.intent = c.intent;
                    break;
                case "FormaStack":
                    var stack = Ensure<FormaStack>(go);
                    stack.maxStack = c.maxStack;
                    stack.showCount = c.showCount;
                    break;
                case "FormaSplit": Ensure<FormaSplit>(go).intent = c.intent; break;
                case "FormaContextMenu": WireContextMenu(ctx, go, n, c); break;
                case "FormaTooltip": WireTooltip(ctx, go, n, c); break;
                case "FormaSlot": Ensure<FormaSlot>(go).binding = c.binding; break;
                case "FormaItemView": WireItemView(ctx, go, n, c); break;
                case "FormaEquipmentSlot": Ensure<FormaEquipmentSlot>(go).slotType = c.slotType; break;
            }
        }

        static TEnum ParseEnum<TEnum>(string value, TEnum fallback) where TEnum : struct =>
            Enum.TryParse(value, true, out TEnum parsed) ? parsed : fallback;

        // ---- tabs ----

        static void WireTabs(FormaImportContext ctx, GameObject go, BundleNode n, BundleComponent c)
        {
            var tabs = Ensure<FormaTabs>(go);
            var previous = tabs.tabs ?? new List<FormaTabs.Entry>();
            tabs.initialTabId = c.initialTabId;
            tabs.tabs = c.tabs.Select(tab =>
            {
                var buttonGo = ctx.Find(tab.buttonNodeId);
                var contentGo = ctx.Find(tab.contentNodeId);
                if (tab.buttonNodeId != null && buttonGo == null) ctx.Warn(n, $"La pestaña «{tab.label}» apunta a un botón «{tab.buttonNodeId}» que no existe.");
                if (contentGo == null) ctx.Warn(n, $"La pestaña «{tab.label}» apunta a un contenido «{tab.contentNodeId}» que no existe.");
                var before = previous.Find(e => e != null && e.id == tab.id);
                return new FormaTabs.Entry
                {
                    id = tab.id,
                    label = tab.label,
                    button = buttonGo != null ? buttonGo.GetComponent<Button>() : null,
                    content = contentGo,
                    activeIndicator = before != null ? before.activeIndicator : null,
                };
            }).ToList();
        }

        // ---- context menu and tooltip ----

        static void WireContextMenu(FormaImportContext ctx, GameObject go, BundleNode n, BundleComponent c)
        {
            var menu = Ensure<FormaContextMenu>(go);
            menu.trigger = ParseEnum(c.trigger, FormaContextMenu.MenuTrigger.SecondaryClick);
            menu.actions = c.actions.Select(a => new FormaContextMenu.Action { id = a.id, label = a.label, intent = a.intent }).ToList();
            if (menu.panel == null) menu.panel = FindPanel(ctx, n, "contextMenu");
        }

        static void WireTooltip(FormaImportContext ctx, GameObject go, BundleNode n, BundleComponent c)
        {
            var tooltip = Ensure<FormaTooltip>(go);
            tooltip.binding = c.binding;
            if (tooltip.panel == null) tooltip.panel = FindPanel(ctx, n, "tooltip");
        }

        /// <summary>
        /// The exported panel (kind <paramref name="kind"/>) closest to <paramref name="from"/> in the node tree: inside its
        /// subtree first, then inside the nearest ancestor's, then anywhere on the screen. The bundle has no explicit link.
        /// </summary>
        static RectTransform FindPanel(FormaImportContext ctx, BundleNode from, string kind)
        {
            var fromChain = Chain(ctx.Bundle, from);
            RectTransform best = null;
            var bestDistance = int.MaxValue;
            foreach (var candidate in ctx.Bundle.nodes.Where(node => node.kind == kind))
            {
                var go = ctx.Find(candidate.id);
                if (go == null) continue;
                var candidateChain = Chain(ctx.Bundle, candidate);
                var distance = int.MaxValue;
                for (var i = 0; i < candidateChain.Count; i++)
                {
                    var shared = fromChain.IndexOf(candidateChain[i]);
                    if (shared >= 0) { distance = shared + i; break; }
                }
                if (distance >= bestDistance) continue;
                bestDistance = distance;
                best = (RectTransform)go.transform;
            }
            return best;
        }

        /// <summary>The node and its ancestors, nearest first.</summary>
        static List<string> Chain(FormaBundle bundle, BundleNode node)
        {
            var chain = new List<string>();
            for (var current = node; current != null; current = current.parentId != null ? bundle.byId[current.parentId] : null)
                chain.Add(current.id);
            return chain;
        }

        // ---- item view ----

        static void WireItemView(FormaImportContext ctx, GameObject go, BundleNode n, BundleComponent c)
        {
            var view = Ensure<FormaItemView>(go);
            if (view.icon == null) view.icon = go.GetComponent<Image>();
            if (view.quantityText == null) view.quantityText = TextOf(ctx.Find(n.id + "/quantity")) ?? TextOf(ctx, DesignedText(ctx.Bundle, n, "quantity"));
            if (view.nameText == null) view.nameText = TextOf(ctx, DesignedText(ctx.Bundle, n, "name"));
            view.iconBinding = c.icon ?? new FormaBinding();
            view.quantityBinding = c.quantity ?? new FormaBinding();
            view.nameBinding = c.name ?? new FormaBinding();
        }

        static TMP_Text TextOf(GameObject go) => go != null ? go.GetComponent<TMP_Text>() : null;

        static TMP_Text TextOf(FormaImportContext ctx, BundleNode node) => node != null ? TextOf(ctx.Find(node.id)) : null;

        /// <summary>A text node under the item view whose binding feeds <paramref name="prop"/> (<c>quantity</c> or <c>name</c>).</summary>
        static BundleNode DesignedText(FormaBundle bundle, BundleNode itemView, string prop) =>
            bundle.nodes.FirstOrDefault(node =>
                node.kind == "text" && node.bindings.Any(b => b.prop == prop) && Chain(bundle, node).Contains(itemView.id) && node != itemView);

        // ---- bound text ----

        static void WireBoundText(GameObject go, BundleNode n, NodeScope scope)
        {
            if (n.kind != "text" || !scope.Touches("bindings")) return;
            var bound = go.GetComponent<FormaBoundText>();
            var binding = n.bindings.Find(b => b.prop == "text") ?? n.bindings.FirstOrDefault();
            var feedsItemView = binding != null && (binding.prop == "quantity" || binding.prop == "name");
            if (binding == null || feedsItemView)
            {
                if (bound != null && scope.Dropped("bindings")) UnityEngine.Object.DestroyImmediate(bound);
                return;
            }
            if (bound == null) bound = go.AddComponent<FormaBoundText>();
            if (bound.target == null) bound.target = go.GetComponent<TMP_Text>();
            bound.binding = binding.binding;
        }
    }
}
