using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;

namespace Forma.Studio.Editor
{
    /// <summary>
    /// Brings a Prefab hierarchy in line with a bundle, matching GameObjects by <see cref="FormaId.nodeId"/>:
    /// creates what is new, rewrites the managed properties of what exists, removes what the design dropped only when it
    /// holds nothing of the developer's, and leaves everything else (extra components, children, parents) alone.
    /// </summary>
    sealed class FormaPrefabSync
    {
        const string PreservedMessage = "conservado: tiene contenido propio del desarrollador";

        readonly FormaImportContext ctx;
        readonly FormaBundle bundle;
        readonly Dictionary<string, NodeScope> scopes = new Dictionary<string, NodeScope>();
        readonly List<string> indexOrder = new List<string>();

        public FormaPrefabSync(FormaImportContext ctx)
        {
            this.ctx = ctx;
            bundle = ctx.Bundle;
        }

        /// <summary>Syncs <paramref name="existingRoot"/> (Prefab contents) or builds a new root when it is null. Returns the root.</summary>
        public GameObject Run(GameObject existingRoot, string rootName)
        {
            if (existingRoot != null) IndexExisting(existingRoot);
            var before = bundle.nodes.Where(n => ctx.Find(n.id) != null).ToDictionary(n => n.id, n => Snapshot(n.id));

            var root = existingRoot ?? CreateRoot(rootName);
            foreach (var node in bundle.nodes) SyncNode(node, root, existingRoot != null);

            RemoveDroppedNodes(root);
            foreach (var node in bundle.nodes)
            {
                var go = ctx.Find(node.id);
                if (go != null) FormaComponentWiring.Wire(ctx, go, node, scopes[node.id]);
            }
            OrderSiblings();

            foreach (var node in bundle.nodes)
            {
                if (!before.TryGetValue(node.id, out var snapshot)) continue;
                if (snapshot != Snapshot(node.id))
                    ctx.Report.updated.Add(ImportReport.MakeEntry(node.id, node.name, "propiedades gestionadas actualizadas"));
            }
            return root;
        }

        // ---- index ----

        void IndexExisting(GameObject root)
        {
            foreach (var id in root.GetComponentsInChildren<FormaId>(true))
            {
                if (string.IsNullOrEmpty(id.nodeId)) continue;
                if (ctx.Objects.ContainsKey(id.nodeId))
                {
                    ctx.Report.warnings.Add(ImportReport.MakeEntry(id.nodeId, id.name,
                        "FormaId duplicado: se usa el primero y esta copia no se toca."));
                    continue;
                }
                ctx.Objects[id.nodeId] = id.gameObject;
                indexOrder.Add(id.nodeId);
            }
        }

        // ---- create / update ----

        GameObject CreateRoot(string rootName)
        {
            var node = bundle.Root;
            var root = FormaNodeBuilder.CreateEmpty(rootName, null, node.id);
            root.AddComponent<FormaScreen>();
            root.AddComponent<CanvasGroup>();
            LinkBundle(root.AddComponent<FormaSimulatedInventorySource>());
            return root;
        }

        void LinkBundle(FormaSimulatedInventorySource source)
        {
            if (ctx.BundleAsset == null) return;
            var serialized = new SerializedObject(source);
            var property = serialized.FindProperty("bundle");
            if (property.objectReferenceValue != null) return;
            property.objectReferenceValue = ctx.BundleAsset;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        void SyncNode(BundleNode node, GameObject root, bool updating)
        {
            GameObject go;
            NodeScope scope;
            if (node.IsRoot)
            {
                go = root;
                var id = go.GetComponent<FormaId>();
                if (id == null)
                {
                    id = go.AddComponent<FormaId>();
                    ctx.Report.warnings.Add(ImportReport.MakeEntry(node.id, node.name, "El Prefab no tenía FormaId en la raíz: se añadió."));
                }
                else if (updating && id.nodeId != node.id)
                {
                    ctx.Report.warnings.Add(ImportReport.MakeEntry(node.id, node.name,
                        $"La raíz del Prefab tenía el id «{id.nodeId}»: ahora es «{node.id}»."));
                    ctx.Objects.Remove(id.nodeId);
                }
                id.nodeId = node.id;
                ctx.Objects[node.id] = go;
                scope = updating ? NodeScope.ForExisting(node, id) : NodeScope.ForNew(node);
                if (updating)
                {
                    var source = go.GetComponent<FormaSimulatedInventorySource>();
                    if (source != null) LinkBundle(source);
                }
                else
                {
                    ctx.Report.created.Add(ImportReport.MakeEntry(node.id, node.name, node.kind));
                }
            }
            else
            {
                var container = ctx.ContainerOf(bundle.byId[node.parentId]);
                go = ctx.Find(node.id);
                if (go == null)
                {
                    go = FormaNodeBuilder.CreateEmpty(node.name, container, node.id);
                    ctx.Objects[node.id] = go;
                    scope = NodeScope.ForNew(node);
                    ctx.Report.created.Add(ImportReport.MakeEntry(node.id, node.name, node.kind));
                }
                else
                {
                    scope = NodeScope.ForExisting(node, go.GetComponent<FormaId>());
                    Reparent(node, go, container, scope);
                }
            }

            FormaNodeBuilder.ApplyVisuals(ctx, go, node, scope);
            var formaId = go.GetComponent<FormaId>();
            formaId.managedPaths = node.managed.OrderBy(p => p, StringComparer.Ordinal).ToArray();
            if (scope.IsNew && (node.kind == "contextMenu" || node.kind == "tooltip")) go.SetActive(false);
            scopes[node.id] = scope;
        }

        /// <summary>
        /// A node whose parent is not the one the design says. If the parent is a Forma node the design dropped, the design moved
        /// it out and it follows; otherwise the developer reparented it and their choice stands (reported as a conflict).
        /// </summary>
        void Reparent(BundleNode node, GameObject go, Transform expected, NodeScope scope)
        {
            var actual = go.transform.parent;
            if (actual == expected || expected == null) return;

            var actualId = actual != null ? actual.GetComponent<FormaId>() : null;
            var droppedByDesign = actualId != null && !string.IsNullOrEmpty(actualId.nodeId)
                && !bundle.byId.ContainsKey(FormaImportContext.OwnerOf(actualId.nodeId));
            if (droppedByDesign)
            {
                go.transform.SetParent(expected, false);
                return;
            }

            scope.Suppress("rect");
            ctx.Report.conflicts.Add(ImportReport.MakeEntry(node.id, node.name,
                $"El diseño lo pone dentro de «{expected.name}» pero está dentro de «{(actual != null ? actual.name : "(nada)")}»: " +
                "se conserva el padre del desarrollador y no se toca su rect."));
        }

        // ---- removal ----

        void RemoveDroppedNodes(GameObject root)
        {
            var preservedRoots = new List<Transform>();
            foreach (var id in indexOrder)
            {
                if (bundle.byId.ContainsKey(id) || bundle.byId.ContainsKey(FormaImportContext.OwnerOf(id))) continue;
                var go = ctx.Find(id);
                if (go == null || go == root) continue;
                if (preservedRoots.Any(p => go.transform.IsChildOf(p))) continue;

                var name = go.name;
                if (IsOnlyForma(go))
                {
                    UnityEngine.Object.DestroyImmediate(go);
                    ctx.Objects.Remove(id);
                    ctx.Report.removed.Add(ImportReport.MakeEntry(id, name, "eliminado: el diseño ya no lo tiene y no tenía contenido del desarrollador"));
                }
                else
                {
                    preservedRoots.Add(go.transform);
                    ctx.Preserve(id, name, PreservedMessage);
                }
            }
        }

        /// <summary>True when the GameObject and everything under it is Forma's: only managed-kind components and children that carry a FormaId.</summary>
        bool IsOnlyForma(GameObject go)
        {
            foreach (var component in go.GetComponents<Component>())
            {
                if (component == null || !IsFormaComponent(component)) return false;
                if (component is Button button && button.onClick.GetPersistentEventCount() > 0) return false;
            }
            foreach (Transform child in go.transform)
            {
                var id = child.GetComponent<FormaId>();
                if (id == null || string.IsNullOrEmpty(id.nodeId)) return false;
                if (bundle.byId.ContainsKey(id.nodeId) || bundle.byId.ContainsKey(FormaImportContext.OwnerOf(id.nodeId))) return false;
                if (!IsOnlyForma(child.gameObject)) return false;
            }
            return true;
        }

        static bool IsFormaComponent(Component component) =>
            component is Transform || component is CanvasRenderer || component is Graphic || component is Selectable
            || component is BaseMeshEffect || component is CanvasGroup || component is LayoutGroup || component is ScrollRect
            || component is Mask || component is RectMask2D
            || component.GetType().Namespace == "Forma.Studio";

        // ---- sibling order ----

        /// <summary>
        /// Puts the design's nodes in siblingIndex order inside each container, into the positions the design's nodes already
        /// occupy: anything else in the container (developer children, the button label) keeps its place.
        /// </summary>
        void OrderSiblings()
        {
            var members = new Dictionary<Transform, List<BundleNode>>();
            foreach (var node in bundle.nodes)
            {
                if (node.IsRoot) continue;
                var go = ctx.Find(node.id);
                var container = ctx.ContainerOf(bundle.byId[node.parentId]);
                if (go == null || container == null || go.transform.parent != container) continue;
                if (!members.TryGetValue(container, out var list)) members[container] = list = new List<BundleNode>();
                list.Add(node);
            }

            foreach (var pair in members)
            {
                var container = pair.Key;
                var sorted = new Queue<Transform>(pair.Value.OrderBy(n => n.siblingIndex).Select(n => ctx.Find(n.id).transform));
                var ours = new HashSet<Transform>(sorted);
                var desired = new List<Transform>();
                for (var i = 0; i < container.childCount; i++)
                {
                    var child = container.GetChild(i);
                    desired.Add(ours.Contains(child) ? sorted.Dequeue() : child);
                }
                for (var i = 0; i < desired.Count; i++)
                    if (desired[i].GetSiblingIndex() != i) desired[i].SetSiblingIndex(i);
            }
        }

        // ---- change detection ----

        /// <summary>The serialized state of a node's GameObject and its synthetic children, to tell whether an import changed it.</summary>
        string Snapshot(string nodeId)
        {
            var sb = new StringBuilder();
            AppendObject(sb, ctx.Find(nodeId));
            var prefix = nodeId + "/";
            foreach (var pair in ctx.Objects.Where(p => p.Key.StartsWith(prefix, StringComparison.Ordinal)).OrderBy(p => p.Key, StringComparer.Ordinal))
                if (pair.Value != null) AppendObject(sb, pair.Value);
            return sb.ToString();
        }

        static void AppendObject(StringBuilder sb, GameObject go)
        {
            if (go == null) return;
            sb.Append(go.name).Append('|').Append(go.activeSelf).Append('|').Append(go.transform.GetSiblingIndex());
            foreach (var component in go.GetComponents<Component>())
            {
                if (component == null) continue;
                sb.Append('|').Append(component.GetType().Name).Append(EditorJsonUtility.ToJson(component));
            }
        }
    }
}
