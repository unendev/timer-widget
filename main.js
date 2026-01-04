import { app, BrowserWindow, screen, globalShortcut, session, ipcMain, Menu } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.disableHardwareAcceleration();
Menu.setApplicationMenu(null);

// 如果未打包且 NODE_ENV 不为 'production'，则视为开发模式
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
const VITE_DEV_SERVER_URL = 'http://localhost:5173';

process.on('uncaughtException', (error) => {
  console.error('[Main Process] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main Process] Unhandled Rejection:', reason);
});

// 内存中缓存 Cookie，用于手动注入 (已废弃，保留变量防止引用报错，可后续删除)
let cachedSessionCookie = '';

app.on('ready', () => {
  const ses = session.fromPartition('persist:timer-widget');
  // 已移除 Cookie 拦截器，改用纯 Token 认证方案
  console.log('[Main Process] Ready (Token Auth Mode)');
});

const windowStatePath = () => path.join(app.getPath('userData'), 'timer-window-state.json');

const isValidNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const loadWindowState = (defaults) => {
  try {
    if (!fs.existsSync(windowStatePath())) return defaults;
    const raw = fs.readFileSync(windowStatePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !isValidNumber(parsed.width) || !isValidNumber(parsed.height)) return defaults;
    return { width: parsed.width, height: parsed.height, x: parsed.x, y: parsed.y };
  } catch (error) {
    return defaults;
  }
};

const saveWindowState = (win) => {
  if (!win || win.isDestroyed()) return;
  try {
    const { width, height, x, y } = win.getBounds();
    fs.writeFileSync(windowStatePath(), JSON.stringify({ width, height, x, y }));
  } catch (error) { }
};

const normalizeBounds = (bounds, minWidth, minHeight) => {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.max(bounds.width || minWidth, minWidth);
  const height = Math.max(bounds.height || minHeight, minHeight);
  const x = clamp(isValidNumber(bounds.x) ? bounds.x : sw - width - 50, 0, Math.max(0, sw - width));
  const y = clamp(isValidNumber(bounds.y) ? bounds.y : 50, 0, Math.max(0, sh - height));
  return { width, height, x, y };
};

function loadWindow(win, route) {
  if (isDev) {
    win.loadURL(`${VITE_DEV_SERVER_URL}/#${route}`);
  } else {
    // 强制使用绝对路径确保生产模式下能找到 index.html
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    console.log(`[Main Process] Loading window with path: ${indexPath}, hash: ${route}`);
    if (fs.existsSync(indexPath)) {
      win.loadFile(indexPath, { hash: route });
    } else {
      // 兼容直接在项目根目录运行的情况
      const fallbackPath = path.join(__dirname, 'index.html');
      console.log(`[Main Process] Falling back to path: ${fallbackPath}`);
      win.loadFile(fallbackPath, { hash: route });
    }
  }
}

function createToolWindow(type, existingWindow) {
  if (existingWindow) {
    existingWindow.focus();
    return existingWindow;
  }

  const ses = session.fromPartition('persist:timer-widget');
  const configs = {
    memo: { width: 320, height: 450, title: '备忘录', route: '/memo' },
    todo: { width: 320, height: 450, title: '待办事项', route: '/todo' },
    ai: { width: 360, height: 500, title: 'AI 助手', route: '/ai' },
    settings: { width: 300, height: 350, title: '设置', route: '/settings' },
    create: { width: 500, height: 600, title: '新建任务', route: '/create' },
  };
  const config = configs[type];

  let x, y;
  if (mainWindow) {
    const [mainX, mainY] = mainWindow.getPosition();
    x = mainX - config.width - 10;
    y = mainY;
  }

  const win = new BrowserWindow({
    width: config.width,
    height: config.height,
    x,
    y,
    title: config.title,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a1a',
    alwaysOnTop: true,
    resizable: true,
    maximizable: false,
    minWidth: 250,
    minHeight: 200,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      session: ses,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false, // 允许本地文件处理 Cookie 和跨域
    },
  });

  win.setMenu(null);

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  loadWindow(win, config.route);

  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(`
      * { scrollbar-width: none !important; }
      *::-webkit-scrollbar { display: none !important; }
      [data-drag="true"] { -webkit-app-region: drag; }
      [data-drag="false"] { -webkit-app-region: no-drag; }
    `);
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Main Process] ${type} window failed to load: ${validatedURL} (${errorCode}: ${errorDescription})`);
  });

  return win;
}

let mainWindow;
let createWindow;
let memoWindow;
let todoWindow;
let aiWindow;
let settingsWindow;

function createMainWindow() {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = 300;
  const windowHeight = 200;
  const ses = session.fromPartition('persist:timer-widget');
  const defaultBounds = {
    width: windowWidth,
    height: windowHeight,
    x: screenWidth - windowWidth - 50,
    y: 50,
  };
  const savedBounds = normalizeBounds(loadWindowState(defaultBounds), 200, 100);
  const { width, height, x, y } = savedBounds;

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a1a',
    alwaysOnTop: true,
    resizable: true,
    maximizable: false,
    minWidth: 200,
    minHeight: 100,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      session: ses,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (openUrl.includes('#/create')) { openCreateWindow(); return { action: 'deny' }; }
    if (openUrl.includes('#/memo')) { openMemoWindow(); return { action: 'deny' }; }
    if (openUrl.includes('#/todo')) { openTodoWindow(); return { action: 'deny' }; }
    if (openUrl.includes('#/settings')) { openSettingsWindow(); return { action: 'deny' }; }
    if (openUrl.includes('#/ai')) { openAiWindow(); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  loadWindow(mainWindow, '/timer');

  mainWindow.webContents.on('did-navigate', (_event, url) => {
    if (url.includes('#/login')) {
      mainWindow.setSize(320, 420);
      mainWindow.center();
    } else if (url.includes('#/timer')) {
      const [w, h] = mainWindow.getSize();
      if (w === 320 && h === 420) {
        const restored = normalizeBounds(loadWindowState(defaultBounds), 200, 100);
        mainWindow.setBounds(restored);
      }
    }
  });

  mainWindow.webContents.on('did-start-navigation', (event, url) => {
    console.log(`[Main Process] Started navigation to: ${url}`);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Main Process] Failed to load: ${validatedURL} (${errorCode}: ${errorDescription})`);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(`
      * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      [data-drag="true"] { -webkit-app-region: drag !important; }
      [data-drag="false"] { -webkit-app-region: no-drag !important; }
    `);
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  let saveTimeout;
  const scheduleSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveWindowState(mainWindow), 200);
  };

  mainWindow.on('resize', scheduleSave);
  mainWindow.on('move', scheduleSave);
  mainWindow.on('close', () => saveWindowState(mainWindow));

  mainWindow.on('focus', () => {
    globalShortcut.register('F5', () => mainWindow.reload());
    globalShortcut.register('CommandOrControl+Shift+I', () => mainWindow.webContents.toggleDevTools());
  });

  mainWindow.on('blur', () => {
    globalShortcut.unregister('F5');
    globalShortcut.unregister('CommandOrControl+Shift+I');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    globalShortcut.unregisterAll();
  });
}

app.on('ready', () => {
  const ses = session.fromPartition('persist:timer-widget');
  ses.clearCache().then(() => {
    setTimeout(createMainWindow, 300);
  });
});

function openCreateWindow() {
  if (createWindow) { createWindow.focus(); return; }
  createWindow = createToolWindow('create', null);
  createWindow.on('closed', () => {
    createWindow = null;
    // Removed reload here to avoid interrupting IPC/Storage logic
    // If we use IPC, the TimerPage will update itself anyway.
  });
}

function openMemoWindow() {
  if (memoWindow) { memoWindow.focus(); return; }
  memoWindow = createToolWindow('memo', null);
  memoWindow.on('closed', () => { memoWindow = null; });
}

function openTodoWindow() {
  if (todoWindow) { todoWindow.focus(); return; }
  todoWindow = createToolWindow('todo', null);
  todoWindow.on('closed', () => { todoWindow = null; });
}

function openSettingsWindow() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = createToolWindow('settings', null);
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function openAiWindow() {
  if (aiWindow) { aiWindow.focus(); return; }
  aiWindow = createToolWindow('ai', null);
  if (isDev) aiWindow.webContents.openDevTools({ mode: 'detach' });
  aiWindow.on('closed', () => { aiWindow = null; });
}

ipcMain.on('open-create-window', () => openCreateWindow());
ipcMain.on('open-memo-window', () => openMemoWindow());
ipcMain.on('open-todo-window', () => openTodoWindow());
ipcMain.on('open-ai-window', () => openAiWindow());
ipcMain.on('open-settings-window', () => openSettingsWindow());

// Handle task creation IPC from Create window to Main window
ipcMain.on('start-task', (event, taskData) => {
  console.log('[Main Process] Received start-task:', taskData.name);
  if (mainWindow) {
    mainWindow.webContents.send('on-start-task', taskData);
  }
});

// Handle AI task creation from Create window (Fire and Forget)
ipcMain.on('ai-create-task', async (event, { text, userId, autoStart }) => {
  console.log('🤖 [Main Process] Received ai-create-task:', text);

  // 1. Defensively check for backend availability or just try/catch
  try {
    const response = await fetch('http://localhost:10000/api/timer-tasks/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [Main Process] AI API Error:', response.status, errorText);
      return;
    }

    const parsed = await response.json();
    console.log('✅ [Main Process] AI Parsed Result:', parsed);

    if (mainWindow) {
      // Construct the task object
      const taskData = {
        name: parsed.name,
        userId: userId || 'user-1', // Fallback
        categoryPath: parsed.categoryPath,
        date: new Date().toISOString().split('T')[0], // Today
        initialTime: 0,
        instanceTagNames: parsed.instanceTags ? parsed.instanceTags.join(',') : '',
        timestamp: Date.now(),
        autoStart: autoStart
      };

      console.log('🚀 [Main Process] Starting parsed task:', taskData.name);
      mainWindow.webContents.send('on-start-task', taskData);
    }

  } catch (error) {
    console.error('❌ [Main Process] AI Processing Exception:', error);
  }
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createMainWindow();
});
