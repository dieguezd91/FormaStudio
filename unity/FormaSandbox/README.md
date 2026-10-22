# FormaSandbox

Minimal Unity 6000.0 project that references `../com.forma.studio` so the package compiles and its
EditMode tests run. It contains no assets of its own. `Library/`, `Temp/`, `Logs/` and `UserSettings/`
are git-ignored.

Run the tests headless (no `-quit` with `-runTests`):

```powershell
& "C:\Program Files\Unity\Hub\Editor\6000.0.73f1\Editor\Unity.exe" -batchmode -nographics `
  -projectPath <repo>\unity\FormaSandbox -runTests -testPlatform EditMode `
  -testResults <tmp>\results.xml -logFile <tmp>\unity.log
```

The importer tests write temporary bundles, Prefabs and sprites under `Assets/FormaImporterTests/` and delete that folder after
each test; nothing else is added to the project.

## Scenario 13.1 end-to-end (`Assets/E2ETests`)

`Assets/E2ETests` (assembly `Forma.E2E.Tests`, category `E2E13_1`) runs the Forma-export-to-existing-game scenario against the
sample in `../com.forma.studio/Samples~/ExistingInventory`. `Samples~` is not compiled in place, so copy it into the sandbox first
(`Assets/Samples/` is git-ignored):

```bash
mkdir -p unity/FormaSandbox/Assets/Samples && cp -r unity/com.forma.studio/Samples~/ExistingInventory unity/FormaSandbox/Assets/Samples/
```

Run the two fixtures as separate Unity runs (add `-testCategory E2E13_1 -testFilter <fixture>` to the command above):

1. `Forma13_1_FirstImport`: imports the bundle, checks the game's items and decisions through the adapter, saves a developer
   customization (adapter, wiring, `DevBadge`, a serialized field) into the Prefab.
2. `Forma13_1_Reimport`: re-imports a changed bundle and checks that the customization, the report and the game wiring survive.

Inputs (optional; without them the bundles are derived from the package fixtures, so the fixtures run standalone):

- `FORMA_E2E_BUNDLE`: path to the V1 `*.forma.json` export. It needs the four tabs `Armas`/`Armaduras`/`Consumibles`/`Materiales`
  (`category` filter, 20 slots each, item views inside) and equipment slots of type `weapon` and `head`.
- `FORMA_E2E_BUNDLE_V2`: path to the re-export, with the **same file name** as V1.

Both are copied to `Assets/FormaStudio/Generated/E2E/` (git-ignored with the rest of `Assets/FormaStudio/`), which is also where
FirstImport leaves what Reimport reads. FirstImport deletes that folder first; Reimport never does.
