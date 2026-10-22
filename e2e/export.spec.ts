import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/** A just-big-enough Unity project: Assets, ProjectSettings/ProjectVersion.txt and a manifest. */
function makeFakeUnityProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'forma-e2e-unity-'));
  mkdirSync(join(root, 'Assets'));
  mkdirSync(join(root, 'ProjectSettings'));
  mkdirSync(join(root, 'Packages'));
  writeFileSync(join(root, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.0.73f1\n');
  writeFileSync(
    join(root, 'Packages', 'manifest.json'),
    `${JSON.stringify({ dependencies: { 'com.unity.ugui': '2.0.0' } }, null, 2)}\n`,
  );
  return root;
}

test('exports the tabbed inventory to a Unity project: analyze, install package, export', async ({ page }) => {
  const unity = makeFakeUnityProject();
  try {
    await page.goto('/');
    await page.getByRole('button', { name: /Empezar desde cero/ }).click();
    await page.getByLabel('Nombre del proyecto').fill('E2E Exportar');
    await page.getByRole('button', { name: 'Crear proyecto' }).click();
    await expect(page.getByTestId('editor')).toBeVisible();

    await page.getByRole('tab', { name: 'Biblioteca' }).click();
    await page.getByLabel('Buscar en la biblioteca').fill('inventario con pestañas');
    await page.getByTestId('library-entry').first().getByRole('button', { name: /Insertar/ }).click();
    await expect(page.getByTestId('canvas-stage').locator('[data-node-type="slot"]').first()).toBeVisible();
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');

    await page.getByRole('tab', { name: 'Exportar' }).click();
    const mode = page.getByTestId('export-mode');
    await expect(mode).toBeVisible();

    // Targets: uGUI is the only one that works; the others say so honestly.
    await expect(page.locator('[data-testid="export-target"][data-target="unity-ugui"]')).toHaveAttribute(
      'data-enabled',
      'true',
    );
    for (const target of ['unity-uitoolkit', 'web-react']) {
      const row = page.locator(`[data-testid="export-target"][data-target="${target}"]`);
      await expect(row).toHaveAttribute('data-enabled', 'false');
      await expect(row).toContainText('Próximamente');
    }

    // Without a folder nothing can be analyzed or exported.
    await expect(page.getByRole('button', { name: 'Analizar compatibilidad' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Exportar a Unity' })).toBeDisabled();
    await expect(page.getByTestId('export-status-line')).toHaveText('Sin exportar');
    // Plain browser: there is no native folder picker.
    await expect(page.getByRole('button', { name: /Elegir carpeta/ })).toHaveCount(0);

    await page.getByLabel('Carpeta del proyecto Unity').fill(unity);
    await page.getByRole('button', { name: 'Analizar compatibilidad' }).click();

    const report = page.getByTestId('export-report');
    await expect(report).toBeVisible();
    expect(await page.getByTestId('report-group').count()).toBeGreaterThan(0);
    await expect(page.locator('[data-testid="report-group"][data-status="supported"]')).toContainText('Funciona');
    await expect(report.getByRole('heading', { name: 'Qué vas a recibir' })).toBeVisible();
    await expect(report.getByRole('heading', { name: 'Qué tenés que conectar' })).toBeVisible();
    await expect(page.getByTestId('export-diff')).toHaveCount(0);

    // The package is missing: install it after confirming (a backup of the manifest is kept).
    await expect(page.getByTestId('unity-version')).toHaveText('6000.0.73f1');
    await expect(page.getByTestId('package-check')).toHaveAttribute('data-installed', 'false');
    await page.getByRole('button', { name: 'Instalar paquete', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Instalar el paquete de Forma' });
    await expect(dialog).toContainText('manifest.json.forma-backup');
    await dialog.getByRole('button', { name: 'Instalar', exact: true }).click();
    await expect(page.getByTestId('package-check')).toHaveAttribute('data-installed', 'true');
    await expect(page.getByTestId('install-note')).toContainText('Packages/manifest.json.forma-backup');

    const manifest = JSON.parse(readFileSync(join(unity, 'Packages', 'manifest.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(manifest.dependencies['com.forma.studio']).toMatch(/^file:.*unity\/com\.forma\.studio$/);
    expect(manifest.dependencies['com.unity.ugui']).toBe('2.0.0');
    expect(existsSync(join(unity, 'Packages', 'manifest.json.forma-backup'))).toBe(true);

    await page.getByRole('button', { name: 'Exportar a Unity' }).click();
    const result = page.getByTestId('export-result');
    await expect(result).toBeVisible();
    await expect(page.getByTestId('export-status')).toHaveText('Exportado — pendiente de verificar en Unity');
    await expect(result).not.toContainText('integrado');
    const written = page.getByTestId('written-files');
    await expect(written).toContainText('Assets/FormaStudio/Generated/Pantalla_1.forma.json');
    await expect(written).toContainText('README-forma.txt');
    await expect(page.getByTestId('prefab-path')).toHaveText('Assets/FormaStudio/Generated/Pantalla_1.prefab');
    await expect(page.getByTestId('next-steps')).toContainText('Abrí Unity: el importador de Forma crea o actualiza el prefab en');

    const generated = join(unity, 'Assets', 'FormaStudio', 'Generated');
    expect(readdirSync(generated).sort()).toEqual(['Pantalla_1.forma.json', 'README-forma.txt']);
    const bundle = JSON.parse(readFileSync(join(generated, 'Pantalla_1.forma.json'), 'utf8')) as {
      format: string;
      meta: { screenName: string };
    };
    expect(bundle.format).toBe('forma.ugui-bundle/v1');
    expect(bundle.meta.screenName).toBe('Pantalla 1');

    await expect(page.getByTestId('export-history-item')).toHaveCount(1);

    // The folder is remembered for this project.
    await page.getByRole('tab', { name: 'Diseñar' }).click();
    await page.getByRole('tab', { name: 'Exportar' }).click();
    await expect(page.getByLabel('Carpeta del proyecto Unity')).toHaveValue(unity);
    await expect(page.getByTestId('export-history-item')).toHaveCount(1);

    // Analyzing again compares against the export we just made.
    await page.getByRole('button', { name: 'Analizar compatibilidad' }).click();
    await expect(page.getByTestId('export-diff')).toContainText('No hay cambios');

    await page.screenshot({ path: 'e2e/artifacts/export.png' });
  } finally {
    rmSync(unity, { recursive: true, force: true });
  }
});
