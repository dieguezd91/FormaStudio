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
