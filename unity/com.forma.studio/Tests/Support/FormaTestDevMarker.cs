using UnityEngine;

namespace Forma.Studio.Tests
{
    /// <summary>
    /// Stands in for a script a developer attaches to an imported node (the importer must never remove it).
    /// Lives outside the Editor folder because Unity refuses to attach editor scripts to GameObjects.
    /// </summary>
    public sealed class FormaTestDevMarker : MonoBehaviour
    {
        public string note;
    }
}
