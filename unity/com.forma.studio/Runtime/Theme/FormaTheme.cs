using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;

namespace Forma.Studio
{
    /// <summary>
    /// The design tokens of a bundle (<c>theme.colors</c>, <c>fontSizes</c>, <c>spacing</c>, <c>radii</c>) as an asset,
    /// so a project can restyle an exported screen by editing one file. Tokens are addressed by bare name
    /// (<c>surface</c>) or by the group-prefixed token a node carries (<c>colors.surface</c>).
    /// </summary>
    [CreateAssetMenu(menuName = "Forma/Theme", fileName = "FormaTheme")]
    public sealed class FormaTheme : ScriptableObject
    {
        [Serializable]
        public struct ColorToken
        {
            public string name;
            public Color color;
        }

        [Serializable]
        public struct NumberToken
        {
            public string name;
            public float value;
        }

        public List<ColorToken> colors = new List<ColorToken>();
        public List<NumberToken> fontSizes = new List<NumberToken>();
        public List<NumberToken> spacing = new List<NumberToken>();
        public List<NumberToken> radii = new List<NumberToken>();

        /// <summary>Raised when a token changes (also from the inspector), so bound graphics restyle.</summary>
        public event Action Changed;

        static readonly string[] Groups = { "colors.", "fontSizes.", "spacing.", "radii." };

        static string Bare(string token)
        {
            if (string.IsNullOrEmpty(token)) return token;
            foreach (var group in Groups)
                if (token.StartsWith(group, StringComparison.Ordinal)) return token.Substring(group.Length);
            return token;
        }

        void OnValidate() => Changed?.Invoke();

        // ---- colors ----

        public bool TryGetColor(string token, out Color color)
        {
            var name = Bare(token);
            foreach (var entry in colors)
            {
                if (entry.name != name) continue;
                color = entry.color;
                return true;
            }
            color = default;
            return false;
        }

        public Color GetColor(string token, Color fallback) => TryGetColor(token, out var c) ? c : fallback;

        public void SetColor(string token, Color color)
        {
            var name = Bare(token);
            var entry = new ColorToken { name = name, color = color };
            var i = colors.FindIndex(c => c.name == name);
            if (i >= 0) colors[i] = entry;
            else colors.Add(entry);
            Changed?.Invoke();
        }

        // ---- numbers ----

        public bool TryGetFontSize(string token, out float size) => TryGetNumber(fontSizes, token, out size);
        public bool TryGetSpacing(string token, out float value) => TryGetNumber(spacing, token, out value);
        public bool TryGetRadius(string token, out float value) => TryGetNumber(radii, token, out value);

        public void SetFontSize(string token, float size) => SetNumber(fontSizes, token, size);
        public void SetSpacing(string token, float value) => SetNumber(spacing, token, value);
        public void SetRadius(string token, float value) => SetNumber(radii, token, value);

        static bool TryGetNumber(List<NumberToken> list, string token, out float value)
        {
            var name = Bare(token);
            foreach (var entry in list)
            {
                if (entry.name != name) continue;
                value = entry.value;
                return true;
            }
            value = 0f;
            return false;
        }

        void SetNumber(List<NumberToken> list, string token, float value)
        {
            var name = Bare(token);
            var entry = new NumberToken { name = name, value = value };
            var i = list.FindIndex(n => n.name == name);
            if (i >= 0) list[i] = entry;
            else list.Add(entry);
            Changed?.Invoke();
        }

        /// <summary>Parses <c>#rrggbb</c> or <c>#rrggbbaa</c>.</summary>
        public static bool TryParseHex(string hex, out Color color)
        {
            color = default;
            if (string.IsNullOrEmpty(hex) || hex[0] != '#' || (hex.Length != 7 && hex.Length != 9)) return false;
            if (!int.TryParse(hex.Substring(1, 6), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var rgb))
                return false;
            var alpha = 255;
            if (hex.Length == 9 &&
                !int.TryParse(hex.Substring(7, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out alpha))
                return false;
            color = new Color(((rgb >> 16) & 0xFF) / 255f, ((rgb >> 8) & 0xFF) / 255f, (rgb & 0xFF) / 255f, alpha / 255f);
            return true;
        }
    }
}
