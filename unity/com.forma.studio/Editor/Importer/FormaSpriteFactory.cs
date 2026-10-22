using System.IO;
using UnityEditor;
using UnityEngine;

namespace Forma.Studio.Editor
{
    /// <summary>
    /// uGUI has no native rounded corners, so a node with <c>cornerRadius</c> gets a white rounded-rectangle PNG sprite with
    /// 9-slice borders (tinted by <c>Image.color</c>). One sprite per radius, written under <c>Sprites/</c> next to the bundle.
    /// </summary>
    static class FormaSpriteFactory
    {
        public const string FilePrefix = "forma_round_";
        const int MaxRadius = 256;
        const float PixelsPerUnit = 100f;

        public static string PathFor(string spriteFolder, int radius) => $"{spriteFolder}/{FilePrefix}{radius}.png";

        /// <summary>True for the sprites this factory wrote (so the importer may replace or clear them, never a hand-assigned one).</summary>
        public static bool IsGenerated(Sprite sprite)
        {
            if (sprite == null) return false;
            var path = AssetDatabase.GetAssetPath(sprite);
            return !string.IsNullOrEmpty(path) && Path.GetFileName(path).StartsWith(FilePrefix);
        }

        public static int ClampRadius(float radius) => Mathf.Clamp(Mathf.RoundToInt(radius), 1, MaxRadius);

        /// <summary>The rounded sprite for <paramref name="radius"/>, creating the PNG and its import settings when missing.</summary>
        public static Sprite GetOrCreate(string spriteFolder, int radius, ImportReport report)
        {
            var path = PathFor(spriteFolder, radius);
            var sprite = AssetDatabase.LoadAssetAtPath<Sprite>(path);
            if (sprite != null) return Register(report, path, sprite);

            EnsureFolder(spriteFolder);
            var texture = Render(radius);
            File.WriteAllBytes(path, texture.EncodeToPNG());
            Object.DestroyImmediate(texture);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.spritePixelsPerUnit = PixelsPerUnit;
            importer.spriteBorder = new Vector4(radius, radius, radius, radius);
            importer.mipmapEnabled = false;
            importer.alphaIsTransparency = true;
            importer.filterMode = FilterMode.Bilinear;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.SaveAndReimport();
            return Register(report, path, AssetDatabase.LoadAssetAtPath<Sprite>(path));
        }

        static Sprite Register(ImportReport report, string path, Sprite sprite)
        {
            if (!report.assets.Contains(path)) report.assets.Add(path);
            return sprite;
        }

        static void EnsureFolder(string folder)
        {
            if (AssetDatabase.IsValidFolder(folder)) return;
            var parent = Path.GetDirectoryName(folder).Replace('\\', '/');
            if (!AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(folder));
        }

        /// <summary>A (2r+2) square: the four r-pixel corners are rounded and a 2 px band in the middle stretches.</summary>
        static Texture2D Render(int radius)
        {
            var size = 2 * radius + 2;
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
            var pixels = new Color32[size * size];
            var half = size / 2f;
            for (var y = 0; y < size; y++)
            {
                for (var x = 0; x < size; x++)
                {
                    // signed distance to a rounded box, anti-aliased over one pixel
                    var qx = Mathf.Abs(x + 0.5f - half) - (half - radius);
                    var qy = Mathf.Abs(y + 0.5f - half) - (half - radius);
                    var outside = new Vector2(Mathf.Max(qx, 0f), Mathf.Max(qy, 0f)).magnitude;
                    var distance = outside + Mathf.Min(Mathf.Max(qx, qy), 0f) - radius;
                    var alpha = Mathf.Clamp01(0.5f - distance);
                    pixels[y * size + x] = new Color32(255, 255, 255, (byte)Mathf.RoundToInt(alpha * 255f));
                }
            }
            texture.SetPixels32(pixels);
            texture.Apply(false);
            return texture;
        }
    }
}
