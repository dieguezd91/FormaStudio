using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.EventSystems;

namespace Forma.Studio
{
    /// <summary>
    /// Selection among siblings: the scope is the parent transform. In <see cref="SelectionMode.Single"/> one
    /// sibling is selected at a time; in <see cref="SelectionMode.Multi"/> a click toggles the clicked one.
    /// </summary>
    [AddComponentMenu("Forma/Forma Selectable")]
    public sealed class FormaSelectable : MonoBehaviour, IPointerClickHandler, ISubmitHandler
    {
        public enum SelectionMode
        {
            Single,
            Multi,
        }

        [System.Serializable]
        public sealed class SelectionEvent : UnityEvent<bool> { }

        public SelectionMode mode = SelectionMode.Single;

        [Tooltip("Optional object shown while selected (e.g. a highlight frame).")]
        public GameObject selectedMarker;

        public SelectionEvent OnSelectionChanged = new SelectionEvent();

        public bool IsSelected { get; private set; }

        /// <summary>Selects this node. <paramref name="additive"/> only matters in Multi mode, where it toggles instead of replacing.</summary>
        public void Select(bool additive)
        {
            if (mode == SelectionMode.Multi && additive)
            {
                SetSelected(!IsSelected);
                return;
            }
            foreach (var sibling in Siblings())
                if (sibling != this) sibling.SetSelected(false);
            SetSelected(true);
        }

        void SetSelected(bool selected)
        {
            if (IsSelected == selected) return;
            IsSelected = selected;
            if (selectedMarker != null) selectedMarker.SetActive(selected);
            OnSelectionChanged.Invoke(selected);
        }

        FormaSelectable[] Siblings()
        {
            var parent = transform.parent;
            if (parent == null) return new[] { this };
            var all = parent.GetComponentsInChildren<FormaSelectable>(true);
            var siblings = new List<FormaSelectable>();
            foreach (var candidate in all)
                if (candidate.transform.parent == parent) siblings.Add(candidate);
            return siblings.ToArray();
        }

        // A mouse has no modifier keys in the event data and the Input System/legacy split makes polling
        // them fragile, so in Multi mode a plain click toggles.
        public void OnPointerClick(PointerEventData eventData)
        {
            if (eventData.button == PointerEventData.InputButton.Left) Select(mode == SelectionMode.Multi);
        }

        public void OnSubmit(BaseEventData eventData) => Select(mode == SelectionMode.Multi);
    }
}
