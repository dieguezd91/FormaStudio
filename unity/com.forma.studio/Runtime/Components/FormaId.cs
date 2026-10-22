using UnityEngine;

namespace Forma.Studio
{
    /// <summary>Stores the design node id, the sync key between Forma and the Prefab (also used in intent payloads).</summary>
    [DisallowMultipleComponent]
    [AddComponentMenu("Forma/Forma Id")]
    public sealed class FormaId : MonoBehaviour
    {
        public string nodeId;

        /// <summary>The node id of the GameObject carrying <paramref name="component"/>; its name when it has no <see cref="FormaId"/>.</summary>
        public static string NodeIdOf(Component component)
        {
            var id = component.GetComponent<FormaId>();
            return id != null && !string.IsNullOrEmpty(id.nodeId) ? id.nodeId : component.gameObject.name;
        }
    }
}
