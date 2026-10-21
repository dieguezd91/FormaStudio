import { expect, test } from '@playwright/test';

test('inserts the inventory pattern, edits a fill, undoes it and survives a reload', async ({ page }) => {
  await page.goto('/');

  // Create a project from scratch.
  await page.getByRole('button', { name: /Empezar desde cero/ }).click();
  await page.getByLabel('Nombre del proyecto').fill('E2E');
  await page.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(page.getByTestId('project-name')).toHaveText('E2E');

  // Find the inventory pattern in the library and insert it.
  await page.getByRole('tab', { name: 'Biblioteca' }).click();
  await page.getByLabel('Buscar en la biblioteca').fill('inventario con pestañas');
  const entry = page.getByTestId('library-entry').first();
  await expect(entry).toBeVisible();
  await entry.getByRole('button', { name: /Insertar/ }).click();

  // The canvas shows slots with bound item quantities.
  const canvas = page.getByTestId('canvas-stage');
  await expect(canvas.locator('[data-node-type="slot"]').first()).toBeVisible();
  await expect(canvas.getByTestId('item-quantity').first()).toBeVisible();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');
  await page.screenshot({ path: 'e2e/artifacts/editor.png' });

  // Select a slot and change its fill.
  await canvas.locator('[data-node-type="slot"]').first().click({ force: true });
  await expect(page.getByTestId('node-inspector')).toContainText('Casilla');
  const mode = page.getByTestId('style-fill-mode');
  await mode.selectOption({ label: 'Valor propio' });
  const fill = page.getByTestId('style-fill-value');
  await expect(fill).toBeVisible();
  const before = await fill.inputValue();
  await fill.fill('#ff0000');
  await fill.press('Enter');
  await expect(page.getByTestId('style-fill-value')).toHaveValue('#ff0000');

  // Undo restores the previous fill.
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByTestId('style-fill-value')).toHaveValue(before);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');

  // Reload and reopen the project: the inserted inventory is still there.
  await page.reload();
  await expect(page.getByTestId('editor')).toBeVisible();
  await page.getByRole('button', { name: 'Volver a Proyectos' }).click();
  await page.getByTestId('recent-project').filter({ hasText: 'E2E' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(page.getByTestId('canvas-stage').locator('[data-node-type="slot"]').first()).toBeVisible();
  await expect(page.getByTestId('canvas-stage').getByTestId('item-quantity').first()).toBeVisible();
});
