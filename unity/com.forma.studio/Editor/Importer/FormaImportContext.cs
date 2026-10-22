using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Forma.Studio.Editor
{
    /// <summary>What a single import run shares between the sync, the node builder and the component wiring.</summary>
    sealed class FormaImportContext
    {
        public FormaBundle Bundle;
        public ImportReport Report;
        public FormaTheme Theme;
        public TextAsset BundleAsset;
        public string SpriteFolder;

        /// <summary>GameObject by node id; also holds the synthetic children (<c>id/label</c>, <c>id/viewport</c>, <c>id/content</c>, <c>id/quantity</c>).</summary>
        public readonly Dictionary<string, GameObject> Objects = new Dictionary<string, GameObject>();

        readonly Dictionary<int, Sprite> sprites = new Dictionary<int, Sprite>();

        public GameObject Find(string id)
        {
            if (id == null || !Objects.TryGetValue(id, out var go)) return null;
            return go != null ? go : null;
        }

        public Sprite RoundedSprite(float cornerRadius)
        {
            var radius = FormaSpriteFactory.ClampRadius(cornerRadius);
            if (!sprites.TryGetValue(radius, out var sprite) || sprite == null)
            {
                sprite = FormaSpriteFactory.GetOrCreate(SpriteFolder, radius, Report);
                sprites[radius] = sprite;
            }
            return sprite;
        }

        /// <summary>Where the children of a node go: the content rect for a scroll, else the node itself.</summary>
        public Transform ContainerOf(BundleNode node)
        {
            var go = Find(node.id);
            if (go == null) return null;
            if (node.kind != "scroll") return go.transform;
            var content = Find(node.id + "/content");
            return content != null ? content.transform : go.transform;
        }

        public void Warn(BundleNode node, string message) =>
            Report.warnings.Add(ImportReport.MakeEntry(node?.id, node?.name, message));

        public void Preserve(string nodeId, string name, string message) =>
            Report.preserved.Add(ImportReport.MakeEntry(nodeId, name, message));

        /// <summary>The id of a synthetic child (<c>x/label</c>) is owned by node <c>x</c>.</summary>
        public static string OwnerOf(string id)
        {
            var slash = id.IndexOf('/');
            return slash < 0 ? id : id.Substring(0, slash);
        }
    }

    /// <summary>Which properties of one node the importer may write in this run.</summary>
    sealed class NodeScope
    {
        public bool IsNew;
        readonly HashSet<string> managed;
        public readonly HashSet<string> Gone;
        readonly HashSet<string> suppressed = new HashSet<string>();

        NodeScope(bool isNew, HashSet<string> managed, HashSet<string> gone)
        {
            IsNew = isNew;
            this.managed = managed;
            Gone = gone;
        }

        public static NodeScope ForNew(BundleNode node) =>
            new NodeScope(true, node.managed, new HashSet<string>());

        /// <summary>An existing node: the paths managed now, and the ones managed at the last import that are gone.</summary>
        public static NodeScope ForExisting(BundleNode node, FormaId id)
        {
            var previous = id != null && id.managedPaths != null ? id.managedPaths : System.Array.Empty<string>();
            var gone = new HashSet<string>(previous.Where(p => !node.managed.Contains(p)));
            return new NodeScope(false, node.managed, gone);
        }

        public bool Owns(string path) => !suppressed.Contains(path) && (IsNew || managed.Contains(path));

        /// <summary>Leaves a property alone for this run even though it is managed (e.g. the rect of a node the developer reparented).</summary>
        public void Suppress(string path) => suppressed.Add(path);

        public bool Dropped(string path) => Gone.Contains(path);

        /// <summary>The property is managed now or was until this export: the importer must reconcile it.</summary>
        public bool Touches(string path) => Owns(path) || Dropped(path);
    }
}
