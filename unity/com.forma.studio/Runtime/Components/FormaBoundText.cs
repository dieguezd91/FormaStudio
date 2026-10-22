using TMPro;
using UnityEngine;

namespace Forma.Studio
{
    /// <summary>
    /// Writes one bound field into a text (any text node with a binding, e.g. the labels of an exported tooltip panel).
    /// <see cref="format"/> uses <c>string.Format</c> with the field value as {0}.
    /// </summary>
    [AddComponentMenu("Forma/Forma Bound Text")]
    public sealed class FormaBoundText : MonoBehaviour, IFormaRefreshable
    {
        public TMP_Text target;
        public FormaBinding binding = new FormaBinding();
        public string format = "{0}";

        public void Refresh(FormaScreen screen)
        {
            var text = target != null ? target : GetComponent<TMP_Text>();
            if (text == null || binding.IsEmpty) return;
            var equipment = GetComponentInParent<FormaEquipmentSlot>();
            var value = FormaBindingResolver.ResolveField(
                screen.GetSource(binding.dataSourceId), binding, equipment != null ? equipment.SlotId : null);
            text.text = value == null ? string.Empty : string.Format(format, FormaValue.Stringify(value));
        }
    }
}
