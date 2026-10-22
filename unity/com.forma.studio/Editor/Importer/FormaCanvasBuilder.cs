using System;
using UnityEditor;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Forma.Studio.Editor
{
    /// <summary>
    /// The imported Prefab is a plain RectTransform, not a Canvas, so it can be dropped into an existing Canvas. For a project
    /// without one, this creates a Canvas (Screen Space - Overlay, Scale With Screen Size) with an EventSystem and puts the Prefab in it.
    /// </summary>
    public static class FormaCanvasBuilder
    {
        public static readonly Vector2 DefaultReferenceResolution = new Vector2(1920f, 1080f);

        public static Canvas CreateCanvas(Vector2 referenceResolution)
        {
            var go = new GameObject("Canvas", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = go.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = referenceResolution;
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 0.5f;
            EnsureEventSystem();
            return canvas;
        }

        public static GameObject InstantiateInCanvas(GameObject prefab, Canvas canvas)
        {
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab, canvas.transform);
            // the prefab root is stretched; make sure the instance is not left with the scale/offset of a manual drop
            instance.transform.localScale = Vector3.one;
            return instance;
        }

        /// <summary>Creates an EventSystem with the right input module when the scene has none.</summary>
        public static EventSystem EnsureEventSystem()
        {
            var existing = UnityEngine.Object.FindFirstObjectByType<EventSystem>();
            if (existing != null) return existing;
            var go = new GameObject("EventSystem", typeof(EventSystem));
            AddInputModule(go);
            return go.GetComponent<EventSystem>();
        }

        static void AddInputModule(GameObject go)
        {
#if ENABLE_INPUT_SYSTEM
            // The Input System package is optional, so it is reached by name instead of referenced.
            var inputSystemModule = Type.GetType("UnityEngine.InputSystem.UI.InputSystemUIInputModule, Unity.InputSystem");
            if (inputSystemModule != null)
            {
                go.AddComponent(inputSystemModule);
                return;
            }
#endif
            go.AddComponent<StandaloneInputModule>();
        }

        /// <summary>The reference resolution of the bundle that produced <paramref name="prefabPath"/> (next to it), else 1920x1080.</summary>
        public static Vector2 ReferenceResolutionFor(string prefabPath)
        {
            var bundlePath = System.IO.Path.ChangeExtension(prefabPath, null) + FormaBundlePostprocessor.BundleExtension;
            if (!System.IO.File.Exists(bundlePath)) return DefaultReferenceResolution;
            try
            {
                return FormaBundleReader.Read(System.IO.File.ReadAllText(bundlePath)).referenceResolution;
            }
            catch (FormaBundleException)
            {
                return DefaultReferenceResolution;
            }
        }

        /// <summary>Menu action: a Canvas holding an instance of <paramref name="prefab"/>, in the open scene.</summary>
        public static GameObject CreateCanvasForPrefab(GameObject prefab)
        {
            var canvas = CreateCanvas(ReferenceResolutionFor(AssetDatabase.GetAssetPath(prefab)));
            Undo.RegisterCreatedObjectUndo(canvas.gameObject, "Create Canvas for Forma prefab");
            var instance = InstantiateInCanvas(prefab, canvas);
            Undo.RegisterCreatedObjectUndo(instance, "Create Canvas for Forma prefab");
            Selection.activeGameObject = instance;
            return instance;
        }
    }
}
