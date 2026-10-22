using System;
using System.Collections.Generic;
using UnityEngine;

namespace Forma.Studio
{
    /// <summary>
    /// Maps icon keys (the item's <c>icon</c> field, e.g. <c>mock/icons/espada.png</c>) to sprites. A missing key is
    /// not an error: the item view draws a colored square with the item's initial, like the Forma preview.
    /// </summary>
    [CreateAssetMenu(menuName = "Forma/Icon Provider", fileName = "FormaIconProvider")]
    public sealed class FormaIconProvider : ScriptableObject
    {
        [Serializable]
        public struct Entry
        {
            public string key;
            public Sprite sprite;
        }

        public List<Entry> icons = new List<Entry>();

        public Sprite Get(string key)
        {
            if (string.IsNullOrEmpty(key)) return null;
            foreach (var entry in icons)
                if (entry.key == key) return entry.sprite;
            return null;
        }

        public void Add(string key, Sprite sprite)
        {
            var i = icons.FindIndex(e => e.key == key);
            var entry = new Entry { key = key, sprite = sprite };
            if (i >= 0) icons[i] = entry;
            else icons.Add(entry);
        }

        /// <summary>A stable color per key, so each item is recognisable without art (same hue rule as the preview).</summary>
        public static Color FallbackColor(string key)
        {
            var hash = 0;
            foreach (var c in key ?? string.Empty) hash = (hash * 31 + c) % 360;
            return Color.HSVToRGB(hash / 360f, 0.45f, 0.7f);
        }

        /// <summary>The upper-case first letter drawn over the fallback square; "?" when there is no name.</summary>
        public static string Initial(string name) =>
            string.IsNullOrEmpty(name) ? "?" : name.Substring(0, 1).ToUpperInvariant();
    }
}
