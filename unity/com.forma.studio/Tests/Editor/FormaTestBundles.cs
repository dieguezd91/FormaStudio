using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Forma.Studio.Editor.Tests
{
    /// <summary>
    /// Loads the exported fixtures as a generic JSON tree, edits it in memory (the way a re-export changes a bundle) and
    /// writes it back to a temporary folder under Assets.
    /// </summary>
    static class FormaTestBundles
    {
        public const string FixtureFolder = "Packages/com.forma.studio/Tests/Editor/Fixtures/";
        public const string TempFolder = "Assets/FormaImporterTests";
        public const string BundlePath = TempFolder + "/Inventario.forma.json";

        public static Dictionary<string, object> LoadFixture(string name)
        {
            var asset = AssetDatabase.LoadAssetAtPath<TextAsset>(FixtureFolder + name + ".forma.json");
            Assert.IsNotNull(asset, "fixture " + name);
            return (Dictionary<string, object>)FormaMockParser.ParseJson(asset.text);
        }

        public static void WriteBundle(object tree, string path = BundlePath) => WriteText(Write(tree), path);

        public static void WriteText(string json, string path = BundlePath)
        {
            File.WriteAllText(path, json);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
        }

        public static void ResetTempFolder()
        {
            if (AssetDatabase.IsValidFolder(TempFolder)) AssetDatabase.DeleteAsset(TempFolder);
            AssetDatabase.CreateFolder("Assets", "FormaImporterTests");
        }

        public static void DeleteTempFolder()
        {
            if (AssetDatabase.IsValidFolder(TempFolder)) AssetDatabase.DeleteAsset(TempFolder);
        }

        // ---- tree access ----

        public static List<object> Nodes(Dictionary<string, object> tree) => (List<object>)tree["nodes"];

        public static Dictionary<string, object> Node(Dictionary<string, object> tree, string id) =>
            Nodes(tree).Cast<Dictionary<string, object>>().First(n => (string)n["id"] == id);

        public static Dictionary<string, object> Child(Dictionary<string, object> map, string key) =>
            (Dictionary<string, object>)map[key];

        public static void Managed(Dictionary<string, object> tree, string nodeId, params string[] paths) =>
            ((Dictionary<string, object>)tree["managed"])[nodeId] = paths.Cast<object>().ToList();

        public static void RemoveNode(Dictionary<string, object> tree, string id)
        {
            Nodes(tree).Remove(Node(tree, id));
            ((Dictionary<string, object>)tree["managed"]).Remove(id);
        }

        public static void RemoveSubtree(Dictionary<string, object> tree, string id)
        {
            foreach (var child in Nodes(tree).Cast<Dictionary<string, object>>().Where(n => (string)n["parentId"] == id).ToList())
                RemoveSubtree(tree, (string)child["id"]);
            RemoveNode(tree, id);
        }

        /// <summary>Adds a node under <paramref name="parentId"/> at <paramref name="siblingIndex"/>, shifting later siblings.</summary>
        public static Dictionary<string, object> AddNode(
            Dictionary<string, object> tree, string id, string name, string parentId, int siblingIndex, string kind,
            float x = 0, float y = 0, float w = 100, float h = 30, string text = null,
            List<object> bindings = null, List<object> components = null)
        {
            foreach (Dictionary<string, object> sibling in Nodes(tree).Cast<Dictionary<string, object>>().ToList())
            {
                if ((string)sibling["parentId"] == parentId && (double)sibling["siblingIndex"] >= siblingIndex)
                    sibling["siblingIndex"] = (double)sibling["siblingIndex"] + 1;
            }
            var node = new Dictionary<string, object>
            {
                ["id"] = id,
                ["name"] = name,
                ["parentId"] = parentId,
                ["siblingIndex"] = (double)siblingIndex,
                ["kind"] = kind,
                ["rect"] = MakeRect(x, y, w, h),
                ["bindings"] = bindings ?? new List<object>(),
                ["components"] = components ?? new List<object>(),
            };
            var managed = new List<string> { "name", "parentId", "siblingIndex", "kind", "rect" };
            if (text != null)
            {
                node["text"] = new Dictionary<string, object>
                {
                    ["value"] = text,
                    ["fontSize"] = 14.0,
                    ["color"] = new Dictionary<string, object> { ["value"] = "#ffffff" },
                    ["alignment"] = "Left",
                    ["fontWeight"] = 400.0,
                };
                managed.AddRange(new[] { "text.value", "text.fontSize", "text.color", "text.alignment", "text.fontWeight" });
            }
            else if (kind != "container")
            {
                node["image"] = new Dictionary<string, object>
                {
                    ["color"] = new Dictionary<string, object> { ["value"] = "#102030" },
                    ["raycastTarget"] = false,
                };
                managed.AddRange(new[] { "image.color", "image.raycastTarget" });
            }
            if (bindings != null && bindings.Count > 0) managed.Add("bindings");
            Nodes(tree).Add(node);
            Managed(tree, id, managed.ToArray());
            return node;
        }

        static Dictionary<string, object> Vec(double x, double y) =>
            new Dictionary<string, object> { ["x"] = x, ["y"] = y };

        static Dictionary<string, object> MakeRect(float x, float y, float w, float h) =>
            new Dictionary<string, object>
            {
                ["anchorMin"] = Vec(0, 1),
                ["anchorMax"] = Vec(0, 1),
                ["pivot"] = Vec(0, 1),
                ["anchoredPosition"] = Vec(x, -y),
                ["sizeDelta"] = Vec(w, h),
            };

        public static Dictionary<string, object> BindingMap(
            string dataSourceId, string field = null, int index = 0, string prop = null)
        {
            var map = new Dictionary<string, object>
            {
                ["dataSourceId"] = dataSourceId,
                ["root"] = "items",
                ["filters"] = new List<object>(),
                ["index"] = (double)index,
            };
            if (field != null) map["field"] = field;
            if (prop != null) map["prop"] = prop;
            return map;
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
                case IEnumerable<string> strings:
                    WriteValue(sb, strings.Cast<object>().ToList());
                    break;
                default: throw new System.ArgumentException("unsupported JSON value " + value.GetType());
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
