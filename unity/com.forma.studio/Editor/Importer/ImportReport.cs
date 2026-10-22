using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace Forma.Studio.Editor
{
    /// <summary>What one import did: saved next to the Prefab as <c>&lt;Screen&gt;.import-report.json</c> and shown by the report window.</summary>
    [Serializable]
    public sealed class ImportReport
    {
        public const string StatusCreated = "created";
        public const string StatusUpdated = "updated";
        public const string StatusFailed = "failed";

        [Serializable]
        public sealed class Entry
        {
            public string nodeId;
            public string name;
            public string message;
        }

        public string status = StatusFailed;
        public string error;
        public string screenName;
        public string bundlePath;
        public string bundleHash;
        public string prefabPath;
        public string themePath;
        public string backupPath;
        public string timestamp;

        /// <summary>Nodes (GameObjects) created from the design.</summary>
        public List<Entry> created = new List<Entry>();
        /// <summary>Existing nodes whose managed properties were rewritten.</summary>
        public List<Entry> updated = new List<Entry>();
        /// <summary>Things kept as the developer left them (removed nodes with their own content, hand-assigned sprites...).</summary>
        public List<Entry> preserved = new List<Entry>();
        /// <summary>Differences between the design and the Prefab that the importer did not resolve.</summary>
        public List<Entry> conflicts = new List<Entry>();
        public List<Entry> warnings = new List<Entry>();
        /// <summary>Nodes deleted because the design removed them and they held nothing of the developer's.</summary>
        public List<Entry> removed = new List<Entry>();
        /// <summary>Generated sprites and other assets written or reused.</summary>
        public List<string> assets = new List<string>();

        public bool Ok => status != StatusFailed;

        public static Entry MakeEntry(string nodeId, string name, string message) =>
            new Entry { nodeId = nodeId, name = name, message = message };

        public string Summary =>
            Ok
                ? $"[Forma] {screenName}: {status} — {created.Count} creados, {updated.Count} actualizados, " +
                  $"{removed.Count} eliminados, {preserved.Count} conservados, {conflicts.Count} conflictos, " +
                  $"{warnings.Count} avisos."
                : $"[Forma] {screenName}: importación fallida — {error}";

        public static string ReportPathFor(string bundlePath) => SiblingPath(bundlePath, ".import-report.json");

        public static string SiblingPath(string bundlePath, string suffix) =>
            Path.GetDirectoryName(bundlePath).Replace('\\', '/') + "/" + ScreenNameOf(bundlePath) + suffix;

        /// <summary>File name without the <c>.forma.json</c> extension.</summary>
        public static string ScreenNameOf(string bundlePath)
        {
            var file = Path.GetFileName(bundlePath);
            const string extension = ".forma.json";
            return file.EndsWith(extension, StringComparison.OrdinalIgnoreCase)
                ? file.Substring(0, file.Length - extension.Length)
                : Path.GetFileNameWithoutExtension(file);
        }

        public string ToJson() => JsonUtility.ToJson(this, true);

        public static ImportReport FromJson(string json) => JsonUtility.FromJson<ImportReport>(json);

        public static ImportReport Load(string reportPath) =>
            File.Exists(reportPath) ? FromJson(File.ReadAllText(reportPath)) : null;
    }
}
