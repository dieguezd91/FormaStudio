using System.Collections.Generic;
using System.Linq;
using UnityEditor;

namespace Forma.Studio.Editor
{
    /// <summary>
    /// Imports a <c>*.forma.json</c> bundle as soon as it appears or changes under <c>Assets/</c>. The work is deferred with
    /// <see cref="EditorApplication.delayCall"/>: creating assets from inside OnPostprocessAllAssets is not allowed.
    /// A bundle whose content is identical to the last successful import is skipped (e.g. after "Reimport All").
    /// </summary>
    public sealed class FormaBundlePostprocessor : AssetPostprocessor
    {
        public const string BundleExtension = ".forma.json";

        /// <summary>Turns the automatic import off (tests and scripted imports that call the importer themselves).</summary>
        public static bool Enabled = true;

        static readonly HashSet<string> pending = new HashSet<string>();
        static bool scheduled;

        public static bool IsBundlePath(string path) =>
            !string.IsNullOrEmpty(path)
            && path.StartsWith("Assets/", System.StringComparison.Ordinal)
            && path.EndsWith(BundleExtension, System.StringComparison.OrdinalIgnoreCase);

        static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom)
        {
            if (!Enabled || FormaPrefabImporter.IsImporting) return;
            foreach (var path in imported.Concat(moved))
                if (IsBundlePath(path)) pending.Add(path);
            if (pending.Count == 0 || scheduled) return;
            scheduled = true;
            EditorApplication.delayCall += Flush;
        }

        static void Flush()
        {
            scheduled = false;
            var paths = pending.ToArray();
            pending.Clear();
            if (!Enabled) return;
            foreach (var path in paths)
                if (!FormaPrefabImporter.IsUpToDate(path)) FormaPrefabImporter.Import(path);
        }
    }
}
