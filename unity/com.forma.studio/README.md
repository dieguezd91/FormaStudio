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

## Importer (Editor)

Drop (or let Forma Studio write) `<Screen>.forma.json` into `Assets/FormaStudio/Generated/`. The Editor importer turns it into a native uGUI Prefab
next to it and updates that Prefab on every re-export without touching what you added:

- `Tools/Forma Studio/Reimport bundle` (selected `.forma.json`), `Open import report`, `Create Canvas for prefab` (selected Prefab).
- Output: `<Screen>.prefab`, `<Screen>.theme.asset`, `<Screen>.import-report.json`, `Sprites/forma_round_<r>.png` (9-slice rounded corners)
  and, on re-import, `.backup/<Screen>-<timestamp>.prefab` (last 3).
- The Prefab root is a stretched RectTransform, not a Canvas: drop it into an existing Canvas, or create one with the menu above.
- Import the TMP Essential Resources first (Window > TextMeshPro > Import TMP Essential Resources).

What a re-import may and may not change is specified in `docs/export/ugui-bundle.md` ("Unity importer"). The bundle is read with the package's own
JSON reader (`FormaMockParser.ParseJson`), so there is no dependency on Newtonsoft.

## Runtime (namespace `Forma.Studio`)

The UI expresses **intents**; the game decides. Components never own business rules: they read through
`IFormaDataSource`, raise intents through `FormaScreen.Raise` (to your `IFormaIntentHandler`) and render what the
source returns after `Changed`.

- `FormaScreen` root; assign `IFormaDataSource` / `IFormaIntentHandler` components, or call `SetDataSource` / `SetIntentHandler`.
  `OnIntent` reports every intent and the answer.
- Behaviors: `FormaTabs`, `FormaSelectable`, `FormaDragDrop`, `FormaStack`, `FormaSplit`, `FormaContextMenu`, `FormaTooltip`.
- Data views: `FormaSlot`, `FormaEquipmentSlot`, `FormaItemView`, `FormaBoundText`; `FormaId` stores the design node id.
- Styling: `FormaTheme` + `FormaThemeBinding`; `FormaBoundText` fills a text from a bound field; icons: `FormaIconProvider` (colored square + initial when a key is unmapped).
- `FormaSimulatedInventorySource` is a **simulated** stand-in for the game (same rules as Forma's Test mode, fed by the
  bundle's mock rows). Replace it with your own adapter.

Menus, the split dialog, tooltips and the drag ghost are built at runtime and use TextMeshPro: import the TMP
Essential Resources (Window > TextMeshPro) or assign `FormaScreen.font`. Keyboard/gamepad navigation relies on uGUI
`Selectable` navigation; Submit and Cancel are handled on slots, menus and the split dialog.
