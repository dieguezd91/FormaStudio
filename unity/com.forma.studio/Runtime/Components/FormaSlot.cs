using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Forma.Studio
{
    /// <summary>
    /// A slot showing one row of a view (<see cref="binding"/>: data source, filters, index), or what is
    /// equipped there when the node also has a <see cref="FormaEquipmentSlot"/>. It is a uGUI Selectable so
    /// keyboard and gamepad navigation reach it.
    /// </summary>
    [AddComponentMenu("Forma/Forma Slot")]
    [RequireComponent(typeof(Selectable))]
    public sealed class FormaSlot : MonoBehaviour, IFormaRefreshable, ICancelHandler
    {
        public FormaBinding binding = new FormaBinding();

        /// <summary>The record shown after the last refresh; null for an empty slot.</summary>
        public FormaRecord Record { get; private set; }

        public string NodeId => FormaId.NodeIdOf(this);

        public bool IsEquipment => GetComponent<FormaEquipmentSlot>() != null;

        public event Action<FormaRecord> RecordChanged;

        public void Refresh(FormaScreen screen)
        {
            var source = screen != null ? screen.GetSource(binding.dataSourceId) : null;
            var record = IsEquipment
                ? source?.GetEquipped(NodeId)
                : FormaBindingResolver.ResolveRecord(source, binding);
            if (ReferenceEquals(record, Record)) return;
            Record = record;
            RecordChanged?.Invoke(record);
        }

        public void OnCancel(BaseEventData eventData) => FormaScreen.Of(this)?.Cancel();
    }
}
