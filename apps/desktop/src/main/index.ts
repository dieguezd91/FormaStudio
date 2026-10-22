import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';

const dirname = fileURLToPath(new URL('.', import.meta.url));

/** The folder picker for the Unity project; only the app's own window may ask for it. */
function registerIpc(): void {
  ipcMain.handle('forma:pick-folder', async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const options = {
      title: 'Elegí la carpeta raíz de tu proyecto Unity',
      properties: ['openDirectory' as const],
    };
    const result = await dialog.showOpenDialog(win, options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: 'Forma Studio',
    webPreferences: {
      preload: join(dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
