using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEngine;

namespace Forma.Studio.Editor
{
    /// <summary>
    /// Turns a <c>forma.ugui-bundle/v1</c> file (<c>&lt;Screen&gt;.forma.json</c>) into a native uGUI Prefab next to it, and updates
    /// that Prefab safely when the bundle is exported again. Files written per bundle, in the bundle's folder:
    /// <c>&lt;Screen&gt;.prefab</c>, <c>&lt;Screen&gt;.theme.asset</c>, <c>&lt;Screen&gt;.import-report.json</c>,
    /// <c>Sprites/forma_round_&lt;r&gt;.png</c> and (on re-import) <c>.backup/&lt;Screen&gt;-&lt;timestamp&gt;.prefab</c>.
    /// </summary>
    public static class FormaPrefabImporter
    {
        public const string BackupFolderName = ".backup";
        public const int BackupsToKeep = 3;

        /// <summary>True while an import runs, so the asset postprocessor ignores what the import itself writes.</summary>
        public static bool IsImporting { get; private set; }

        public static string PrefabPathFor(string bundlePath) => ImportReport.SiblingPath(bundlePath, ".prefab");
        public static string ThemePathFor(string bundlePath) => ImportReport.SiblingPath(bundlePath, ".theme.asset");
        public static string ReportPathFor(string bundlePath) => ImportReport.ReportPathFor(bundlePath);

        /// <summary>Starts with a dot, which Unity does not import: backups never show up as assets or duplicate GUIDs.</summary>
        public static string BackupFolderFor(string bundlePath) =>
            Path.GetDirectoryName(bundlePath).Replace('\\', '/') + "/" + BackupFolderName;

        /// <summary>Imports (creates or updates) the Prefab for a bundle asset path like <c>Assets/FormaStudio/Generated/Inventario.forma.json</c>.</summary>
        public static ImportReport Import(string bundlePath)
        {
            bundlePath = bundlePath.Replace('\\', '/');
            var report = new ImportReport
            {
                bundlePath = bundlePath,
                screenName = ImportReport.ScreenNameOf(bundlePath),
                prefabPath = PrefabPathFor(bundlePath),
                themePath = ThemePathFor(bundlePath),
                timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
            };

            var wasImporting = IsImporting;
            IsImporting = true;
            try
            {
                Run(bundlePath, report);
            }
            catch (FormaBundleException error)
            {
                Fail(report, error.Message);
            }
            catch (Exception error)
            {
                Debug.LogException(error);
                Fail(report, "Error inesperado: " + error.Message);
            }
            finally
            {
                IsImporting = wasImporting;
            }

            WriteReport(report);
            if (report.Ok) Debug.Log(report.Summary);
            else Debug.LogError(report.Summary);
            return report;
        }

        /// <summary>The Prefab exists and the last successful import came from exactly this bundle content.</summary>
        public static bool IsUpToDate(string bundlePath)
        {
            bundlePath = bundlePath.Replace('\\', '/');
            if (!File.Exists(bundlePath) || !File.Exists(PrefabPathFor(bundlePath))) return false;
            var last = ImportReport.Load(ReportPathFor(bundlePath));
            return last != null && last.Ok && last.bundleHash == Hash(File.ReadAllText(bundlePath));
        }

        static void Run(string bundlePath, ImportReport report)
        {
            if (!File.Exists(bundlePath)) throw new FormaBundleException($"No existe el archivo {bundlePath}.");
            var json = File.ReadAllText(bundlePath);
            report.bundleHash = Hash(json);
            var bundle = FormaBundleReader.Read(json); // everything is validated before any asset is touched

            var bundleAsset = AssetDatabase.LoadAssetAtPath<TextAsset>(bundlePath);
            if (bundleAsset == null)
            {
                AssetDatabase.ImportAsset(bundlePath);
                bundleAsset = AssetDatabase.LoadAssetAtPath<TextAsset>(bundlePath);
            }
            if (AssetDatabase.FindAssets("t:TMP_Settings").Length == 0)
                report.warnings.Add(ImportReport.MakeEntry(null, null,
                    "Faltan los TextMesh Pro Essentials: importalos en Window > TextMeshPro > Import TMP Essential Resources o los textos no se verán."));

            var context = new FormaImportContext
            {
                Bundle = bundle,
                Report = report,
                BundleAsset = bundleAsset,
                SpriteFolder = Path.GetDirectoryName(bundlePath).Replace('\\', '/') + "/Sprites",
            };
            context.Theme = ApplyTheme(bundle, report);

            var existing = AssetDatabase.LoadAssetAtPath<GameObject>(report.prefabPath);
            if (existing != null) UpdatePrefab(context, bundlePath);
            else CreatePrefab(context);
            AssetDatabase.SaveAssets();
        }

        static void CreatePrefab(FormaImportContext context)
        {
            var root = new FormaPrefabSync(context).Run(null, context.Report.screenName);
            try
            {
                PrefabUtility.SaveAsPrefabAsset(root, context.Report.prefabPath);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(root);
            }
            context.Report.status = ImportReport.StatusCreated;
        }

        static void UpdatePrefab(FormaImportContext context, string bundlePath)
        {
            var report = context.Report;
            var root = PrefabUtility.LoadPrefabContents(report.prefabPath);
            try
            {
                new FormaPrefabSync(context).Run(root, report.screenName);
                report.backupPath = Backup(bundlePath, report.prefabPath);
                PrefabUtility.SaveAsPrefabAsset(root, report.prefabPath);
            }
            finally
            {
                PrefabUtility.UnloadPrefabContents(root);
            }
            report.status = ImportReport.StatusUpdated;
        }

        // ---- theme ----

        /// <summary>The bundle's tokens go into the theme asset (created on first import). Tokens the project added itself stay.</summary>
        static FormaTheme ApplyTheme(FormaBundle bundle, ImportReport report)
        {
            var theme = AssetDatabase.LoadAssetAtPath<FormaTheme>(report.themePath);
            if (theme == null)
            {
                theme = ScriptableObject.CreateInstance<FormaTheme>();
                AssetDatabase.CreateAsset(theme, report.themePath);
            }
            foreach (var pair in bundle.colors) theme.SetColor(pair.Key, pair.Value);
            foreach (var pair in bundle.fontSizes) theme.SetFontSize(pair.Key, pair.Value);
            foreach (var pair in bundle.spacing) theme.SetSpacing(pair.Key, pair.Value);
            foreach (var pair in bundle.radii) theme.SetRadius(pair.Key, pair.Value);
            EditorUtility.SetDirty(theme);
            // written now: importing the sprites later reloads unsaved assets from disk and would drop the tokens
            AssetDatabase.SaveAssetIfDirty(theme);
            report.assets.Add(report.themePath);
            return theme;
        }

        // ---- backup ----

        /// <summary>Copies the Prefab as it is now into <c>.backup/</c> and keeps only the newest <see cref="BackupsToKeep"/> of this screen.</summary>
        static string Backup(string bundlePath, string prefabPath)
        {
            var folder = BackupFolderFor(bundlePath);
            Directory.CreateDirectory(folder);
            var name = ImportReport.ScreenNameOf(bundlePath);
            var stamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fffffff");
            var backup = $"{folder}/{name}-{stamp}.prefab";
            File.Copy(prefabPath, backup, false);

            var pattern = new Regex("^" + Regex.Escape(name) + @"-\d{8}-\d{6}-\d{7}\.prefab$");
            var old = Directory.GetFiles(folder, "*.prefab")
                .Where(file => pattern.IsMatch(Path.GetFileName(file)))
                .OrderByDescending(file => Path.GetFileName(file), StringComparer.Ordinal)
                .Skip(BackupsToKeep);
            foreach (var file in old) File.Delete(file);
            return backup;
        }

        // ---- report ----

        static void Fail(ImportReport report, string message)
        {
            report.status = ImportReport.StatusFailed;
            report.error = message;
        }

        static void WriteReport(ImportReport report)
        {
            try
            {
                var path = ReportPathFor(report.bundlePath);
                File.WriteAllText(path, report.ToJson());
                AssetDatabase.ImportAsset(path);
                SessionState.SetString(FormaImportReportWindow.LastReportKey, path);
            }
            catch (Exception error)
            {
                Debug.LogWarning("[Forma] No se pudo guardar el informe de importación: " + error.Message);
            }
        }

        static string Hash(string text)
        {
            using (var sha = SHA1.Create())
                return string.Concat(sha.ComputeHash(Encoding.UTF8.GetBytes(text)).Select(b => b.ToString("x2")));
        }
    }
}
