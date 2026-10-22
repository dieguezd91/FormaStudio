using UnityEngine;

namespace Forma.Studio
{
    /// <summary>Marks a slot as an equipment slot: it shows what is equipped at it and tags equip drops with its <see cref="slotType"/>.</summary>
    [AddComponentMenu("Forma/Forma Equipment Slot")]
    public sealed class FormaEquipmentSlot : MonoBehaviour
    {
        public string slotType;

        /// <summary>The key a data source uses for <see cref="IFormaDataSource.GetEquipped"/>.</summary>
        public string SlotId => FormaId.NodeIdOf(this);
    }
}
