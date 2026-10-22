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

## Runtime (namespace `Forma.Studio`)

The UI expresses **intents**; the game decides. Components never own business rules: they read through
`IFormaDataSource`, raise intents through `FormaScreen.Raise` (to your `IFormaIntentHandler`) and render what the
source returns after `Changed`.

- `FormaScreen` root; assign `IFormaDataSource` / `IFormaIntentHandler` components, or call `SetDataSource` / `SetIntentHandler`.
  `OnIntent` reports every intent and the answer.
- Behaviors: `FormaTabs`, `FormaSelectable`, `FormaDragDrop`, `FormaStack`, `FormaSplit`, `FormaContextMenu`, `FormaTooltip`.
- Data views: `FormaSlot`, `FormaEquipmentSlot`, `FormaItemView`, `FormaBoundText`; `FormaId` stores the design node id.
- Styling: `FormaTheme` + `FormaThemeBinding`; icons: `FormaIconProvider` (colored square + initial when a key is unmapped).
- `FormaSimulatedInventorySource` is a **simulated** stand-in for the game (same rules as Forma's Test mode, fed by the
  bundle's mock rows). Replace it with your own adapter.

Menus, the split dialog, tooltips and the drag ghost are built at runtime and use TextMeshPro: import the TMP
Essential Resources (Window > TextMeshPro) or assign `FormaScreen.font`. Keyboard/gamepad navigation relies on uGUI
`Selectable` navigation; Submit and Cancel are handled on slots, menus and the split dialog.
