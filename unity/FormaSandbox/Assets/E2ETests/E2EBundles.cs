using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Forma.Studio;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Forma.E2E
{
    /// <summary>
    /// Where the scenario 13.1 bundles come from. <c>FORMA_E2E_BUNDLE</c> / <c>FORMA_E2E_BUNDLE_V2</c> name a real export (a file path,
    /// absolute or relative to the project); it is copied into <see cref="Folder"/> under its own file name, so V1 and V2 must be
    /// named the same. Without them the bundles are derived from the package fixtures, which makes the fixtures runnable standalone.
    /// </summary>
    static class E2EBundles
    {
        public const string BundleEnv = "FORMA_E2E_BUNDLE";
        public const string BundleV2Env = "FORMA_E2E_BUNDLE_V2";
        /// <summary>Optional: the color the real V2 gives the <c>surfaceAlt</c> token; without it that check is skipped for a real V2.</summary>
        public const string SurfaceAltEnv = "FORMA_E2E_V2_SURFACE_ALT";
        public const string Folder = "Assets/FormaStudio/Generated/E2E";
        public const string DefaultBundlePath = Folder + "/Inventario.forma.json";
        public const string FixtureFolder = "Packages/com.forma.studio/Tests/Editor/Fixtures/";

        // standalone V2 edits
        public const string OldSurfaceColor = "#2a3140";
        public const string NewSurfaceColor = "#3a5a40";
        public const string WeightNodeId = "e2e_weight";
        public const string RenamedTitle = "Titulo renombrado";

        public static string ExternalBundle(string variable)
        {
            var value = Environment.GetEnvironmentVariable(variable);
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        /// <summary>Copies an external export into the e2e folder and returns its asset path.</summary>
        public static string PlaceExternal(string source)
        {
            Assert.IsTrue(File.Exists(source), $"The bundle in the environment variable does not exist: {source}");
            Directory.CreateDirectory(Folder);
            var destination = Folder + "/" + Path.GetFileName(source);
            if (Path.GetFullPath(source) != Path.GetFullPath(destination)) File.Copy(source, destination, true);
            AssetDatabase.ImportAsset(destination, ImportAssetOptions.ForceSynchronousImport);
            return destination;
        }

        public static string PlaceText(string json, string assetPath)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(assetPath));
            File.WriteAllText(assetPath, json);
            AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceSynchronousImport);
            return assetPath;
        }

        // ---- standalone bundles (derived from the package fixtures) ----

        /// <summary>The package's tabs fixture plus a head and a weapon equipment slot taken from the grid-equipment fixture.</summary>
        public static string BuildStandaloneV1()
        {
            var tree = Parse(FixtureText("tabs"));
            var equipment = Parse(FixtureText("grid-equipment"));
            const string panel = "node_1";
            var siblings = Nodes(tree).Cast<Dictionary<string, object>>().Count(n => (string)n["parentId"] == panel);
            var managed = (Dictionary<string, object>)tree["managed"];
            var equipmentManaged = (Dictionary<string, object>)equipment["managed"];

            var ids = new[]
            {
                (from: "node_4", to: "e2e_equip_head", item: "node_5", itemTo: "e2e_equip_head_item", y: -48.0),
                (from: "node_10", to: "e2e_equip_weapon", item: "node_11", itemTo: "e2e_equip_weapon_item", y: -128.0),
            };
            foreach (var entry in ids)
            {
                var slot = Clone(Node(equipment, entry.from));
                slot["id"] = entry.to;
                slot["parentId"] = panel;
                slot["siblingIndex"] = (double)siblings++;
                var anchored = (Dictionary<string, object>)((Dictionary<string, object>)slot["rect"])["anchoredPosition"];
                anchored["x"] = 520.0;
                anchored["y"] = entry.y;
                Nodes(tree).Add(slot);
                managed[entry.to] = Clone(equipmentManaged[entry.from]);

                var item = Clone(Node(equipment, entry.item));
                item["id"] = entry.itemTo;
                item["parentId"] = entry.to;
                Nodes(tree).Add(item);
                managed[entry.itemTo] = Clone(equipmentManaged[entry.item]);
            }

            var intents = (List<object>)tree["intents"];
            if (!intents.Cast<Dictionary<string, object>>().Any(i => (string)i["name"] == FormaIntentNames.EquipItem))
                intents.Add(Clone(((List<object>)equipment["intents"]).Cast<Dictionary<string, object>>().First(i => (string)i["name"] == FormaIntentNames.EquipItem)));
            return Write(tree);
        }

        /// <summary>
        /// A re-export of <paramref name="v1Json"/>: a theme color changes, the title is renamed, a text node "Peso total" is
        /// added and the last slot is removed from the design.
        /// </summary>
        public static string BuildStandaloneV2(string v1Json)
        {
            var tree = Parse(v1Json);
            var nodes = Nodes(tree);
            var managed = (Dictionary<string, object>)tree["managed"];

            var title = FirstNodeOfKind(tree, "text");
            title["name"] = RenamedTitle;

            var weight = Clone(title);
            weight["id"] = WeightNodeId;
            weight["name"] = "Peso total";
            weight["siblingIndex"] = (double)nodes.Cast<Dictionary<string, object>>().Count(n => (string)n["parentId"] == (string)title["parentId"]);
            var text = (Dictionary<string, object>)weight["text"];
            text["value"] = "Peso total";
            ((Dictionary<string, object>)((Dictionary<string, object>)weight["rect"])["anchoredPosition"])["x"] = 300.0;
            nodes.Add(weight);
            managed[WeightNodeId] = Clone(managed[(string)title["id"]]);

            RemoveSubtree(tree, LastSlotNodeId(tree));

            var meta = (Dictionary<string, object>)tree["meta"];
            if (meta.TryGetValue("documentRevision", out var revision) && revision is double number) meta["documentRevision"] = number + 1;

            var json = Write(tree);
            Assert.IsTrue(json.Contains(OldSurfaceColor), "the V1 bundle was expected to use " + OldSurfaceColor);
            return json.Replace(OldSurfaceColor, NewSurfaceColor);
        }

        /// <summary>What a V2 changed in the design versus V1: the renamed node and the text node it added.</summary>
        public sealed class DesignChanges
        {
            public string RenamedId, RenamedName, AddedId, AddedName, AddedText;
        }

        /// <summary>Works for the derived V2 and for a real re-export alike: it diffs the node lists of the two bundles.</summary>
        public static DesignChanges DescribeChanges(string v1Json, string v2Json)
        {
            var before = Nodes(Parse(v1Json)).Cast<Dictionary<string, object>>().ToDictionary(n => (string)n["id"]);
            var after = Nodes(Parse(v2Json)).Cast<Dictionary<string, object>>().ToList();
            var renamed = after.FirstOrDefault(n => before.TryGetValue((string)n["id"], out var old) && (string)old["name"] != (string)n["name"]);
            var added = after.FirstOrDefault(n => !before.ContainsKey((string)n["id"]) && (string)n["kind"] == "text");
            Assert.IsNotNull(renamed, "V2 renames a node of V1");
            Assert.IsNotNull(added, "V2 adds a text node");
            return new DesignChanges
            {
                RenamedId = (string)renamed["id"],
                RenamedName = (string)renamed["name"],
                AddedId = (string)added["id"],
                AddedName = (string)added["name"],
                AddedText = (string)((Dictionary<string, object>)added["text"])["value"],
            };
        }

        /// <summary>The color V2 gives <c>surfaceAlt</c>, or null when a real V2 does not say (see <see cref="SurfaceAltEnv"/>).</summary>
        public static string ExpectedSurfaceAlt(bool standalone)
        {
            if (standalone) return NewSurfaceColor;
            var value = Environment.GetEnvironmentVariable(SurfaceAltEnv);
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        /// <summary>Design node id of the last (non-equipment) slot of the bundle, the one V2 removes.</summary>
        public static string LastSlotNodeId(string bundleJson) => LastSlotNodeId(Parse(bundleJson));

        static string LastSlotNodeId(Dictionary<string, object> tree) =>
            (string)Nodes(tree).Cast<Dictionary<string, object>>().Last(n => (string)n["kind"] == "slot")["id"];

        // ---- generic tree helpers ----

        static string FixtureText(string name)
        {
            var asset = AssetDatabase.LoadAssetAtPath<TextAsset>(FixtureFolder + name + ".forma.json");
            Assert.IsNotNull(asset, "package fixture " + name);
            return asset.text;
        }

        static Dictionary<string, object> Parse(string json) => (Dictionary<string, object>)FormaMockParser.ParseJson(json);

        static T Clone<T>(T value) => (T)FormaMockParser.ParseJson(Write(value));

        static List<object> Nodes(Dictionary<string, object> tree) => (List<object>)tree["nodes"];

        static Dictionary<string, object> Node(Dictionary<string, object> tree, string id) =>
            Nodes(tree).Cast<Dictionary<string, object>>().First(n => (string)n["id"] == id);

        static Dictionary<string, object> FirstNodeOfKind(Dictionary<string, object> tree, string kind) =>
            Nodes(tree).Cast<Dictionary<string, object>>().First(n => (string)n["kind"] == kind);

        static void RemoveSubtree(Dictionary<string, object> tree, string id)
        {
            var doomed = new HashSet<string> { id };
            foreach (var node in Nodes(tree).Cast<Dictionary<string, object>>()) // parents always come before children
                if (node["parentId"] is string parent && doomed.Contains(parent)) doomed.Add((string)node["id"]);
            Nodes(tree).RemoveAll(n => doomed.Contains((string)((Dictionary<string, object>)n)["id"]));
            var managed = (Dictionary<string, object>)tree["managed"];
            foreach (var removed in doomed) managed.Remove(removed);
        }

        // ---- JSON writer for the generic tree ----

        public static string Write(object value)
        {
            var sb = new StringBuilder();
            WriteValue(sb, value);
            return sb.ToString();
        }

        static void WriteValue(StringBuilder sb, object value)
        {
            switch (value)
            {
                case null: sb.Append("null"); break;
                case bool b: sb.Append(b ? "true" : "false"); break;
                case double d: sb.Append(d.ToString("R", CultureInfo.InvariantCulture)); break;
                case string s: WriteString(sb, s); break;
                case Dictionary<string, object> map:
                    sb.Append('{');
                    var first = true;
                    foreach (var pair in map)
                    {
                        if (!first) sb.Append(',');
                        first = false;
                        WriteString(sb, pair.Key);
                        sb.Append(':');
                        WriteValue(sb, pair.Value);
                    }
                    sb.Append('}');
                    break;
                case List<object> list:
                    sb.Append('[');
                    for (var i = 0; i < list.Count; i++)
                    {
                        if (i > 0) sb.Append(',');
                        WriteValue(sb, list[i]);
                    }
                    sb.Append(']');
                    break;
                default: throw new ArgumentException("unsupported JSON value " + value.GetType());
            }
        }

        static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (var c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }
    }
}
