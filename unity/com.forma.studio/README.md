# Forma Studio (Unity package)

Runtime support and editor tooling for UI exported from Forma Studio. Targets Unity 6000.x.

## Layout

- `Runtime/` — `Forma.Studio.Runtime` (behaviors, binding interfaces).
- `Editor/` — `Forma.Studio.Editor` (importer / Prefab generation; Editor-only).
- `Tests/Editor/` — `Forma.Studio.Editor.Tests` (Unity Test Framework, EditMode).

## Install

Add as a local package in `Packages/manifest.json`:

```json
"com.forma.studio": "file:<path-to-repo>/unity/com.forma.studio"
```

To run the tests, list `com.forma.studio` under `testables` in the same manifest.
