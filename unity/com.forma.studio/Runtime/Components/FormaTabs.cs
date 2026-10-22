using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace Forma.Studio
{
    /// <summary>Tab bar behavior: shows the content of the active tab only and gives the tab buttons a toggle-like state.</summary>
    [AddComponentMenu("Forma/Forma Tabs")]
    public sealed class FormaTabs : MonoBehaviour
    {
        [Serializable]
        public sealed class Entry
        {
            public string id;
            public string label;
            public Button button;
            [Tooltip("Shown only while this tab is active.")]
            public GameObject content;
            [Tooltip("Optional object shown only while this tab is active (e.g. an underline).")]
            public GameObject activeIndicator;
        }

        [Serializable]
        public sealed class TabEvent : UnityEvent<string> { }

        public List<Entry> tabs = new List<Entry>();
        public string initialTabId;

        [Tooltip("Tint multiplied into the buttons of inactive tabs (the active one uses white).")]
        public Color inactiveTint = new Color(0.78f, 0.78f, 0.78f, 1f);

        public TabEvent OnTabChanged = new TabEvent();

        readonly Dictionary<Button, UnityAction> listeners = new Dictionary<Button, UnityAction>();

        public string ActiveTabId { get; private set; }

        void Awake() => Initialize();

        /// <summary>Wires the tab buttons and shows the initial tab (the first one when the id is unknown). Safe to call again.</summary>
        public void Initialize()
        {
            foreach (var entry in tabs)
            {
                if (entry.button == null) continue;
                var id = entry.id;
                if (listeners.TryGetValue(entry.button, out var old)) entry.button.onClick.RemoveListener(old);
                UnityAction action = () => Select(id);
                listeners[entry.button] = action;
                entry.button.onClick.AddListener(action);
            }
            if (tabs.Count == 0) return;
            Apply(FindEntry(initialTabId) ?? tabs[0], notify: false);
        }

        /// <summary>Activates a tab; false when the id is unknown.</summary>
        public bool Select(string tabId)
        {
            var entry = FindEntry(tabId);
            if (entry == null) return false;
            Apply(entry, notify: ActiveTabId != entry.id);
            return true;
        }

        Entry FindEntry(string tabId) =>
            string.IsNullOrEmpty(tabId) ? null : tabs.Find(t => t.id == tabId);

        void Apply(Entry active, bool notify)
        {
            ActiveTabId = active.id;
            foreach (var entry in tabs)
            {
                var isActive = entry == active;
                if (entry.content != null) entry.content.SetActive(isActive);
                if (entry.activeIndicator != null) entry.activeIndicator.SetActive(isActive);
                if (entry.button != null)
                {
                    var colors = entry.button.colors;
                    colors.normalColor = isActive ? Color.white : inactiveTint;
                    entry.button.colors = colors;
                }
            }
            if (notify) OnTabChanged.Invoke(active.id);
        }
    }
}
