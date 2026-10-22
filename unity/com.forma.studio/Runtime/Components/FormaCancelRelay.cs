using UnityEngine;
using UnityEngine.EventSystems;

namespace Forma.Studio
{
    /// <summary>Forwards Cancel (Escape / gamepad B) on a runtime-built control to <see cref="FormaScreen.Cancel"/>.</summary>
    public sealed class FormaCancelRelay : MonoBehaviour, ICancelHandler
    {
        public void OnCancel(BaseEventData eventData) => FormaScreen.Of(this)?.Cancel();
    }
}
