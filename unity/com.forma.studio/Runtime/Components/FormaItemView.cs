using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Forma.Studio
{
    /// <summary>
    /// Draws one item: icon, quantity and name, each driven by its own binding. Inside an equipment slot it
    /// shows what is equipped there. An unmapped icon falls back to a colored square with the item's initial.
    /// </summary>
    [AddComponentMenu("Forma/Forma Item View")]
    public sealed class FormaItemView : MonoBehaviour, IFormaRefreshable
    {
        public Image icon;
        public TMP_Text quantityText;
        public TMP_Text nameText;
        [Tooltip("Optional. Shows the item's initial over the fallback square when there is no sprite.")]
        public TMP_Text initialText;

        public FormaBinding iconBinding = new FormaBinding();
        public FormaBinding quantityBinding = new FormaBinding();
        public FormaBinding nameBinding = new FormaBinding();

        [Tooltip("Optional. Overrides the screen's icon provider.")]
        public FormaIconProvider iconProvider;

        /// <summary>The record shown after the last refresh.</summary>
        public FormaRecord Record { get; private set; }

        public void Refresh(FormaScreen screen)
        {
            var equipment = GetComponentInParent<FormaEquipmentSlot>();
            var equipmentId = equipment != null ? equipment.SlotId : null;
            var binding = FirstSet(iconBinding, nameBinding, quantityBinding);
            var source = binding != null && screen != null ? screen.GetSource(binding.dataSourceId) : null;
            Record = binding != null ? FormaBindingResolver.ResolveRecord(source, binding, equipmentId) : null;
            Apply(Record, screen);
        }

        static FormaBinding FirstSet(params FormaBinding[] bindings)
        {
            foreach (var b in bindings)
                if (b != null && !b.IsEmpty) return b;
            return null;
        }

        void Apply(FormaRecord record, FormaScreen screen)
        {
            var provider = iconProvider != null ? iconProvider : screen != null ? screen.iconProvider : null;
            var stack = GetComponentInParent<FormaStack>();
            var showCount = stack == null || stack.showCount;

            if (icon != null) icon.enabled = record != null;
            if (initialText != null) initialText.gameObject.SetActive(false);
            if (record != null && icon != null)
            {
                var key = record.GetSpriteKey(FieldOf(iconBinding, "icon"));
                var sprite = provider != null ? provider.Get(key) : null;
                icon.sprite = sprite;
                if (sprite != null)
                {
                    icon.color = Color.white;
                }
                else
                {
                    var label = record.GetString("name") ?? record.Id;
                    icon.color = FormaIconProvider.FallbackColor(key ?? label);
                    if (initialText != null)
                    {
                        initialText.text = FormaIconProvider.Initial(label);
                        initialText.gameObject.SetActive(true);
                    }
                }
            }

            if (quantityText != null)
            {
                var quantity = record != null && showCount && record.Has(FieldOf(quantityBinding, "quantity"))
                    ? record.GetInt(FieldOf(quantityBinding, "quantity"))
                    : (int?)null;
                quantityText.gameObject.SetActive(quantity.HasValue);
                quantityText.text = quantity.HasValue ? "×" + quantity.Value : string.Empty;
            }
            if (nameText != null)
            {
                nameText.text = record?.GetString(FieldOf(nameBinding, "name")) ?? string.Empty;
            }
        }

        static string FieldOf(FormaBinding binding, string fallback) =>
            binding != null && !string.IsNullOrEmpty(binding.field) ? binding.field : fallback;
    }
}
