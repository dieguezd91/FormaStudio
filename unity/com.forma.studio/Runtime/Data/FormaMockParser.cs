using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Forma.Studio
{
    public sealed class FormaJsonException : Exception
    {
        public FormaJsonException(string message, int position)
            : base($"JSON inválido en la posición {position}: {message}") { }
    }

    /// <summary>
    /// Reads the mock rows of a bundle (or a bare JSON array of rows) into <see cref="FormaRecord"/>s.
    /// Unity's JsonUtility cannot read free-form objects, so this is a small self-contained parser.
    /// </summary>
    public static class FormaMockParser
    {
        static int nextUid = 1;

        /// <summary>Parses a JSON array of objects (a single object becomes a one-row list).</summary>
        public static List<FormaRecord> ParseRecords(string json)
        {
            var value = new Reader(json).ReadDocument();
            var records = new List<FormaRecord>();
            if (value is List<object> rows)
            {
                foreach (var row in rows)
                    if (row is Dictionary<string, object> map) records.Add(ToRecord(map));
            }
            else if (value is Dictionary<string, object> single)
            {
                records.Add(ToRecord(single));
            }
            return records;
        }

        /// <summary>Mock rows per data source id from <c>dataSources[].mock</c> of a bundle; sources without a mock are omitted.</summary>
        public static Dictionary<string, List<FormaRecord>> ParseBundle(string bundleJson)
        {
            var result = new Dictionary<string, List<FormaRecord>>();
            if (!(new Reader(bundleJson).ReadDocument() is Dictionary<string, object> bundle)) return result;
            if (!(bundle.TryGetValue("dataSources", out var list) && list is List<object> sources)) return result;

            foreach (var entry in sources)
            {
                if (!(entry is Dictionary<string, object> source)) continue;
                if (!(source.TryGetValue("id", out var id) && id is string dataSourceId)) continue;
                if (!source.TryGetValue("mock", out var mock) || mock == null) continue;

                var rows = new List<FormaRecord>();
                if (mock is List<object> array)
                {
                    foreach (var row in array)
                        if (row is Dictionary<string, object> map) rows.Add(ToRecord(map));
                }
                else if (mock is Dictionary<string, object> single)
                {
                    rows.Add(ToRecord(single));
                }
                result[dataSourceId] = rows;
            }
            return result;
        }

        static FormaRecord ToRecord(Dictionary<string, object> map) => new FormaRecord("m" + nextUid++, map);

        sealed class Reader
        {
            readonly string text;
            int pos;

            public Reader(string text) { this.text = text ?? string.Empty; }

            public object ReadDocument()
            {
                var value = ReadValue();
                SkipWhitespace();
                if (pos != text.Length) throw Fail("contenido inesperado tras el valor");
                return value;
            }

            FormaJsonException Fail(string message) => new FormaJsonException(message, pos);

            void SkipWhitespace()
            {
                while (pos < text.Length && char.IsWhiteSpace(text[pos])) pos++;
            }

            object ReadValue()
            {
                SkipWhitespace();
                if (pos >= text.Length) throw Fail("fin de texto inesperado");
                switch (text[pos])
                {
                    case '{': return ReadObject();
                    case '[': return ReadArray();
                    case '"': return ReadString();
                    case 't': Expect("true"); return true;
                    case 'f': Expect("false"); return false;
                    case 'n': Expect("null"); return null;
                    default: return ReadNumber();
                }
            }

            void Expect(string word)
            {
                if (string.CompareOrdinal(text, pos, word, 0, word.Length) != 0) throw Fail($"se esperaba «{word}»");
                pos += word.Length;
            }

            Dictionary<string, object> ReadObject()
            {
                var map = new Dictionary<string, object>();
                pos++; // {
                SkipWhitespace();
                if (pos < text.Length && text[pos] == '}') { pos++; return map; }
                while (true)
                {
                    SkipWhitespace();
                    if (pos >= text.Length || text[pos] != '"') throw Fail("se esperaba una clave");
                    var key = ReadString();
                    SkipWhitespace();
                    if (pos >= text.Length || text[pos] != ':') throw Fail("se esperaba «:»");
                    pos++;
                    map[key] = ReadValue();
                    SkipWhitespace();
                    if (pos >= text.Length) throw Fail("objeto sin cerrar");
                    if (text[pos] == ',') { pos++; continue; }
                    if (text[pos] == '}') { pos++; return map; }
                    throw Fail("se esperaba «,» o «}»");
                }
            }

            List<object> ReadArray()
            {
                var list = new List<object>();
                pos++; // [
                SkipWhitespace();
                if (pos < text.Length && text[pos] == ']') { pos++; return list; }
                while (true)
                {
                    list.Add(ReadValue());
                    SkipWhitespace();
                    if (pos >= text.Length) throw Fail("lista sin cerrar");
                    if (text[pos] == ',') { pos++; continue; }
                    if (text[pos] == ']') { pos++; return list; }
                    throw Fail("se esperaba «,» o «]»");
                }
            }

            string ReadString()
            {
                pos++; // opening quote
                var sb = new StringBuilder();
                while (pos < text.Length)
                {
                    var c = text[pos++];
                    if (c == '"') return sb.ToString();
                    if (c != '\\') { sb.Append(c); continue; }
                    if (pos >= text.Length) break;
                    var escape = text[pos++];
                    switch (escape)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (pos + 4 > text.Length || !int.TryParse(text.Substring(pos, 4), NumberStyles.HexNumber,
                                    CultureInfo.InvariantCulture, out var code))
                                throw Fail("secuencia \\u inválida");
                            sb.Append((char)code);
                            pos += 4;
                            break;
                        default: throw Fail("secuencia de escape inválida");
                    }
                }
                throw Fail("cadena sin cerrar");
            }

            double ReadNumber()
            {
                var start = pos;
                while (pos < text.Length && "+-0123456789.eE".IndexOf(text[pos]) >= 0) pos++;
                if (start == pos || !double.TryParse(text.Substring(start, pos - start), NumberStyles.Float,
                        CultureInfo.InvariantCulture, out var number))
                    throw Fail("valor inesperado");
                return number;
            }
        }
    }
}
