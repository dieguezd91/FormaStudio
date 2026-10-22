using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Forma.Studio.Editor
{
    /// <summary>
    /// Reads and validates a bundle. Unity's <c>JsonUtility</c> cannot read dictionaries (<c>managed</c>, theme tokens) or
    /// the discriminated <c>components</c> union, so this reads the generic tree of <see cref="FormaMockParser.ParseJson"/>
    /// (already in the runtime package, no extra dependency) into plain classes.
    /// </summary>
    public static class FormaBundleReader
    {
        static readonly HashSet<string> Kinds = new HashSet<string>
        {
            "container", "panel", "text", "image", "button", "scroll", "grid", "slot", "itemView",
            "equipmentSlot", "tabBar", "contextMenu", "tooltip",
        };

        static readonly HashSet<string> ComponentTypes = new HashSet<string>
        {
            "FormaTabs", "FormaSelectable", "FormaDragDrop", "FormaStack", "FormaSplit", "FormaContextMenu",
            "FormaTooltip", "FormaSlot", "FormaItemView", "FormaEquipmentSlot",
        };

        public static FormaBundle Read(string json)
        {
            object tree;
            try
            {
                tree = FormaMockParser.ParseJson(json);
            }
            catch (FormaJsonException error)
            {
                throw new FormaBundleException("El archivo no es un JSON válido. " + error.Message);
            }

            if (!(tree is Dictionary<string, object> map))
                throw new FormaBundleException("El archivo no contiene un bundle de Forma (se esperaba un objeto JSON).");
            var root = new Obj(map, "");

            var format = root.Has("format") ? root.Str("format") : null;
            if (format != FormaBundle.Format)
                throw new FormaBundleException(
                    $"Formato no soportado «{format ?? "(ninguno)"}». Este importador lee {FormaBundle.Format}.");

            var meta = root.Object("meta");
            var version = (int)meta.Num("bundleVersion");
            if (version != FormaBundle.SupportedVersion)
                throw new FormaBundleException(
                    $"Versión de bundle no soportada ({version}). Este importador lee la versión {FormaBundle.SupportedVersion}: " +
                    "actualizá el paquete Forma Studio o volvé a exportar.");

            var bundle = new FormaBundle
            {
                screenName = meta.Str("screenName"),
                screenId = meta.Str("screenId"),
            };

            var canvas = root.Object("canvas");
            bundle.referenceResolution = Vec(canvas.Object("referenceResolution"));
            bundle.matchWidthOrHeight = (float)canvas.Num("matchWidthOrHeight");

            ReadTheme(root.Object("theme"), bundle);

            var managed = root.Object("managed");
            foreach (var item in root.Array("nodes"))
            {
                var node = ReadNode(item.AsObject());
                if (bundle.byId.ContainsKey(node.id))
                    throw new FormaBundleException($"Id de nodo duplicado «{node.id}».");
                if (managed.Has(node.id))
                    foreach (var path in managed.Array(node.id)) node.managed.Add(path.AsString());
                bundle.nodes.Add(node);
                bundle.byId[node.id] = node;
            }

            Validate(bundle);
            return bundle;
        }

        static void Validate(FormaBundle bundle)
        {
            if (bundle.nodes.Count == 0) throw new FormaBundleException("El bundle no tiene nodos.");
            var roots = bundle.nodes.Where(n => n.parentId == null).ToList();
            if (roots.Count != 1 || bundle.nodes[0].parentId != null)
                throw new FormaBundleException("El bundle debe tener exactamente un nodo raíz, y debe ser el primero.");

            var seen = new HashSet<string>();
            foreach (var node in bundle.nodes)
            {
                if (node.parentId != null && !seen.Contains(node.parentId))
                    throw new FormaBundleException(
                        $"El nodo «{node.id}» apunta a un padre «{node.parentId}» que no existe o aparece después.");
                seen.Add(node.id);
            }
        }

        static void ReadTheme(Obj theme, FormaBundle bundle)
        {
            foreach (var pair in theme.Object("colors").Entries())
            {
                if (!FormaTheme.TryParseHex(pair.AsString(), out var color))
                    throw new FormaBundleException($"El color del tema «{pair.key}» no es válido: «{pair.AsString()}».");
                bundle.colors[pair.key] = color;
            }
            foreach (var pair in theme.Object("fontSizes").Entries()) bundle.fontSizes[pair.key] = (float)pair.AsNumber();
            foreach (var pair in theme.Object("spacing").Entries()) bundle.spacing[pair.key] = (float)pair.AsNumber();
            foreach (var pair in theme.Object("radii").Entries()) bundle.radii[pair.key] = (float)pair.AsNumber();
        }

        static BundleNode ReadNode(Obj o)
        {
            var node = new BundleNode
            {
                id = o.Str("id"),
                name = o.Str("name"),
                parentId = o.Has("parentId") ? o.OptStr("parentId") : null,
                siblingIndex = (int)o.Num("siblingIndex"),
                kind = o.Str("kind"),
            };
            if (string.IsNullOrEmpty(node.id)) throw new FormaBundleException("Hay un nodo sin id.");
            if (!Kinds.Contains(node.kind))
                throw new FormaBundleException($"El nodo «{node.id}» tiene un tipo desconocido «{node.kind}».");

            var rect = o.Object("rect");
            node.rect = new BundleRect
            {
                anchorMin = Vec(rect.Object("anchorMin")),
                anchorMax = Vec(rect.Object("anchorMax")),
                pivot = Vec(rect.Object("pivot")),
                anchoredPosition = Vec(rect.Object("anchoredPosition")),
                sizeDelta = Vec(rect.Object("sizeDelta")),
            };

            if (o.Has("image"))
            {
                var image = o.Object("image");
                node.image = new BundleImage
                {
                    color = ReadColor(image.Object("color")),
                    raycastTarget = image.Bool("raycastTarget"),
                    assetRef = image.Has("assetRef") ? image.Str("assetRef") : null,
                    placeholder = image.Has("placeholder") && image.Bool("placeholder"),
                };
            }
            if (o.Has("outline"))
            {
                var outline = o.Object("outline");
                node.outline = new BundleOutline { color = ReadColor(outline.Object("color")), width = (float)outline.Num("width") };
            }
            if (o.Has("cornerRadius")) node.cornerRadius = (float)o.Num("cornerRadius");
            if (o.Has("canvasGroupAlpha")) node.canvasGroupAlpha = (float)o.Num("canvasGroupAlpha");
            if (o.Has("text"))
            {
                var text = o.Object("text");
                node.text = new BundleText
                {
                    value = text.Str("value"),
                    fontSize = (float)text.Num("fontSize"),
                    color = ReadColor(text.Object("color")),
                    alignment = text.Str("alignment"),
                    fontWeight = (int)text.Num("fontWeight"),
                };
            }
            node.hasButton = o.Has("button");
            if (o.Has("layoutGroup")) node.layoutGroup = ReadLayoutGroup(o.Object("layoutGroup"));
            if (o.Has("scroll"))
            {
                var scroll = o.Object("scroll");
                node.scroll = new BundleScroll { horizontal = scroll.Bool("horizontal"), vertical = scroll.Bool("vertical") };
            }

            foreach (var item in o.Array("bindings"))
            {
                var binding = item.AsObject();
                node.bindings.Add(new BundleNodeBinding { prop = binding.Str("prop"), binding = ReadBinding(binding) });
            }
            foreach (var item in o.Array("components")) node.components.Add(ReadComponent(item.AsObject(), node.id));
            return node;
        }

        static BundleLayoutGroup ReadLayoutGroup(Obj o)
        {
            var padding = o.Object("padding");
            var group = new BundleLayoutGroup
            {
                type = o.Str("type"),
                spacing = (float)o.Num("spacing"),
                left = (int)padding.Num("left"),
                right = (int)padding.Num("right"),
                top = (int)padding.Num("top"),
                bottom = (int)padding.Num("bottom"),
                fixedColumnCount = o.Has("constraint") && o.Str("constraint") == "FixedColumnCount",
                constraintCount = o.Has("constraintCount") ? (int)o.Num("constraintCount") : 0,
            };
            if (group.type != "Grid" && group.type != "Horizontal" && group.type != "Vertical")
                throw new FormaBundleException($"Tipo de layoutGroup desconocido «{group.type}».");
            if (o.Has("cellSize")) group.cellSize = Vec(o.Object("cellSize"));
            return group;
        }

        static BundleComponent ReadComponent(Obj o, string nodeId)
        {
            var c = new BundleComponent { type = o.Str("type") };
            if (!ComponentTypes.Contains(c.type))
                throw new FormaBundleException($"El nodo «{nodeId}» usa un componente desconocido «{c.type}».");
            switch (c.type)
            {
                case "FormaTabs":
                    c.initialTabId = o.Str("initialTabId");
                    foreach (var item in o.Array("tabs"))
                    {
                        var tab = item.AsObject();
                        c.tabs.Add(new BundleTab
                        {
                            id = tab.Str("id"),
                            label = tab.Str("label"),
                            buttonNodeId = tab.Has("buttonNodeId") ? tab.Str("buttonNodeId") : null,
                            contentNodeId = tab.Str("contentNodeId"),
                        });
                    }
                    break;
                case "FormaSelectable": c.mode = o.Str("mode"); break;
                case "FormaDragDrop":
                    c.role = o.Str("role");
                    c.accepts = o.Array("accepts").Select(a => a.AsString()).ToArray();
                    c.intent = o.Str("intent");
                    break;
                case "FormaStack":
                    c.maxStack = (int)o.Num("maxStack");
                    c.showCount = o.Bool("showCount");
                    break;
                case "FormaSplit": c.intent = o.Str("intent"); break;
                case "FormaContextMenu":
                    c.trigger = o.Str("trigger");
                    foreach (var item in o.Array("actions"))
                    {
                        var action = item.AsObject();
                        c.actions.Add(new BundleAction { id = action.Str("id"), label = action.Str("label"), intent = action.Str("intent") });
                    }
                    break;
                case "FormaTooltip":
                case "FormaSlot":
                    c.binding = ReadBinding(o.Object("binding"));
                    break;
                case "FormaItemView":
                    if (o.Has("icon")) c.icon = ReadBinding(o.Object("icon"));
                    if (o.Has("quantity")) c.quantity = ReadBinding(o.Object("quantity"));
                    if (o.Has("name")) c.name = ReadBinding(o.Object("name"));
                    break;
                case "FormaEquipmentSlot": c.slotType = o.Str("slotType"); break;
            }
            return c;
        }

        static FormaBinding ReadBinding(Obj o)
        {
            var binding = new FormaBinding
            {
                dataSourceId = o.Str("dataSourceId"),
                root = o.Str("root"),
                index = o.Has("index") ? (int)o.Num("index") : -1,
                field = o.Has("field") ? o.Str("field") : null,
            };
            binding.filters = o.Array("filters").Select(f =>
            {
                var filter = f.AsObject();
                return new FormaFilter(filter.Str("field"), filter.Str("value"));
            }).ToArray();
            return binding;
        }

        static BundleColor ReadColor(Obj o)
        {
            var value = o.Str("value");
            if (!FormaTheme.TryParseHex(value, out var color))
                throw new FormaBundleException($"Color inválido «{value}» en {o.Path}.");
            return new BundleColor { color = color, token = o.Has("token") ? o.Str("token") : null };
        }

        static Vector2 Vec(Obj o) => new Vector2((float)o.Num("x"), (float)o.Num("y"));

        /// <summary>A node of the generic JSON tree with typed, path-aware accessors that throw readable errors.</summary>
        sealed class Obj
        {
            readonly Dictionary<string, object> map;
            public string Path { get; }

            public Obj(Dictionary<string, object> map, string path)
            {
                this.map = map;
                Path = path;
            }

            public bool Has(string key) => map.TryGetValue(key, out var v) && v != null;

            string Where(string key) => string.IsNullOrEmpty(Path) ? key : Path + "." + key;

            object Required(string key)
            {
                if (!map.TryGetValue(key, out var value) || value == null)
                    throw new FormaBundleException($"Falta el campo «{Where(key)}».");
                return value;
            }

            public string Str(string key) =>
                Required(key) as string ?? throw new FormaBundleException($"«{Where(key)}» debe ser texto.");

            public string OptStr(string key) => map.TryGetValue(key, out var v) ? v as string : null;

            public double Num(string key) =>
                Required(key) is double d ? d : throw new FormaBundleException($"«{Where(key)}» debe ser un número.");

            public bool Bool(string key) =>
                Required(key) is bool b ? b : throw new FormaBundleException($"«{Where(key)}» debe ser verdadero o falso.");

            public Obj Object(string key) =>
                Required(key) is Dictionary<string, object> m
                    ? new Obj(m, Where(key))
                    : throw new FormaBundleException($"«{Where(key)}» debe ser un objeto.");

            public List<Item> Array(string key)
            {
                if (!(Required(key) is List<object> list))
                    throw new FormaBundleException($"«{Where(key)}» debe ser una lista.");
                return list.Select((v, i) => new Item(null, v, $"{Where(key)}[{i}]")).ToList();
            }

            public IEnumerable<Item> Entries() => map.Select(p => new Item(p.Key, p.Value, Where(p.Key)));
        }

        sealed class Item
        {
            readonly object value;
            readonly string path;
            public readonly string key;

            public Item(string key, object value, string path)
            {
                this.key = key;
                this.value = value;
                this.path = path;
            }

            public string AsString() => value as string ?? throw new FormaBundleException($"«{path}» debe ser texto.");

            public double AsNumber() => value is double d ? d : throw new FormaBundleException($"«{path}» debe ser un número.");

            public Obj AsObject() =>
                value is Dictionary<string, object> m ? new Obj(m, path) : throw new FormaBundleException($"«{path}» debe ser un objeto.");
        }
    }
}
