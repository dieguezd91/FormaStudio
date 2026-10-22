using System;
using System.Collections.Generic;

namespace Forma.Studio
{
    [Serializable]
    public sealed class FormaFilter
    {
        public string field;
        public string value;

        public FormaFilter() { }

        public FormaFilter(string field, string value)
        {
            this.field = field;
            this.value = value;
        }
    }

    /// <summary>
    /// A normalized binding from the bundle (<c>items[category=Armas][3].icon</c> arrives already split
    /// into these parts; nothing in C# parses a path string).
    /// </summary>
    [Serializable]
    public sealed class FormaBinding
    {
        public string dataSourceId;
        /// <summary>First path segment; for a collection source it is the collection itself.</summary>
        public string root;
        /// <summary>Rows whose <c>field</c> (compared as a string) equals <c>value</c>; all filters apply.</summary>
        public FormaFilter[] filters = Array.Empty<FormaFilter>();
        /// <summary>Zero-based position inside the filtered rows; -1 addresses the whole filtered list.</summary>
        public int index = -1;
        /// <summary>Field of the row (dot-joined when nested); empty addresses the row itself.</summary>
        public string field;

        public FormaBinding() { }

        public FormaBinding(string dataSourceId, string root, int index = -1, params FormaFilter[] filters)
        {
            this.dataSourceId = dataSourceId;
            this.root = root;
            this.index = index;
            this.filters = filters ?? Array.Empty<FormaFilter>();
        }

        public bool IsEmpty => string.IsNullOrEmpty(dataSourceId);

        /// <summary>Identifies the view (data source + root + filters) regardless of position or field.</summary>
        public string ViewKey => ViewKeyOf(dataSourceId, root, filters);

        public bool Matches(FormaRecord record) => MatchesFilters(filters, record);

        public static string ViewKeyOf(string dataSourceId, string root, IEnumerable<FormaFilter> filters)
        {
            var key = dataSourceId + "|" + root;
            if (filters != null)
                foreach (var f in filters) key += $"[{f.field}={f.value}]";
            return key;
        }

        public static bool MatchesFilters(IEnumerable<FormaFilter> filters, FormaRecord record)
        {
            if (record == null) return false;
            if (filters == null) return true;
            foreach (var f in filters)
            {
                var actual = record.TryGet(f.field, out var v) ? FormaValue.Stringify(v) : "undefined";
                if (actual != f.value) return false;
            }
            return true;
        }
    }

    /// <summary>Reads what a binding points at from a data source.</summary>
    public static class FormaBindingResolver
    {
        /// <summary>The row at <c>binding.index</c> of the view (the first row when no index); null for an empty slot.</summary>
        public static FormaRecord ResolveRecord(IFormaDataSource source, FormaBinding binding)
        {
            if (source == null || binding == null) return null;
            var view = source.GetView(binding);
            var position = binding.index < 0 ? 0 : binding.index;
            return view != null && position < view.Count ? view[position] : null;
        }

        /// <summary>Same as <see cref="ResolveRecord"/> but an equipment slot reads what is equipped at it.</summary>
        public static FormaRecord ResolveRecord(IFormaDataSource source, FormaBinding binding, string equipmentSlotId) =>
            equipmentSlotId != null ? source?.GetEquipped(equipmentSlotId) : ResolveRecord(source, binding);

        public static object ResolveField(IFormaDataSource source, FormaBinding binding, string equipmentSlotId = null)
        {
            var record = ResolveRecord(source, binding, equipmentSlotId);
            return record != null && record.TryGet(binding.field, out var value) ? value : null;
        }
    }
}
