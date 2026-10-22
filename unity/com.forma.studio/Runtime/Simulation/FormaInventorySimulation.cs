using System;
using System.Collections.Generic;
using System.Linq;

namespace Forma.Studio
{
    /// <summary>What the simulation needs to know about one slot node (read from the screen's components).</summary>
    public sealed class FormaSimSlot
    {
        /// <summary>Design node id (<see cref="FormaId.nodeId"/>), the key used in intent payloads.</summary>
        public string NodeId;
        public string DataSourceId;
        public string Root = "items";
        public FormaFilter[] Filters = Array.Empty<FormaFilter>();
        /// <summary>Position inside the filtered view; -1 when the slot has no view position.</summary>
        public int Index = -1;
        public bool IsEquipment;
        public string EquipmentSlotType;
        public bool HasDragDrop;
        public FormaDragRole Role = FormaDragRole.Both;
        public string[] Accepts = Array.Empty<string>();
        /// <summary>Limit of the nearest <see cref="FormaStack"/>; 0 when there is none.</summary>
        public int MaxStack;
    }

    /// <summary>
    /// Port of packages/runtime/src/simulation.ts + records.ts: the stand-in for the game, as plain C# so it can
    /// be tested without Unity objects. Per-view slot placement, merge/swap/move, equip, split, use, drop, reset.
    /// Rejection reasons are the same Spanish strings as the TypeScript runtime.
    /// </summary>
    public sealed class FormaInventorySimulation
    {
        sealed class Cell
        {
            public string DataSourceId;
            public FormaFilter[] Filters;
            /// <summary>Null for equipment cells.</summary>
            public string ViewKey;
            public int Index;
            public string EquipmentId;
        }

        sealed class View
        {
            public string Key;
            public string DataSourceId;
            public FormaFilter[] Filters;
            public int Capacity;
        }

        readonly IReadOnlyList<FormaSimSlot> slotList;
        readonly Dictionary<string, FormaSimSlot> slots = new Dictionary<string, FormaSimSlot>();
        readonly Dictionary<string, Cell> cells = new Dictionary<string, Cell>();
        readonly Dictionary<string, View> views = new Dictionary<string, View>();
        readonly Dictionary<string, List<FormaRecord>> mocks = new Dictionary<string, List<FormaRecord>>();

        readonly Dictionary<string, List<FormaRecord>> data = new Dictionary<string, List<FormaRecord>>();
        readonly Dictionary<string, List<string>> placement = new Dictionary<string, List<string>>();
        int nextUid;

        public FormaInventorySimulation(
            IReadOnlyList<FormaSimSlot> slots,
            IReadOnlyDictionary<string, List<FormaRecord>> mocks)
        {
            slotList = slots ?? new List<FormaSimSlot>();
            foreach (var pair in mocks ?? new Dictionary<string, List<FormaRecord>>())
                this.mocks[pair.Key] = pair.Value ?? new List<FormaRecord>();

            var fallbackSource = this.mocks.Keys.FirstOrDefault();
            foreach (var slot in slotList)
            {
                if (string.IsNullOrEmpty(slot.NodeId)) continue;
                this.slots[slot.NodeId] = slot;
                var dataSourceId = slot.DataSourceId;
                if (string.IsNullOrEmpty(dataSourceId) && slot.IsEquipment) dataSourceId = fallbackSource;
                if (string.IsNullOrEmpty(dataSourceId)) continue;
                if (!slot.IsEquipment && slot.Index < 0) continue;

                var filters = slot.Filters ?? Array.Empty<FormaFilter>();
                var cell = new Cell
                {
                    DataSourceId = dataSourceId,
                    Filters = filters,
                    ViewKey = slot.IsEquipment ? null : FormaBinding.ViewKeyOf(dataSourceId, slot.Root, filters),
                    Index = Math.Max(0, slot.Index),
                    EquipmentId = slot.IsEquipment ? slot.NodeId : null,
                };
                cells[slot.NodeId] = cell;

                if (slot.IsEquipment) continue;
                if (!views.TryGetValue(cell.ViewKey, out var view))
                    views[cell.ViewKey] = view = new View { Key = cell.ViewKey, DataSourceId = dataSourceId, Filters = filters };
                view.Capacity = Math.Max(view.Capacity, cell.Index + 1);
            }
            Reset();
        }

        /// <summary>Restores the mock data, claims equipment and fills the views again.</summary>
        public void Reset()
        {
            data.Clear();
            placement.Clear();
            nextUid = 1;
            foreach (var pair in mocks)
                data[pair.Key] = pair.Value.Select(r => r.Clone("r" + nextUid++)).ToList();

            // The mock paper doll shows items in the equipment slots: those items start equipped.
            foreach (var slot in slotList)
            {
                if (!slot.IsEquipment || !cells.TryGetValue(slot.NodeId, out var cell)) continue;
                var candidate = Members(RecordsOf(cell.DataSourceId), cell.Filters).Skip(cell.Index).FirstOrDefault();
                if (candidate != null) candidate.EquippedAt = slot.NodeId;
            }
            Reconcile();
        }

        // ---- reading ----

        /// <summary>Records of a view in slot order (null = empty slot). Views no slot addresses are the filtered, unequipped rows.</summary>
        public IReadOnlyList<FormaRecord> GetView(FormaBinding binding)
        {
            var records = RecordsOf(binding.dataSourceId);
            if (!views.TryGetValue(binding.ViewKey, out var view))
                return Members(records, binding.filters).ToList();

            var byUid = records.ToDictionary(r => r.Uid);
            var layout = placement.TryGetValue(view.Key, out var uids) ? uids : new List<string>();
            var result = new List<FormaRecord>();
            for (var i = 0; i < Math.Max(layout.Count, view.Capacity); i++)
            {
                var uid = i < layout.Count ? layout[i] : null;
                result.Add(uid != null && byUid.TryGetValue(uid, out var record) ? record : null);
            }
            return result;
        }

        public FormaRecord GetEquipped(string equipmentSlotId) =>
            cells.TryGetValue(equipmentSlotId ?? string.Empty, out var cell) && cell.EquipmentId != null
                ? RecordAt(cell)
                : null;

        List<FormaRecord> RecordsOf(string dataSourceId) =>
            dataSourceId != null && data.TryGetValue(dataSourceId, out var list) ? list : new List<FormaRecord>();

        static IEnumerable<FormaRecord> Members(IEnumerable<FormaRecord> records, IEnumerable<FormaFilter> filters) =>
            records.Where(r => r.EquippedAt == null && FormaBinding.MatchesFilters(filters, r));

        FormaRecord RecordAt(Cell cell)
        {
            var records = RecordsOf(cell.DataSourceId);
            if (cell.EquipmentId != null) return records.FirstOrDefault(r => r.EquippedAt == cell.EquipmentId);
            if (cell.ViewKey == null || !placement.TryGetValue(cell.ViewKey, out var uids)) return null;
            var uid = cell.Index < uids.Count ? uids[cell.Index] : null;
            return uid == null ? null : records.FirstOrDefault(r => r.Uid == uid);
        }

        /// <summary>Brings every view's placement in line with the data: stale uids empty their slot, new members take the first empty one.</summary>
        void Reconcile()
        {
            foreach (var view in views.Values)
            {
                if (!data.ContainsKey(view.DataSourceId)) continue;
                var belonging = Members(RecordsOf(view.DataSourceId), view.Filters).Select(r => r.Uid).ToList();
                var belongs = new HashSet<string>(belonging);
                var current = placement.TryGetValue(view.Key, out var existing) ? existing : new List<string>();
                var layout = current.Select(uid => uid != null && belongs.Contains(uid) ? uid : null).ToList();
                while (layout.Count < view.Capacity) layout.Add(null);
                var placed = new HashSet<string>(layout.Where(uid => uid != null));
                foreach (var uid in belonging)
                {
                    if (placed.Contains(uid)) continue;
                    var free = layout.IndexOf(null);
                    if (free >= 0) layout[free] = uid;
                    else layout.Add(uid);
                }
                placement[view.Key] = layout;
            }
        }

        // ---- rules ----

        static FormaIntentResult No(string reason) => FormaIntentResult.Reject(reason);
        static readonly FormaIntentResult Ok = FormaIntentResult.Accept();

        static string Text(IReadOnlyDictionary<string, object> payload, string key) =>
            payload.TryGetValue(key, out var v) && v is string s ? s : string.Empty;

        static int Quantity(FormaRecord record) =>
            record.TryGet("quantity", out var v) && FormaValue.TryNumber(v, out var n) ? (int)n : 1;

        static bool AcceptsRecord(string[] accepts, FormaRecord record) =>
            accepts == null || accepts.Length == 0 ||
            accepts.Any(tag => tag == "item" || tag == record.GetString("slotType") || tag == record.GetString("category"));

        /// <summary>Whether dragging the item in <paramref name="fromId"/> onto <paramref name="toId"/> is allowed.</summary>
        public FormaIntentResult CheckDrop(string fromId, string toId)
        {
            cells.TryGetValue(fromId ?? string.Empty, out var from);
            var record = from == null ? null : RecordAt(from);
            if (from == null || record == null) return No("La casilla de origen está vacía.");
            if (from.EquipmentId != null) return No("Desequipar no está soportado en la simulación.");

            slots.TryGetValue(toId ?? string.Empty, out var target);
            if (target == null || !target.HasDragDrop || target.Role == FormaDragRole.Source)
                return No("Esa casilla no admite objetos.");
            if (!AcceptsRecord(target.Accepts, record))
            {
                var name = record.GetString("name");
                return No($"Esa casilla no acepta «{(string.IsNullOrEmpty(name) ? record.GetString("id") : name)}».");
            }

            if (target.IsEquipment)
            {
                if (!cells.ContainsKey(toId)) return No("Esa casilla no muestra objetos.");
                return record.GetString("slotType") != target.EquipmentSlotType
                    ? No($"Esa casilla solo acepta objetos de tipo «{target.EquipmentSlotType}».")
                    : Ok;
            }
            if (!cells.TryGetValue(toId, out var to) || to.ViewKey == null) return No("Esa casilla no muestra objetos.");
            if (to.ViewKey != from.ViewKey) return No("Las casillas pertenecen a listas distintas.");
            return Ok;
        }

        /// <summary>Applies the simulated effect of an intent. Unknown intents are rejected: nobody handles them.</summary>
        public FormaIntentResult Handle(FormaIntent intent)
        {
            switch (intent.Name)
            {
                case FormaIntentNames.MoveItem:
                case FormaIntentNames.EquipItem:
                    return MoveOrEquip(intent.Payload);
                case FormaIntentNames.UseItem:
                    return UseItem(intent.Payload);
                case FormaIntentNames.DropItem:
                    return DropItem(intent.Payload);
                case FormaIntentNames.SplitStack:
                    return SplitStack(intent.Payload);
                default:
                    return No($"Sin manejador: nadie atiende «{intent.Name}».");
            }
        }

        int StackLimit(string toId, FormaRecord record)
        {
            var limits = new List<int>();
            if (slots.TryGetValue(toId, out var slot) && slot.MaxStack > 0) limits.Add(slot.MaxStack);
            if (record.TryGet("maxStack", out var v) && FormaValue.TryNumber(v, out var n)) limits.Add((int)n);
            return limits.Count > 0 ? limits.Min() : 1;
        }

        void RemoveRecord(string dataSourceId, FormaRecord record)
        {
            if (data.TryGetValue(dataSourceId, out var list)) list.Remove(record);
        }

        FormaIntentResult MoveOrEquip(IReadOnlyDictionary<string, object> payload)
        {
            var fromId = Text(payload, "fromSlot");
            var toId = Text(payload, "toSlot");
            var check = CheckDrop(fromId, toId);
            if (!check.Accepted) return check;
            var from = cells[fromId];
            var to = cells[toId];
            var moving = RecordAt(from);
            var layout = placement[from.ViewKey];

            if (to.EquipmentId != null)
            {
                var previous = RecordAt(to);
                layout[from.Index] = previous?.Uid;
                if (previous != null) previous.EquippedAt = null;
                moving.EquippedAt = to.EquipmentId;
                Reconcile();
                return Ok;
            }

            var target = RecordAt(to);
            if (from.Index == to.Index) return Ok;
            if (target == null)
            {
                layout[to.Index] = moving.Uid;
                layout[from.Index] = null;
                return Ok;
            }

            var limit = StackLimit(toId, moving);
            if (Equals(target.Fields.TryGetValue("id", out var a) ? a : null, moving.Fields.TryGetValue("id", out var b) ? b : null)
                && limit > 1 && Quantity(target) < limit)
            {
                var total = Quantity(target) + Quantity(moving);
                target.Set("quantity", (double)Math.Min(limit, total));
                moving.Set("quantity", (double)(total - Quantity(target)));
                if (Quantity(moving) <= 0)
                {
                    RemoveRecord(from.DataSourceId, moving);
                    Reconcile();
                }
                return Ok;
            }
            layout[to.Index] = moving.Uid;
            layout[from.Index] = target.Uid;
            return Ok;
        }

        (Cell cell, FormaRecord record)? ItemAt(IReadOnlyDictionary<string, object> payload)
        {
            if (!cells.TryGetValue(Text(payload, "slotId"), out var cell)) return null;
            var record = RecordAt(cell);
            return record == null ? ((Cell, FormaRecord)?)null : (cell, record);
        }

        FormaIntentResult UseItem(IReadOnlyDictionary<string, object> payload)
        {
            var item = ItemAt(payload);
            if (item == null) return No("No hay ningún objeto que usar.");
            var (cell, record) = item.Value;
            if (Quantity(record) <= 1)
            {
                RemoveRecord(cell.DataSourceId, record);
                Reconcile();
            }
            else
            {
                record.Set("quantity", (double)(Quantity(record) - 1));
            }
            return Ok;
        }

        FormaIntentResult DropItem(IReadOnlyDictionary<string, object> payload)
        {
            var item = ItemAt(payload);
            if (item == null) return No("No hay ningún objeto que soltar.");
            RemoveRecord(item.Value.cell.DataSourceId, item.Value.record);
            Reconcile();
            return Ok;
        }

        FormaIntentResult SplitStack(IReadOnlyDictionary<string, object> payload)
        {
            var item = ItemAt(payload);
            if (item == null) return No("No hay ninguna pila que dividir.");
            var (cell, record) = item.Value;
            if (!payload.TryGetValue("amount", out var raw) || !FormaValue.TryNumber(raw, out var number)
                || number != Math.Floor(number) || number < 1 || number >= Quantity(record))
                return No("La cantidad a dividir no es válida.");
            var amount = (int)number;

            if (cell.ViewKey == null || !views.TryGetValue(cell.ViewKey, out var view))
                return No("Las pilas equipadas no se pueden dividir.");
            var layout = placement.TryGetValue(view.Key, out var existing) ? existing : new List<string>();
            var free = -1;
            for (var i = 0; i < view.Capacity; i++)
            {
                if (i >= layout.Count || layout[i] == null) { free = i; break; }
            }
            if (free < 0) return No("No hay casillas libres para la nueva pila.");

            var created = record.Clone("r" + nextUid++);
            created.Set("quantity", (double)amount);
            record.Set("quantity", (double)(Quantity(record) - amount));
            data[view.DataSourceId].Add(created);
            while (layout.Count <= free) layout.Add(null);
            layout[free] = created.Uid;
            placement[view.Key] = layout;
            return Ok;
        }
    }
}
