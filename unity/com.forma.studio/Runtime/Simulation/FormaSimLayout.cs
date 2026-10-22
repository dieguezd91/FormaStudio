using System;
using System.Collections.Generic;
using UnityEngine;

namespace Forma.Studio
{
    /// <summary>Reads the slots of a hierarchy (FormaSlot, FormaDragDrop, FormaStack, FormaEquipmentSlot) into the plain model the simulation uses.</summary>
    public static class FormaSimLayout
    {
        /// <summary>One entry per node carrying a <see cref="FormaSlot"/> or <see cref="FormaDragDrop"/>, in hierarchy order.</summary>
        public static IReadOnlyList<FormaSimSlot> Build(Transform root)
        {
            var result = new List<FormaSimSlot>();
            foreach (var node in root.GetComponentsInChildren<Transform>(true))
            {
                var slot = node.GetComponent<FormaSlot>();
                var dragDrop = node.GetComponent<FormaDragDrop>();
                if (slot == null && dragDrop == null) continue;

                var equipment = node.GetComponent<FormaEquipmentSlot>();
                var stack = node.GetComponentInParent<FormaStack>();
                var entry = new FormaSimSlot
                {
                    NodeId = FormaId.NodeIdOf(node),
                    IsEquipment = equipment != null,
                    EquipmentSlotType = equipment != null ? equipment.slotType : null,
                    HasDragDrop = dragDrop != null,
                    Role = dragDrop != null ? dragDrop.role : FormaDragRole.Both,
                    Accepts = dragDrop != null && dragDrop.accepts != null ? dragDrop.accepts : Array.Empty<string>(),
                    MaxStack = stack != null ? stack.maxStack : 0,
                };
                if (slot != null && !slot.binding.IsEmpty)
                {
                    entry.DataSourceId = slot.binding.dataSourceId;
                    entry.Root = string.IsNullOrEmpty(slot.binding.root) ? "items" : slot.binding.root;
                    entry.Filters = slot.binding.filters ?? Array.Empty<FormaFilter>();
                    entry.Index = slot.binding.index;
                }
                result.Add(entry);
            }
            return result;
        }
    }
}
