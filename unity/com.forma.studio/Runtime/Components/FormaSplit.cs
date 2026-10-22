using UnityEngine;

namespace Forma.Studio
{
    /// <summary>
    /// Stack splitting for the slots under this node. <see cref="intent"/> is the intent raised once the player
    /// confirms an amount; <see cref="FormaContextMenu"/> opens the dialog instead of raising it when the
    /// chosen action carries this intent.
    /// </summary>
    [AddComponentMenu("Forma/Forma Split")]
    public sealed class FormaSplit : MonoBehaviour
    {
        public string intent = FormaIntentNames.SplitStack;

        [Tooltip("Optional dialog. Empty builds a simple one (slider, Confirm, Cancel) at runtime.")]
        public FormaSplitDialog dialog;

        /// <summary>Opens the dialog for the stack in <paramref name="slot"/>; false when there is nothing to split (fewer than 2 units).</summary>
        public bool Open(FormaSlot slot)
        {
            var screen = FormaScreen.Of(this);
            var record = slot != null ? slot.Record : null;
            if (screen == null || record == null) return false;
            var quantity = record.GetInt("quantity", 1);
            if (quantity < 2) return false;

            var itemId = record.Id;
            var slotId = slot.NodeId;
            var target = dialog != null ? dialog : screen.GetDefaultSplitDialog();
            target.Show(quantity - 1, amount => screen.Raise(FormaIntent.Create(
                intent, ("itemId", itemId), ("amount", amount), ("slotId", slotId))));
            return true;
        }
    }
}
