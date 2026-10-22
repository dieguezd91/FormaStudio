# `forma.ugui-bundle/v1`

The contract between the TypeScript exporter (`packages/exporters`, `createUguiExporter`) and the
Unity Editor importer (`unity/com.forma.studio`). The importer turns one bundle into one native
uGUI Prefab. The machine-readable contract is [`ugui-bundle.schema.json`](./ugui-bundle.schema.json),
generated from the Zod schema in `packages/exporters/src/ugui/bundle.ts`
(`npm run schema -w @forma/exporters`; a test fails when the committed file is stale).

The exporter is pure and deterministic: the same document, screen and `ExportMeta` produce the
same bytes. Everything the importer needs arrives **resolved** (tokens, colors, intent names) and
**normalized** (bindings). The importer never parses a binding path and never looks up a token.

Output files of `export()`:

| File                       | Contents                                                      |
| -------------------------- | ------------------------------------------------------------- |
| `<SafeScreenName>.forma.json` | The bundle (2-space JSON, trailing newline).               |
| `README-forma.txt`         | Short Spanish next steps and what must be connected.          |

`SafeScreenName` strips accents, replaces runs of non-alphanumerics with `_` and falls back to `Screen`.

## Top level

| Field         | Type                | Notes                                                                       |
| ------------- | ------------------- | --------------------------------------------------------------------------- |
| `format`      | `"forma.ugui-bundle/v1"` | Reject anything else.                                                  |
| `meta`        | object              | See below.                                                                  |
| `canvas`      | object              | Canvas Scaler settings.                                                     |
| `theme`       | object              | Resolved tokens, to build the `FormaTheme` ScriptableObject.                |
| `nodes`       | `BundleNode[]`      | Flat, **parents always before children**. `siblingIndex` orders siblings.   |
| `dataSources` | `BundleDataSource[]`| Only the sources the screen references.                                     |
| `intents`     | `BundleIntent[]`    | Only the intents the screen references.                                     |
| `managed`     | `{ [nodeId]: string[] }` | Property paths Forma owns, per node (see Ownership).                   |

### `meta`

`bundleVersion` (always `1`), `projectId`, `projectName`, `documentRevision` (integer, caller
supplied), `screenId`, `screenName`, `exportedAt` (ISO string, caller supplied), `exporter`
(name/version of the exporter that wrote the file).

### `canvas`

`referenceResolution {x,y}` is the screen size. `scaleMode` is always `ScaleWithScreenSize` and
`matchWidthOrHeight` is always `0.5`.

### `theme`

`colors` (`#rrggbb[aa]`), `fontSizes`, `spacing`, `radii`: the document's tokens by name. Colors
that are not valid hex are omitted. Build one `FormaTheme` asset from it; nodes refer to colors
by `token` (below) so the theme can restyle them.

## Rect conversion

Forma layout is top-left absolute inside the parent, Y down. `(x, y, w, h)` is the node's layout,
`(pw, ph)` the parent's size (the screen size for the root).

Anchored layouts (default `top-left`, also `top`, `top-right`, `left`, `center`, `right`,
`bottom-left`, `bottom`, `bottom-right`), with `(fx, fy)` the anchor's fractions from the
parent's top-left corner (`top-left` = (0,0), `center` = (0.5,0.5), `bottom-right` = (1,1)):

```
anchorMin = anchorMax = pivot = (fx, 1 - fy)
anchoredPosition      = ( x + fx*w - fx*pw ,  -(y + fy*h - fy*ph) )
sizeDelta             = ( w , h )
```

Default case: anchors `(0,1)`-`(0,1)`, pivot `(0,1)`, `anchoredPosition = (x, -y)`,
`sizeDelta = (w, h)`. `center` positions the node relative to the parent's center.

`anchor: "stretch"` anchors to the whole parent and treats `x, y, width, height` as insets at the
reference size:

```
anchorMin = (0,0)   anchorMax = (1,1)   pivot = (0.5, 0.5)
sizeDelta        = ( w - pw , h - ph )
anchoredPosition = ( x + w/2 - pw/2 , -(y + h/2 - ph/2) )
```

The bundle already contains the final `rect` of every node: apply it to the RectTransform as is.
`anchorMin`, `anchorMax`, `pivot`, `anchoredPosition` and `sizeDelta` map one to one to the
RectTransform properties of the same name.

## Nodes

Common fields: `id` (design node id, **the sync key**: store it on the GameObject, e.g. in a
`FormaId` component), `name` (GameObject name), `parentId` (`null` for the root, which is a
child of the Canvas), `siblingIndex`, `kind`, `rect`, `bindings`, `components`.

| `kind`          | Create                                                                             |
| --------------- | ---------------------------------------------------------------------------------- |
| `container`     | Empty RectTransform.                                                               |
| `panel`         | RectTransform (+ `image` when present).                                            |
| `text`          | TextMeshProUGUI.                                                                   |
| `image`         | Image.                                                                             |
| `button`        | Image + Button; the label is a child TextMeshProUGUI (sync key `<id>/label`) built from `text`. |
| `scroll`        | ScrollRect with viewport and content; children go under the content rect, whose size equals the node's. |
| `grid`          | Container driven by a GridLayoutGroup (`layoutGroup`).                             |
| `slot`          | Image (raycast target) holding an item.                                            |
| `itemView`      | Image used as the item icon, plus optional quantity/name text driven by `FormaItemView`. |
| `equipmentSlot` | Like `slot`, plus `FormaEquipmentSlot`.                                            |
| `tabBar`        | Container for the tab buttons.                                                     |
| `contextMenu`   | Panel hosting the menu entries (its button children).                              |
| `tooltip`       | Panel shown by `FormaTooltip`; its text children carry `bindings`.                 |

Optional blocks (present only when the design sets them):

- `image { color: {value, token?}, raycastTarget, assetRef?, placeholder? }`: Image color is
  `value`; `token` (`colors.surface`) is the theme entry it came from. Nodes that need pointer
  events but have no fill get a fully transparent color (`#00000000`) and `raycastTarget: true`.
  `assetRef` is a Forma asset reference for the sprite (the importer decides how to resolve it);
  `placeholder` means "no sprite yet".
- `outline { color, width }`: uGUI `Outline` effect (an approximation of a border).
- `cornerRadius`: pixels. uGUI has no native rounded corners; use a rounded 9-slice sprite.
- `canvasGroupAlpha`: add a `CanvasGroup` with this alpha (only present when `< 1`).
- `text { value, fontSize, color, alignment, fontWeight }`: `alignment` is a
  `TMPro.TextAlignmentOptions` name (`Left`, `Center`, `Right`; vertically middle). `fontWeight`
  is the CSS-style 100..900 weight; pick the closest `FontStyles` / font asset.
- `button { transition: "ColorTint" }`.
- `layoutGroup { type: Grid|Horizontal|Vertical, cellSize?, spacing, padding, constraint?, constraintCount? }`:
  `Grid` uses `cellSize`, `constraint = FixedColumnCount` and `constraintCount`. The layout group
  positions the children (their `rect.sizeDelta` is still exported; disable child force-expand
  and child control so sizes are kept). `padding` is `{left,right,top,bottom}`.
- `scroll { horizontal, vertical }`.

## Bindings

Every binding is normalized by the runtime's parser (`parseBindingPath`), so C# never parses
path strings. Path convention (from `@forma/library` `bindings.ts`): `items[category=Armas][3].icon`
becomes:

```json
{ "dataSourceId": "inventory.items", "root": "items",
  "filters": [{ "field": "category", "value": "Armas" }], "index": 3, "field": "icon" }
```

- `root`: first segment; for a collection source it is the collection itself.
- `filters`: rows whose `field` (compared as a string) equals `value`; all filters apply.
- `index`: zero-based position **inside the filtered rows**. Absent: the whole filtered list.
- `field`: field of the row (dot-joined when nested). Absent: the row itself.

`node.bindings` adds `prop` (what is bound, e.g. `icon`, `quantity`, `text`, `items`). A binding
whose path cannot be parsed is dropped from the bundle and listed in the compatibility report.

## Components (`node.components`)

Each entry is a discriminated object on `type`. Attach the matching MonoBehaviour to the node's
GameObject. `intent` fields are intent **names** (`inventory.moveItem`), never ids.

| `type`               | Fields                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `FormaTabs`          | `tabs[{id,label,buttonNodeId?,contentNodeId}]`, `initialTabId`. `buttonNodeId` is the button child of the tab bar with the tab's label; `contentNodeId` is shown only while its tab is active. |
| `FormaSelectable`    | `mode`: `single` \| `multi`.                                                                    |
| `FormaDragDrop`      | `role`: `source` \| `target` \| `both`, `accepts: string[]`, `intent`. `accepts` tags: `item`, an item's `slotType` or `category`; empty accepts everything. |
| `FormaStack`         | `maxStack`, `showCount`.                                                                        |
| `FormaSplit`         | `intent`.                                                                                       |
| `FormaContextMenu`   | `trigger`: `secondaryClick` \| `longPress` \| `button`, `actions[{id,label,intent}]`.           |
| `FormaTooltip`       | `binding`: the item row shown.                                                                  |
| `FormaSlot`          | `binding`: the row this slot shows (`dataSourceId`, `filters`, `index`; no `field`). Derived from the slot's own binding, its tooltip, or its subtree, like the runtime. |
| `FormaItemView`      | `icon?`, `quantity?`, `name?` bindings. `name` is the `name` field of the icon's row.           |
| `FormaEquipmentSlot` | `slotType`.                                                                                     |

Order: behavior components in the node's behavior order, then `FormaSlot` / `FormaItemView` /
`FormaEquipmentSlot`.

## Data sources and intents

`dataSources[]`: `id`, `name`, `kind` (`collection` \| `object`), `fields[{name,type}]`
(`string|number|boolean|image|id`), `connection` (`simulated|unconnected|connected`) and `mock`.
**`mock` is preview-only** sample data for design time: use it for the editor preview and the
built-in simulation, never as game data.

`intents[]`: `name`, `description`, `payload[{name,type}]`, `connection`.

### Intent payloads the Unity runtime must emit

The UI expresses an intent; the game decides. These are the payload keys the Test-mode runtime
emits (`packages/runtime/src/events.ts`) and the C# side must mirror:

| Trigger                                   | Intent (from the behavior)            | Payload keys                                        |
| ----------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| Drop on a `FormaDragDrop` target          | `FormaDragDrop.intent`                | `itemId`, `fromSlot`, `toSlot`, plus `slotType` when the target is an `equipmentSlot` |
| Context-menu action                       | `actions[i].intent`                   | `actionId`, `slotId`, plus `itemId` when the slot holds an item |
| Confirmed split (from the split dialog, or the menu action that matches `FormaSplit.intent`) | `FormaSplit.intent` | `itemId`, `amount`, `slotId` |

`fromSlot`, `toSlot` and `slotId` are **design node ids** (the sync keys). `itemId` is the `id`
field of the item record. The built-in simulation (`packages/runtime/src/simulation.ts`) answers
`inventory.moveItem`, `inventory.equipItem`, `inventory.useItem`, `inventory.dropItem` and
`inventory.splitStack` when no handler is registered; the C# stub must keep the same payload keys
and rules (move/stack-merge/swap, equip by `slotType`, use decrements or removes, drop removes,
split needs `1 <= amount < quantity` and a free slot).

## Ownership and re-export

`managed[nodeId]` lists the property paths Forma owns on that node. The importer may overwrite
those and must leave **everything else** (extra components, serialized fields, children added in
Unity, sprites assigned by hand) untouched. Paths are dot paths into the node object, with
`components.<Type>` addressing a component by its `type`:

`name`, `parentId`, `siblingIndex`, `kind`, `rect`, `image.color`, `image.raycastTarget`,
`image.assetRef`, `image.placeholder`, `outline`, `cornerRadius`, `canvasGroupAlpha`,
`text.value`, `text.fontSize`, `text.color`, `text.alignment`, `text.fontWeight`, `button`,
`layoutGroup`, `scroll`, `bindings`, `components.FormaTabs`, `components.FormaSlot`, …

Only paths that exist on the node are listed. When a path disappears between two bundles (for
example a stroke was removed), the importer removes what it created for it; the diff reports it.

Match nodes between exports by `id`. `diffBundles(previous, next)` returns
`{ added, removed, changed: [{nodeId, name, paths}], renamed: [{nodeId, from, to}] }`, comparing
only managed paths (`name` changes appear in `renamed`, not in `changed`). Bundle metadata
(`exportedAt`, `documentRevision`) is never part of the diff.

## Compatibility report

`analyze(doc, screenId)` (and `export().report`) returns, before exporting anything:

```
{ items: [{ subject: { nodeId?, behavior?, property?, dataSourceId?, intentName? },
            status: supported | adapted | approximate | unavailable,
            impact, action, nodeIds? }],
  summary: { counts, youWillReceive: string[], youMustConnect: string[] } }
```

`impact` and `action` are Spanish. Identical findings on several nodes are merged into one item:
`subject.nodeId` is the first node and `nodeIds` lists all of them. Rules: library entry hints for
`unity-ugui` (once per inserted entry), `cornerRadius` approximate (9-slice sprite), strokes
approximate (`Outline`), opacity supported (`CanvasGroup`), `longPress` context menus adapted
(right click with a mouse), tooltips adapted (hover only), simulated or unconnected data sources
need `IFormaDataSource`, unconnected intents need an `IFormaIntentHandler`.

## What the Unity side must implement

Components: `FormaId` (stores the sync key), `FormaTheme` (ScriptableObject), `FormaTabs`,
`FormaSelectable`, `FormaDragDrop`, `FormaStack`, `FormaSplit`, `FormaContextMenu`,
`FormaTooltip`, `FormaSlot`, `FormaItemView`, `FormaEquipmentSlot`.

Interfaces: `IFormaDataSource` (a data source by `id`: rows, fields, change notification),
`IFormaIntentHandler` (receives an intent `name` and its payload, answers accept/reject, may
return refreshed data), plus the importer (bundle JSON to Prefab, update by `id`, honoring
`managed`).
