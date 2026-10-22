using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace Forma.Studio.Editor
{
    /// <summary>Shows the last import report of a screen: what was created, updated, removed, kept and what needs attention.</summary>
    public sealed class FormaImportReportWindow : EditorWindow
    {
        public const string LastReportKey = "Forma.LastImportReport";

        ImportReport report;
        string reportPath;
        Vector2 scroll;

        public static void Open(string reportPath)
        {
            var window = GetWindow<FormaImportReportWindow>("Forma import report");
            window.LoadReport(reportPath);
        }

        void LoadReport(string path)
        {
            reportPath = path;
            report = ImportReport.Load(path);
            Repaint();
        }

        void OnEnable()
        {
            if (report == null && !string.IsNullOrEmpty(reportPath)) report = ImportReport.Load(reportPath);
        }

        void OnGUI()
        {
            if (report == null)
            {
                EditorGUILayout.HelpBox("No hay un informe de importación para mostrar.", MessageType.Info);
                return;
            }

            using (new EditorGUILayout.HorizontalScope(EditorStyles.toolbar))
            {
                GUILayout.Label(report.screenName ?? "(sin nombre)", EditorStyles.boldLabel);
                GUILayout.FlexibleSpace();
                if (GUILayout.Button("Refrescar", EditorStyles.toolbarButton)) LoadReport(reportPath);
                if (!string.IsNullOrEmpty(report.prefabPath) && GUILayout.Button("Ver Prefab", EditorStyles.toolbarButton))
                    Selection.activeObject = AssetDatabase.LoadAssetAtPath<GameObject>(report.prefabPath);
            }

            scroll = EditorGUILayout.BeginScrollView(scroll);
            EditorGUILayout.HelpBox(report.Summary, report.Ok ? MessageType.Info : MessageType.Error);
            EditorGUILayout.LabelField("Bundle", report.bundlePath);
            EditorGUILayout.LabelField("Prefab", report.prefabPath);
            EditorGUILayout.LabelField("Importado", report.timestamp);
            if (!string.IsNullOrEmpty(report.backupPath)) EditorGUILayout.LabelField("Copia previa", report.backupPath);

            Section("Conflictos", report.conflicts, MessageType.Warning);
            Section("Avisos", report.warnings, MessageType.Warning);
            Section("Conservados", report.preserved, MessageType.None);
            Section("Creados", report.created, MessageType.None);
            Section("Actualizados", report.updated, MessageType.None);
            Section("Eliminados", report.removed, MessageType.None);
            if (report.assets.Count > 0)
            {
                EditorGUILayout.Space();
                EditorGUILayout.LabelField($"Assets ({report.assets.Count})", EditorStyles.boldLabel);
                foreach (var asset in report.assets) EditorGUILayout.LabelField(asset, EditorStyles.miniLabel);
            }
            EditorGUILayout.EndScrollView();
        }

        static void Section(string title, List<ImportReport.Entry> entries, MessageType type)
        {
            if (entries == null || entries.Count == 0) return;
            EditorGUILayout.Space();
            EditorGUILayout.LabelField($"{title} ({entries.Count})", EditorStyles.boldLabel);
            foreach (var entry in entries)
            {
                var label = string.IsNullOrEmpty(entry.name) ? entry.nodeId : $"{entry.name} [{entry.nodeId}]";
                EditorGUILayout.LabelField(label, EditorStyles.miniBoldLabel);
                EditorGUILayout.LabelField(entry.message, EditorStyles.wordWrappedMiniLabel);
            }
        }
    }
}
