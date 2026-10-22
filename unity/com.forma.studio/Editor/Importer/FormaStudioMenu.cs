using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace Forma.Studio.Editor
{
    static class FormaStudioMenu
    {
        const string ReimportItem = FormaStudioEditorInfo.MenuRoot + "/Reimport bundle";
        const string ReportItem = FormaStudioEditorInfo.MenuRoot + "/Open import report";
        const string CanvasItem = FormaStudioEditorInfo.MenuRoot + "/Create Canvas for prefab";

        static string[] SelectedBundles() =>
            Selection.assetGUIDs.Select(AssetDatabase.GUIDToAssetPath).Where(FormaBundlePostprocessor.IsBundlePath).ToArray();

        [MenuItem(ReimportItem, true)]
        static bool CanReimport() => SelectedBundles().Length > 0;

        [MenuItem(ReimportItem)]
        static void Reimport()
        {
            foreach (var path in SelectedBundles()) FormaPrefabImporter.Import(path);
        }

        [MenuItem(ReportItem)]
        static void OpenReport()
        {
            var path = ReportForSelection() ?? SessionState.GetString(FormaImportReportWindow.LastReportKey, null);
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
            {
                var found = AssetDatabase.FindAssets("import-report t:TextAsset")
                    .Select(AssetDatabase.GUIDToAssetPath).FirstOrDefault(p => p.EndsWith(".import-report.json"));
                path = found;
            }
            if (string.IsNullOrEmpty(path))
            {
                EditorUtility.DisplayDialog("Forma Studio", "Todavía no hay informes de importación en el proyecto.", "OK");
                return;
            }
            FormaImportReportWindow.Open(path);
        }

        /// <summary>The report next to the selected bundle or Prefab, if any.</summary>
        static string ReportForSelection()
        {
            foreach (var guid in Selection.assetGUIDs)
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                var screen = FormaBundlePostprocessor.IsBundlePath(path)
                    ? ImportReport.ScreenNameOf(path)
                    : path.EndsWith(".prefab") ? Path.GetFileNameWithoutExtension(path) : null;
                if (screen == null) continue;
                var report = Path.GetDirectoryName(path).Replace('\\', '/') + "/" + screen + ".import-report.json";
                if (File.Exists(report)) return report;
            }
            return null;
        }

        static GameObject SelectedFormaPrefab()
        {
            var go = Selection.activeObject as GameObject;
            if (go == null || !EditorUtility.IsPersistent(go) || go.GetComponent<FormaScreen>() == null) return null;
            return go;
        }

        [MenuItem(CanvasItem, true)]
        static bool CanCreateCanvas() => SelectedFormaPrefab() != null;

        [MenuItem(CanvasItem)]
        static void CreateCanvas() => FormaCanvasBuilder.CreateCanvasForPrefab(SelectedFormaPrefab());
    }
}
