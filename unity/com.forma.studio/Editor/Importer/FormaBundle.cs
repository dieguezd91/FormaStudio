using System;
using System.Collections.Generic;
using UnityEngine;

namespace Forma.Studio.Editor
{
    /// <summary>An invalid or unsupported bundle. The message is shown to the user as is.</summary>
    public sealed class FormaBundleException : Exception
    {
        public FormaBundleException(string message) : base(message) { }
    }

    /// <summary>In-memory form of a <c>forma.ugui-bundle/v1</c> file (see docs/export/ugui-bundle.md).</summary>
    public sealed class FormaBundle
    {
        public const string Format = "forma.ugui-bundle/v1";
        public const int SupportedVersion = 1;

        public string screenName;
        public string screenId;
        public Vector2 referenceResolution = new Vector2(1920, 1080);
        public float matchWidthOrHeight = 0.5f;

        /// <summary>Resolved design tokens by bare name.</summary>
        public Dictionary<string, Color> colors = new Dictionary<string, Color>();
        public Dictionary<string, float> fontSizes = new Dictionary<string, float>();
        public Dictionary<string, float> spacing = new Dictionary<string, float>();
        public Dictionary<string, float> radii = new Dictionary<string, float>();

        /// <summary>Parents always precede their children.</summary>
        public List<BundleNode> nodes = new List<BundleNode>();
        public Dictionary<string, BundleNode> byId = new Dictionary<string, BundleNode>();

        public BundleNode Root => nodes[0];
    }

    public sealed class BundleColor
    {
        public Color color;
        public string token;
        public bool HasToken => !string.IsNullOrEmpty(token);
    }

    public sealed class BundleRect
    {
        public Vector2 anchorMin, anchorMax, pivot, anchoredPosition, sizeDelta;
    }

    public sealed class BundleImage
    {
        public BundleColor color;
        public bool raycastTarget;
        public string assetRef;
        public bool placeholder;
    }

    public sealed class BundleOutline
    {
        public BundleColor color;
        public float width;
    }

    public sealed class BundleText
    {
        public string value;
        public float fontSize;
        public BundleColor color;
        /// <summary><c>Left</c>, <c>Center</c> or <c>Right</c>.</summary>
        public string alignment;
        public int fontWeight;
    }

    public sealed class BundleLayoutGroup
    {
        /// <summary><c>Grid</c>, <c>Horizontal</c> or <c>Vertical</c>.</summary>
        public string type;
        public Vector2? cellSize;
        public float spacing;
        public int left, right, top, bottom;
        public bool fixedColumnCount;
        public int constraintCount;
    }

    public sealed class BundleScroll
    {
        public bool horizontal, vertical;
    }

    public sealed class BundleNodeBinding
    {
        public string prop;
        public FormaBinding binding;
    }

    public sealed class BundleTab
    {
        public string id, label, buttonNodeId, contentNodeId;
    }

    public sealed class BundleAction
    {
        public string id, label, intent;
    }

    /// <summary>One entry of <c>node.components</c>; only the fields of its <see cref="type"/> are set.</summary>
    public sealed class BundleComponent
    {
        public string type;
        public List<BundleTab> tabs = new List<BundleTab>();
        public string initialTabId;
        public string mode;
        public string role;
        public string[] accepts = Array.Empty<string>();
        public string intent;
        public int maxStack = 1;
        public bool showCount = true;
        public string trigger;
        public List<BundleAction> actions = new List<BundleAction>();
        public FormaBinding binding;
        public FormaBinding icon, quantity, name;
        public string slotType;
    }

    public sealed class BundleNode
    {
        public string id, name, parentId, kind;
        public int siblingIndex;
        public BundleRect rect;
        public BundleImage image;
        public BundleOutline outline;
        public float? cornerRadius;
        public float? canvasGroupAlpha;
        public BundleText text;
        public bool hasButton;
        public BundleLayoutGroup layoutGroup;
        public BundleScroll scroll;
        public List<BundleNodeBinding> bindings = new List<BundleNodeBinding>();
        public List<BundleComponent> components = new List<BundleComponent>();

        /// <summary>The property paths Forma owns on this node (<c>managed[id]</c>).</summary>
        public HashSet<string> managed = new HashSet<string>();

        public bool IsRoot => parentId == null;

        public BundleComponent Component(string type) => components.Find(c => c.type == type);
    }
}
