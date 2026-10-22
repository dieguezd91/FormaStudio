import { expect, test } from '@playwright/test';

test('plays the tabbed inventory: tabs, drag and drop, context menu and Escape', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /Empezar desde cero/ }).click();
  await page.getByLabel('Nombre del proyecto').fill('E2E Probar');
  await page.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();

  await page.getByRole('tab', { name: 'Biblioteca' }).click();
  await page.getByLabel('Buscar en la biblioteca').fill('inventario con pestañas');
  await page.getByTestId('library-entry').first().getByRole('button', { name: /Insertar/ }).click();
  await expect(page.getByTestId('canvas-stage').locator('[data-node-type="slot"]').first()).toBeVisible();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');

  // Probar: the honesty banner is always there and the placeholder is gone.
  await page.getByRole('tab', { name: 'Probar' }).click();
  await expect(page.getByTestId('play-mode')).toBeVisible();
  await expect(page.getByTestId('play-banner')).toContainText(
    'Prototipo con datos simulados — las acciones no están conectadas al juego',
  );
  await expect(page.getByTestId('simulation-badges').getByText('Datos simulados').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deshacer' })).toBeDisabled();

  const stage = page.getByTestId('play-stage');
  const slots = stage.locator('[data-play-type="slot"]');
  const itemNames = () => stage.locator('[data-item-name]').evaluateAll((els) => els.map((e) => e.getAttribute('data-item-name')));
  await expect(slots.first()).toBeVisible();
  await expect.poll(itemNames).toContain('Espada de hierro');

  // Clicking a tab shows another category.
  await stage.locator('[data-play-type="button"]', { hasText: 'Armaduras' }).click();
  await expect.poll(itemNames).toContain('Yelmo de acero');
  expect(await itemNames()).not.toContain('Espada de hierro');
  await stage.locator('[data-play-type="button"]', { hasText: 'Armas' }).click();
  await expect.poll(itemNames).toContain('Espada de hierro');

  // Drag the first item onto an empty slot with the mouse.
  const from = slots.nth(0);
  const to = slots.nth(6);
  await expect(to.locator('[data-item-name]')).toHaveCount(0);
  const fromBox = (await from.boundingBox())!;
  const toBox = (await to.boundingBox())!;
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(fromBox.x + fromBox.width / 2 + 20, fromBox.y + fromBox.height / 2 + 20, { steps: 4 });
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 8 });
  await expect(to).toHaveAttribute('data-drop-state', 'accept');
  await expect(page.getByTestId('play-drag-ghost')).toBeVisible();
  await page.mouse.up();

  const moved = page.getByTestId('activity-event').first();
  await expect(moved).toHaveAttribute('data-intent', 'inventory.moveItem');
  await expect(moved).toContainText('Mover objeto');
  await expect(moved).toContainText('aplicado');
  await expect(moved).toContainText('Simulado');
  await expect(to.locator('[data-item-name="Espada de hierro"]')).toHaveCount(1);
  await expect(from.locator('[data-item-name]')).toHaveCount(0);

  // Right-click a consumable: menu -> Usar decrements its stack.
  await stage.locator('[data-play-type="button"]', { hasText: 'Consumibles' }).click();
  const potion = slots.nth(0);
  await expect(potion.getByTestId('play-item-quantity')).toHaveText('×5');
  await potion.click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Usar' })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Usar' }).click();
  await expect(potion.getByTestId('play-item-quantity')).toHaveText('×4');
  await expect(page.getByTestId('activity-event').first()).toHaveAttribute('data-intent', 'inventory.useItem');
  await expect(page.getByTestId('activity-event').first()).toContainText('aplicado');

  // Escape closes a menu.
  await potion.click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  await page.screenshot({ path: 'e2e/artifacts/play.png' });

  // "Limpiar registro" is view-only; "Reiniciar" restores the data.
  await page.getByRole('button', { name: 'Limpiar registro' }).click();
  await expect(page.getByTestId('activity-empty')).toBeVisible();
  await expect(potion.getByTestId('play-item-quantity')).toHaveText('×4');
  await page.getByRole('button', { name: 'Reiniciar' }).click();
  await expect(slots.nth(0).locator('[data-item-name="Espada de hierro"]')).toHaveCount(1);
  await expect(slots.nth(6).locator('[data-item-name]')).toHaveCount(0);
  await stage.locator('[data-play-type="button"]', { hasText: 'Consumibles' }).click();
  await expect(slots.nth(0).getByTestId('play-item-quantity')).toHaveText('×5');

  // Back in Diseñar nothing was written to the document.
  await page.getByRole('tab', { name: 'Diseñar' }).click();
  await expect(page.getByRole('button', { name: 'Deshacer' })).toBeEnabled();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');
});
