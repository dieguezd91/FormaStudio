using UnityEngine;

namespace Forma.Studio
{
    /// <summary>
    /// Points runtime-built UI (menu, split dialog), which lives under the root canvas rather than under the
    /// <see cref="FormaScreen"/>, back to its screen. <see cref="FormaScreen.Of"/> follows it.
    /// </summary>
    public sealed class FormaScreenLink : MonoBehaviour
    {
        public FormaScreen screen;
    }
}
