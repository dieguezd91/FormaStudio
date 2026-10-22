# Existing inventory

A toy game that already has an item system and no knowledge of Forma, connected to a Forma-exported inventory screen.

- `Game/` (`ExistingGame.Inventory`, no Unity references): `GameItemDatabase` and `PlayerInventory`, with the game's own rules:
  quest items cannot be dropped, the max stack comes from the item definition, an item only fits the equipment slot of its type, and
  `Changed` fires after every successful change.
- `Adapter/` (`ExistingGame.FormaAdapter`): `PlayerInventoryFormaAdapter`, the only code the developer writes.

## What the adapter does

It implements `IFormaDataSource` and `IFormaIntentHandler` and nothing else:

- **Views**: a bag slot's filters (`category=Armas|Armaduras|Consumibles|Materiales`) pick the game's bag, its binding index picks the slot;
  equipment slots read `PlayerInventory.GetEquipped` by their `slotType`. Quest items are shown under "Materiales".
- **Intents**: `inventory.moveItem` / `equipItem` (`fromSlot`, `toSlot`), `useItem` / `dropItem` (`slotId`) and `splitStack`
  (`slotId`, `amount`) become `PlayerInventory.Move/Equip/Use/Drop/Split`. Slot ids are design node ids; the adapter finds the
  matching `FormaSlot` / `FormaEquipmentSlot` on the screen.
- **Rejections**: the game's reason is returned as `FormaIntentResult.Reject(reason)`; the UI never decides anything.
- **Refresh**: `Changed` is raised whenever `PlayerInventory.Changed` fires.

## Connect it

1. Import the sample (Package Manager > Forma Studio > Samples).
2. On the imported screen Prefab, add `PlayerInventoryFormaAdapter` to the same GameObject as `FormaScreen` and assign it to the
   screen's `Data Sources` and `Intent Handler` fields. Those are developer-owned: re-exporting the design from Forma never
   removes the component nor the assignments.
3. At run time give it the game's inventory: `adapter.Bind(playerInventory);`
