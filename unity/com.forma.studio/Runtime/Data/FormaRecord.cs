using System;
using System.Collections.Generic;
using System.Globalization;

namespace Forma.Studio
{
    /// <summary>
    /// One row of a collection data source (an item, a stat block, ...). Fields come from JSON or from
    /// the game's own adapter; values are string, double, bool, null or nested dictionaries.
    /// </summary>
    public sealed class FormaRecord
    {
        readonly Dictionary<string, object> fields;

        public FormaRecord(string uid, IDictionary<string, object> fields)
        {
            Uid = uid;
            this.fields = fields == null
                ? new Dictionary<string, object>()
                : new Dictionary<string, object>(fields);
        }

        /// <summary>Runtime-unique id of this row (several rows may share the same <see cref="Id"/>, e.g. split stacks).</summary>
        public string Uid { get; }

        public IReadOnlyDictionary<string, object> Fields => fields;

        /// <summary>The <c>id</c> field, which is what intent payloads call <c>itemId</c>.</summary>
        public string Id => GetString("id");

        /// <summary>Equipment slot node id this row is equipped at; owned by the built-in simulation.</summary>
        internal string EquippedAt { get; set; }

        public bool Has(string field) => TryGet(field, out _);

        /// <summary>Reads a field; a dotted path walks nested objects when no flat key matches.</summary>
        public bool TryGet(string field, out object value)
        {
            value = null;
            if (string.IsNullOrEmpty(field)) return false;
            if (fields.TryGetValue(field, out value)) return true;

            object current = fields;
            foreach (var part in field.Split('.'))
            {
                if (!(current is IDictionary<string, object> map) || !map.TryGetValue(part, out current))
                {
                    value = null;
                    return false;
                }
            }
            value = current;
            return true;
        }

        public string GetString(string field, string fallback = null) =>
            TryGet(field, out var v) && v != null ? FormaValue.Stringify(v) : fallback;

        public int GetInt(string field, int fallback = 0) =>
            TryGet(field, out var v) && FormaValue.TryNumber(v, out var n)
                ? (int)Math.Round(n)
                : fallback;

        public double GetDouble(string field, double fallback = 0) =>
            TryGet(field, out var v) && FormaValue.TryNumber(v, out var n) ? n : fallback;

        public bool GetBool(string field, bool fallback = false) =>
            TryGet(field, out var v) && v is bool b ? b : fallback;

        /// <summary>The key an <see cref="FormaIconProvider"/> maps to a sprite (the <c>icon</c> field by default).</summary>
        public string GetSpriteKey(string field = "icon") => GetString(field);

        internal void Set(string field, object value) => fields[field] = value;

        internal FormaRecord Clone(string uid) => new FormaRecord(uid, fields) { EquippedAt = EquippedAt };

        public override string ToString() => $"FormaRecord({Uid}, id={Id})";
    }

    /// <summary>Value helpers shared by records, filters and the simulation (JS-like string conversion).</summary>
    public static class FormaValue
    {
        public static bool TryNumber(object value, out double number)
        {
            switch (value)
            {
                case double d: number = d; return true;
                case float f: number = f; return true;
                case int i: number = i; return true;
                case long l: number = l; return true;
                case short s: number = s; return true;
                case byte b: number = b; return true;
                case decimal m: number = (double)m; return true;
                default: number = 0; return false;
            }
        }

        /// <summary>String form used to compare filter values: integers have no decimals, missing is "undefined".</summary>
        public static string Stringify(object value)
        {
            switch (value)
            {
                case null: return "null";
                case string s: return s;
                case bool b: return b ? "true" : "false";
                case double d:
                    return Math.Abs(d) < 1e15 && d == Math.Floor(d)
                        ? ((long)d).ToString(CultureInfo.InvariantCulture)
                        : d.ToString("R", CultureInfo.InvariantCulture);
                case IFormattable f: return f.ToString(null, CultureInfo.InvariantCulture);
                default: return value.ToString();
            }
        }
    }
}
