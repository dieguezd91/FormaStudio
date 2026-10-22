using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.Events;

namespace Forma.Studio
{
    [Serializable]
    public sealed class FormaIntentEvent : UnityEvent<FormaIntent, FormaIntentResult> { }

    /// <summary>
    /// Root of an exported screen. The UI expresses intents; the game decides: this component wires the
    /// Forma components to an <see cref="IFormaDataSource"/> (what to show) and an
    /// <see cref="IFormaIntentHandler"/> (what to do), and refreshes everything when the data changes.
    /// With neither assigned it looks for a <see cref="FormaSimulatedInventorySource"/> on the same GameObject.
    /// </summary>
    [AddComponentMenu("Forma/Forma Screen")]
    public sealed class FormaScreen : MonoBehaviour
    {
        [Tooltip("Components implementing IFormaDataSource. Leave empty to use one on this GameObject, or call SetDataSource at runtime.")]
        [SerializeField] List<MonoBehaviour> dataSources = new List<MonoBehaviour>();

        [Tooltip("Component implementing IFormaIntentHandler. Leave empty to use one on this GameObject, or call SetIntentHandler at runtime.")]
        [SerializeField] MonoBehaviour intentHandler;

        [Tooltip("Font for the menus, dialogs and tooltips Forma builds at runtime. Empty uses the TextMeshPro default font.")]
        public TMP_FontAsset font;

        [Tooltip("Maps icon keys to sprites. Empty draws a colored square with the item's initial.")]
        public FormaIconProvider iconProvider;

        [Tooltip("Raised for every intent with the game's answer, for logging and hooks.")]
        public FormaIntentEvent OnIntent = new FormaIntentEvent();

        readonly List<IFormaDataSource> sources = new List<IFormaDataSource>();
        IFormaIntentHandler handler;
        FormaSplitDialog defaultSplitDialog;
        Action closeSplit, closeMenu, cancelDrag;
        bool resolved;

        public bool IsDragging { get; private set; }
        public bool IsMenuOpen { get; private set; }
        public bool IsSplitOpen { get; private set; }

        /// <summary>A drag, menu or split dialog is active: tooltips stay hidden.</summary>
        public bool IsOverlayActive => IsDragging || IsMenuOpen || IsSplitOpen;

        /// <summary>Raised when drag, menu or split state flips.</summary>
        public event Action InteractionChanged;

        public IReadOnlyList<IFormaDataSource> DataSources => sources;
        public IFormaIntentHandler IntentHandler => handler;

        public Canvas RootCanvas
        {
            get
            {
                var canvas = GetComponentInParent<Canvas>(true);
                return canvas != null ? canvas.rootCanvas : null;
            }
        }

        /// <summary>The screen a component belongs to, directly or through a <see cref="FormaScreenLink"/> (runtime-built UI).</summary>
        public static FormaScreen Of(Component component)
        {
            var screen = component.GetComponentInParent<FormaScreen>(true);
            if (screen != null) return screen;
            var link = component.GetComponentInParent<FormaScreenLink>(true);
            return link != null ? link.screen : null;
        }

        void Awake() => ResolveReferences();

        void Start() => Refresh();

        void OnDestroy()
        {
            foreach (var source in sources) source.Changed -= Refresh;
            sources.Clear();
        }

        void OnValidate()
        {
            for (var i = 0; i < dataSources.Count; i++)
            {
                if (dataSources[i] == null || dataSources[i] is IFormaDataSource) continue;
                Debug.LogWarning($"[Forma] {dataSources[i].name} does not implement IFormaDataSource.", this);
                dataSources[i] = null;
            }
            if (intentHandler != null && !(intentHandler is IFormaIntentHandler))
            {
                Debug.LogWarning($"[Forma] {intentHandler.name} does not implement IFormaIntentHandler.", this);
                intentHandler = null;
            }
        }

        void ResolveReferences()
        {
            if (resolved) return;
            resolved = true;
            foreach (var behaviour in dataSources)
                if (behaviour is IFormaDataSource source) AddSource(source);
            if (intentHandler is IFormaIntentHandler configured) handler = configured;

            foreach (var sibling in GetComponents<MonoBehaviour>())
            {
                if (sources.Count == 0 && sibling is IFormaDataSource source) AddSource(source);
                if (handler == null && sibling is IFormaIntentHandler found) handler = found;
            }
        }

        void AddSource(IFormaDataSource source)
        {
            if (sources.Contains(source)) return;
            sources.Add(source);
            source.Changed += Refresh;
        }

        /// <summary>Adds (or replaces, by <see cref="IFormaDataSource.Id"/>) a data source and refreshes.</summary>
        public void SetDataSource(IFormaDataSource source)
        {
            ResolveReferences();
            if (source == null) return;
            var replaced = sources.FindIndex(s => s.Id == source.Id);
            if (replaced >= 0 && !ReferenceEquals(sources[replaced], source))
            {
                sources[replaced].Changed -= Refresh;
                sources.RemoveAt(replaced);
            }
            AddSource(source);
            Refresh();
        }

        public void SetIntentHandler(IFormaIntentHandler value)
        {
            ResolveReferences();
            handler = value;
        }

        /// <summary>The source serving a data source id: exact id, else a wildcard source, else the only one.</summary>
        public IFormaDataSource GetSource(string dataSourceId)
        {
            ResolveReferences();
            foreach (var source in sources)
                if (source.Id == dataSourceId) return source;
            foreach (var source in sources)
                if (source.Id == FormaSimulatedInventorySource.WildcardId) return source;
            return sources.Count == 1 ? sources[0] : null;
        }

        /// <summary>The first source or handler that can preview whether an intent would be accepted, if any.</summary>
        public IFormaDropValidator GetDropValidator()
        {
            ResolveReferences();
            if (handler is IFormaDropValidator fromHandler) return fromHandler;
            foreach (var source in sources)
                if (source is IFormaDropValidator validator) return validator;
            return null;
        }

        /// <summary>Re-reads every Forma component under this screen.</summary>
        public void Refresh()
        {
            ResolveReferences();
            foreach (var refreshable in GetComponentsInChildren<IFormaRefreshable>(true))
                refreshable.Refresh(this);
        }

        /// <summary>
        /// Sends an intent to the game. Reports to <see cref="OnIntent"/> either way and refreshes when accepted.
        /// With no handler the intent is rejected: nobody decides.
        /// </summary>
        public FormaIntentResult Raise(FormaIntent intent)
        {
            ResolveReferences();
            FormaIntentResult result;
            if (handler == null)
            {
                result = FormaIntentResult.Reject($"Sin manejador: nadie atiende «{intent.Name}».");
            }
            else
            {
                try
                {
                    result = handler.Handle(intent) ?? FormaIntentResult.Reject("El manejador no respondió.");
                }
                catch (Exception error)
                {
                    result = FormaIntentResult.Reject($"El manejador falló: {error.Message}");
                }
            }
            OnIntent.Invoke(intent, result);
            if (result.Accepted) Refresh();
            return result;
        }

        // ---- interaction state (drives tooltip suppression and Cancel) ----

        /// <summary>Called by <see cref="FormaDragDrop"/>. <paramref name="cancel"/> aborts the drag on <see cref="Cancel"/>.</summary>
        public void SetDragging(bool dragging, Action cancel = null)
        {
            cancelDrag = dragging ? cancel : null;
            if (IsDragging == dragging) return;
            IsDragging = dragging;
            InteractionChanged?.Invoke();
        }

        public void SetMenuOpen(bool open, Action close = null)
        {
            closeMenu = open ? close : null;
            if (IsMenuOpen == open) return;
            IsMenuOpen = open;
            InteractionChanged?.Invoke();
        }

        public void SetSplitOpen(bool open, Action close = null)
        {
            closeSplit = open ? close : null;
            if (IsSplitOpen == open) return;
            IsSplitOpen = open;
            InteractionChanged?.Invoke();
        }

        /// <summary>Cancel/Escape: closes the split dialog, else the menu, else aborts the drag.</summary>
        public void Cancel()
        {
            if (IsSplitOpen)
            {
                var close = closeSplit;
                SetSplitOpen(false);
                close?.Invoke();
            }
            else if (IsMenuOpen)
            {
                var close = closeMenu;
                SetMenuOpen(false);
                close?.Invoke();
            }
            else if (IsDragging)
            {
                var cancel = cancelDrag;
                SetDragging(false);
                cancel?.Invoke();
            }
        }

        /// <summary>The split dialog Forma builds when a <see cref="FormaSplit"/> has none assigned.</summary>
        public FormaSplitDialog GetDefaultSplitDialog()
        {
            if (defaultSplitDialog == null) defaultSplitDialog = FormaSplitDialog.CreateDefault(this);
            return defaultSplitDialog;
        }
    }
}
