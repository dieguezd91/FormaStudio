using System;
using System.Collections.Generic;
using UnityEngine;

namespace Forma.Studio
{
    /// <summary>
    /// SIMULATED game for an exported inventory screen: it answers moveItem, equipItem, useItem, dropItem and
    /// splitStack with the same simple rules as the Forma Test mode, using the bundle's mock rows. It exists so the
    /// Prefab works in Play mode out of the box. It is NOT your game: replace it with your own
    /// <see cref="IFormaDataSource"/> + <see cref="IFormaIntentHandler"/> adapter.
    /// </summary>
    [AddComponentMenu("Forma/Forma Simulated Inventory Source (SIMULATED)")]
    public sealed class FormaSimulatedInventorySource : MonoBehaviour, IFormaDataSource, IFormaIntentHandler, IFormaDropValidator
    {
        /// <summary>Serves every data source id of the screen.</summary>
        public const string WildcardId = "*";

        [Serializable]
        public sealed class MockSet
        {
            public string dataSourceId;
            [Tooltip("JSON array of rows.")]
            public TextAsset asset;
            [TextArea(2, 8)] public string json;
        }

        [Header("SIMULATED - sample data and rules, not your game")]
        [Tooltip("A .forma.json bundle: the mock rows of every data source are loaded from it.")]
        [SerializeField] TextAsset bundle;

        [Tooltip("Extra or overriding mock rows per data source id.")]
        [SerializeField] List<MockSet> mocks = new List<MockSet>();

        [Tooltip("Where to look for slots. Empty uses this GameObject.")]
        [SerializeField] Transform layoutRoot;

        [SerializeField] bool logIntents = true;

        readonly Dictionary<string, List<FormaRecord>> loaded = new Dictionary<string, List<FormaRecord>>();
        FormaInventorySimulation simulation;

        public string Id => WildcardId;

        /// <summary>Always says it is simulated, for inspectors and logs.</summary>
        public string Label => "Fuente simulada (Forma): datos y reglas de muestra, no son del juego";

        public event Action Changed;

        void Awake() => Initialize();

        /// <summary>(Re)builds the simulation from the bundle, the mock sets and the slots currently under the layout root.</summary>
        public void Initialize()
        {
            var data = new Dictionary<string, List<FormaRecord>>();
            if (bundle != null)
                foreach (var pair in FormaMockParser.ParseBundle(bundle.text)) data[pair.Key] = pair.Value;
            foreach (var set in mocks)
            {
                var json = set.asset != null ? set.asset.text : set.json;
                if (!string.IsNullOrEmpty(set.dataSourceId) && !string.IsNullOrWhiteSpace(json))
                    data[set.dataSourceId] = FormaMockParser.ParseRecords(json);
            }
            foreach (var pair in loaded) data[pair.Key] = pair.Value;

            var root = layoutRoot != null ? layoutRoot : transform;
            simulation = new FormaInventorySimulation(FormaSimLayout.Build(root), data);
        }

        /// <summary>Sets the mock rows of a data source from a JSON array at runtime (rebuilds the simulation if it already exists).</summary>
        public void LoadMockJson(string dataSourceId, string json)
        {
            loaded[dataSourceId] = FormaMockParser.ParseRecords(json);
            if (simulation != null) Initialize();
        }

        /// <summary>Scans the slots again (after adding or removing slots at runtime), keeping nothing of the current state.</summary>
        public void Rebuild()
        {
            Initialize();
            Changed?.Invoke();
        }

        [ContextMenu("Reset simulation")]
        public void ResetSimulation()
        {
            Ensure().Reset();
            Log("reiniciada");
            Changed?.Invoke();
        }

        FormaInventorySimulation Ensure()
        {
            if (simulation == null) Initialize();
            return simulation;
        }

        public IReadOnlyList<FormaRecord> GetView(FormaBinding view) => Ensure().GetView(view);

        public FormaRecord GetEquipped(string equipmentSlotId) => Ensure().GetEquipped(equipmentSlotId);

        public FormaIntentResult Handle(FormaIntent intent)
        {
            var result = Ensure().Handle(intent);
            Log($"{intent.Name} -> {(result.Accepted ? "aplicado" : "rechazado: " + result.Reason)}");
            if (result.Accepted) Changed?.Invoke();
            return result;
        }

        public FormaIntentResult Validate(FormaIntent intent)
        {
            if (intent.Name != FormaIntentNames.MoveItem && intent.Name != FormaIntentNames.EquipItem)
                return FormaIntentResult.Accept();
            return Ensure().CheckDrop(
                intent.Payload.TryGetValue("fromSlot", out var from) ? from as string : null,
                intent.Payload.TryGetValue("toSlot", out var to) ? to as string : null);
        }

        void Log(string message)
        {
            if (logIntents) Debug.Log($"[Forma/simulada] {message}", this);
        }
    }
}
