using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Forma.Studio
{
    /// <summary>Applies theme tokens to a Graphic (Image or TMP text) so editing the <see cref="FormaTheme"/> retheme the screen.</summary>
    [AddComponentMenu("Forma/Forma Theme Binding")]
    public sealed class FormaThemeBinding : MonoBehaviour
    {
        public FormaTheme theme;
        [Tooltip("Token for the color, e.g. colors.surface. Empty leaves the color alone.")]
        public string colorToken;
        [Tooltip("Token for the font size of a TMP text, e.g. fontSizes.body. Empty leaves it alone.")]
        public string fontSizeToken;
        [Tooltip("Keep the alpha the Graphic already has (for nodes whose opacity differs from the token).")]
        public bool preserveAlpha;
        [Tooltip("Optional. Empty uses the Graphic on this GameObject.")]
        public Graphic target;

        FormaTheme subscribed;

        void OnEnable()
        {
            Subscribe();
            Apply();
        }

        void OnDisable()
        {
            if (subscribed != null) subscribed.Changed -= Apply;
            subscribed = null;
        }

        void OnValidate() => Apply();

        void Subscribe()
        {
            if (subscribed == theme) return;
            if (subscribed != null) subscribed.Changed -= Apply;
            subscribed = theme;
            if (subscribed != null) subscribed.Changed += Apply;
        }

        public void Apply()
        {
            if (theme == null) return;
            var graphic = target != null ? target : GetComponent<Graphic>();
            if (graphic == null) return;

            if (!string.IsNullOrEmpty(colorToken) && theme.TryGetColor(colorToken, out var color))
            {
                if (preserveAlpha) color.a = graphic.color.a;
                graphic.color = color;
            }
            if (!string.IsNullOrEmpty(fontSizeToken) && graphic is TMP_Text text && theme.TryGetFontSize(fontSizeToken, out var size))
                text.fontSize = size;
        }
    }
}
