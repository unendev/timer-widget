import { app, BrowserWindow, screen, globalShortcut, session, ipcMain, Menu } from 'electron';
import fs from 'fs';
import path from 'path';

app.disableHardwareAcceleration();
Menu.setApplicationMenu(null);

const isDev = !app.isPackaged;
const BASE_URL = isDev ? 'http://localhost:10000' : 'https://dashboard.unendev.com';

let mainWindow;
let createWindow;
let memoWindow;
let todoWindow;
let aiWindow;
let settingsWindow;

const windowStatePath = () => path.join(app.getPath('userData'), 'timer-window-state.json');

const isValidNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const loadWindowState = (defaults) => {
  try {
    if (!fs.existsSync(windowStatePath())) return defaults;
    const raw = fs.readFileSync(windowStatePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      !isValidNumber(parsed.width) ||
      !isValidNumber(parsed.height) ||
      !isValidNumber(parsed.x) ||
      !isValidNumber(parsed.y)
    ) {
      return defaults;
    }
    return {
      width: parsed.width,
      height: parsed.height,
      x: parsed.x,
      y: parsed.y,
    };
  } catch (error) {
    console.warn('?? Failed to load window state:', error);
    return defaults;
  }
};

const saveWindowState = (win) => {
  if (!win || win.isDestroyed()) return;
  try {
    const { width, height, x, y } = win.getBounds();
    const payload = { width, height, x, y };
    fs.writeFileSync(windowStatePath(), JSON.stringify(payload));
  } catch (error) {
    console.warn('?? Failed to save window state:', error);
  }
};

const normalizeBounds = (bounds, minWidth, minHeight) => {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.max(bounds.width || minWidth, minWidth);
  const height = Math.max(bounds.height || minHeight, minHeight);
  const x = clamp(isValidNumber(bounds.x) ? bounds.x : sw - width - 50, 0, Math.max(0, sw - width));
  const y = clamp(isValidNumber(bounds.y) ? bounds.y : 50, 0, Math.max(0, sh - height));
  return { width, height, x, y };
};

// 通用窗口创建函数
function createToolWindow(type, existingWindow) {
  if (existingWindow) {
    existingWindow.focus();
    return existingWindow;
  }

  const ses = session.fromPartition('persist:timer-widget');
  const configs = {
    memo: { width: 320, height: 450, title: '备忘录', url: '/widget/memo' },
    todo: { width: 320, height: 450, title: '待办事项', url: '/widget/todo' },
    ai: { width: 360, height: 500, title: 'AI 助手', url: '/widget/ai' },
    settings: { width: 300, height: 350, title: '设置', url: '/widget/settings' },
    create: { width: 500, height: 810, title: '新建任务', url: '/widget/create' },
  };
  const config = configs[type];

  // 获取主窗口位置，新窗口在其左侧
  let x, y;
  if (mainWindow) {
    const [mainX, mainY] = mainWindow.getPosition();
    x = mainX - config.width - 10;
    y = mainY;
  }

  const win = new BrowserWindow({
    width: config.width,
    height: config.height,
    x, y,
    title: config.title,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a1a',
    alwaysOnTop: true,
    resizable: true,
    minWidth: 250,
    minHeight: 200,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      session: ses,
    },
  });

  win.setMenu(null);
  win.loadURL(`${BASE_URL}${config.url}`);

  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(`
      * { scrollbar-width: none !important; }
      *::-webkit-scrollbar { display: none !important; }
      [data-drag="true"] { -webkit-app-region: drag; }
      [data-drag="false"] { -webkit-app-region: no-drag; }
    `);
  });

  return win;
}

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

  // 添加日志
  console.log('📐 Screen width:', screenWidth);
  console.log('?? Window position:', x, y);

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
    minWidth: 200,
    minHeight: 100,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      session: ses,
    },
  });

  console.log('📐 Window created, resizable:', mainWindow.isResizable());

  // 拦截 window.open 调用
  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    console.log('🔵 [setWindowOpenHandler] 拦截:', openUrl);
    if (openUrl.includes('/widget/create')) {
      openCreateWindow();
      return { action: 'deny' };
    }
    if (openUrl.includes('/widget/memo')) {
      openMemoWindow();
      return { action: 'deny' };
    }
    if (openUrl.includes('/widget/todo')) {
      openTodoWindow();
      return { action: 'deny' };
    }
    if (openUrl.includes('/widget/settings')) {
      openSettingsWindow();
      return { action: 'deny' };
    }
    if (openUrl.includes('/widget/ai')) {
      openAiWindow();
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.session.webRequest.onCompleted((details) => {
    if (details.statusCode >= 400) {
      console.error(`❌ ${details.statusCode} ${details.url}`);
    }
  });

  console.log(`🚀 Loading: ${BASE_URL}/widget/timer`);
  mainWindow.loadURL(`${BASE_URL}/widget/timer`);

  mainWindow.webContents.on('did-navigate', (_event, url) => {
    console.log('📍 did-navigate:', url);
    if (url.includes('/widget/login')) {
      mainWindow.setSize(320, 380);
      mainWindow.center();
    } else if (url.includes('/auth/signin') || url.includes('/auth/register')) {
      mainWindow.loadURL(`${BASE_URL}/widget/login`);
    } else if (url.includes('/widget/timer')) {
      const restored = normalizeBounds(loadWindowState(defaultBounds), 200, 100);
      mainWindow.setBounds(restored);
    } else if (url === `${BASE_URL}/` || url === BASE_URL || url.includes('/dashboard')) {
      mainWindow.loadURL(`${BASE_URL}/widget/timer`);
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('📄 Page loaded, injecting CSS...');
    mainWindow.webContents.insertCSS(`
      * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      [data-drag="true"] { -webkit-app-region: drag; }
      [data-drag="false"] { -webkit-app-region: no-drag; }
    `).then(() => {
      console.log('✅ CSS injected');
    });
    
    const [x, y] = mainWindow.getPosition();
    const [w, h] = mainWindow.getSize();
    console.log('📐 Final position:', x, y, 'size:', w, h);
    
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
    console.log('🧹 Cache cleared');
    setTimeout(createMainWindow, 300);
  });
});

function openCreateWindow() {
  if (createWindow) { createWindow.focus(); return; }
  createWindow = createToolWindow('create', null);
  createWindow.on('closed', () => {
    createWindow = null;
    if (mainWindow) mainWindow.reload();
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
  // 开发模式下打开 DevTools
  if (isDev) {
    aiWindow.webContents.openDevTools({ mode: 'detach' });
  }
  aiWindow.on('closed', () => { aiWindow = null; });
}

ipcMain.on('open-create-window', () => openCreateWindow());
ipcMain.on('open-memo-window', () => openMemoWindow());
ipcMain.on('open-todo-window', () => openTodoWindow());
ipcMain.on('open-ai-window', () => openAiWindow());
ipcMain.on('open-settings-window', () => openSettingsWindow());

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createMainWindow();
});
