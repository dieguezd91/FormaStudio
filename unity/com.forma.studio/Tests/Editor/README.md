# Editor tests

EditMode tests for the package (`Forma.Studio.Editor.Tests`). Run them with the command in
`unity/FormaSandbox/README.md`.

## Importer fixtures

`Fixtures/*.forma.json` are real `forma.ugui-bundle/v1` files written by the TypeScript exporter, not
hand-written JSON:

| File                       | Library entry                | Nodes |
| -------------------------- | ---------------------------- | ----- |
| `tabs.forma.json`          | `inventory.tabs`             | 176   |
| `grid-equipment.forma.json`| `inventory.grid+equipment`   | 56    |

They were generated from the repo root with a throw-away script kept **outside** the repo (the test helpers
of `packages/exporters` build the document):

```ts
// gen.ts — run with: npx tsx <abs path>/gen.ts <abs path>/unity/com.forma.studio/Tests/Editor/Fixtures
import { writeFileSync } from 'node:fs';
import { createUguiExporter } from '<repo>/packages/exporters/src/ugui/exporter.ts';
import { META, SCREEN_ID, makeBaseDoc, withEntry } from '<repo>/packages/exporters/src/ugui/test-helpers.ts';

const exporter = createUguiExporter({ exporter: 'forma-fixture/0' });
for (const [file, ids] of [['tabs', ['inventory.tabs']], ['grid-equipment', ['inventory.grid+equipment']]]) {
  let doc = makeBaseDoc();                                  // empty document, screen "Inventario"
  for (const id of ids) doc = withEntry(doc, id);           // insert the library entry under the screen root
  const result = exporter.export(doc, SCREEN_ID, META);     // META is fixed, so the output is deterministic
  writeFileSync(`${process.argv[2]}/${file}.forma.json`, result.value.files[0].contents);
}
```

Regenerate them when the bundle contract changes (`docs/export/ugui-bundle.md`).

The importer tests (`FormaImporterTests`) never touch the fixtures in place: they parse them into a generic tree
(`FormaMockParser.ParseJson`), edit the tree in memory the way a re-export changes a bundle, write the result to
`Assets/FormaImporterTests/` of the sandbox project and import it from there. That folder is deleted after each test.
