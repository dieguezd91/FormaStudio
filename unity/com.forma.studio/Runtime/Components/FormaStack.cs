using UnityEngine;

namespace Forma.Studio
{
    /// <summary>Stack limit and count display for the slots under this node (the nearest one up the hierarchy applies).</summary>
    [AddComponentMenu("Forma/Forma Stack")]
    public sealed class FormaStack : MonoBehaviour
    {
        public int maxStack = 1;
        public bool showCount = true;
    }
}
