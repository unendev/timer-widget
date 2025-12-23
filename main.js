import { app, BrowserWindow, screen, globalShortcut, session, ipcMain, Menu } from 'electron';

// 修复 Windows 下透明窗口可能变黑的问题
app.disableHardwareAcceleration();

// 隐藏菜单栏
Menu.setApplicationMenu(null);

// 环境配置
const isDev = !app.isPackaged;
const BASE_URL = isDev
  ? 'http://localhost:10000' // 开发环境：本地 Next.js
  : 'https://dashboard.unendev.com'; // 生产环境：Vercel 部署

let mainWindow;
let createWindow;

function createMainWindow() {
  const {
    width: screenWidth,
    height: screenHeight,
  } = screen.getPrimaryDisplay().workAreaSize;

  // 初始位置在右上角
  const windowWidth = 300;
  const windowHeight = 400;

  // 配置 session 以正确处理 cookie
  const ses = session.fromPartition('persist:timer-widget');

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: screenWidth - windowWidth - 20,
    y: 20,
    frame: false,
    transparent: false,
    backgroundColor: '#18181b',
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

  // 拦截 window.open 调用，使用自定义无边框窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('🔵 [setWindowOpenHandler] 拦截到 window.open:', url);
    if (url.includes('/widget/create')) {
      openCreateWindow();
      return { action: 'deny' }; // 阻止默认行为
    }
    return { action: 'allow' };
  });

  // 监听所有网络请求
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    console.log('📡 Request:', details.url);
    callback({ requestHeaders: details.requestHeaders });
  });

  // 监听响应
  mainWindow.webContents.session.webRequest.onCompleted((details) => {
    if (details.statusCode >= 400) {
      console.error(`❌ ${details.statusCode} ${details.url}`);
    }
  });

  // 监听错误
  mainWindow.webContents.on('crashed', () => {
    console.error('❌ Renderer process crashed');
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('❌ Render process gone:', details);
  });

  // 加载 Widget 页面
  console.log(`🚀 Loading: ${BASE_URL}/widget/timer`);
  mainWindow.loadURL(`${BASE_URL}/widget/timer`);

  // 监听 URL 变化，检测登录页面并调整窗口大小
  mainWindow.webContents.on('did-navigate', (event, url) => {
    console.log('📍 did-navigate:', url);

    if (url.includes('/widget/login')) {
      console.log('🔐 Detected widget login page, resizing window...');
      mainWindow.setSize(320, 380);
      mainWindow.center();
    } else if (url.includes('/auth/signin') || url.includes('/auth/register')) {
      // 如果意外跳转到主登录页，重定向到 widget 登录页
      console.log('🔄 Redirecting to widget login...');
      mainWindow.loadURL(`${BASE_URL}/widget/login`);
    } else if (url.includes('/widget/timer')) {
      console.log('✅ Detected widget page, resizing window...');
      const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
      mainWindow.setSize(300, 400);
      mainWindow.setPosition(screenWidth - 320, 20);
    } else if (
      url === `${BASE_URL}/` ||
      url === BASE_URL ||
      url.includes('/dashboard') ||
      (url.includes('/log') && !url.includes('/auth'))
    ) {
      // 登录成功后被重定向到主页，自动跳转回 widget
      console.log('🔄 Detected redirect to home, going back to widget...');
      mainWindow.loadURL(`${BASE_URL}/widget/timer`);
    }
  });

  // 监听页面加载完成 - 简化逻辑，避免重复重定向
  mainWindow.webContents.on('did-finish-load', () => {
    // 注入 CSS 隐藏滚动条
    mainWindow.webContents.insertCSS(`
      * {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      *::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
    `);
    
    // 页面加载完成后显示窗口
    mainWindow.show();
    
    mainWindow.webContents.executeJavaScript('window.location.href').then((url) => {
      console.log('✅ Page loaded:', url);
    });
  });

  // 开发环境：开启 DevTools
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 注册快捷键 (仅在窗口激活时有效)
  mainWindow.on('focus', () => {
    // F5 刷新
    globalShortcut.register('F5', () => {
      mainWindow.reload();
    });
    // Ctrl+Shift+I 打开 DevTools
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      mainWindow.webContents.toggleDevTools();
    });
  });

  mainWindow.on('blur', () => {
    globalShortcut.unregister('F5');
    globalShortcut.unregister('CommandOrControl+Shift+I');
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
    globalShortcut.unregisterAll();
  });

  // Windows 虚拟桌面支持：设置窗口属性使其跟随虚拟桌面
  if (process.platform === 'win32') {
    try {
      // 使用 native 模块设置窗口属性
      const hwnd = mainWindow.getNativeWindowHandle();
      // 注意：这需要 native 模块支持，如果没有可以使用其他方式
      console.log('🖥️ Window handle:', hwnd);
    } catch (e) {
      console.log('⚠️ Could not set virtual desktop properties');
    }
  }
}

app.on('ready', () => {
  // 清除缓存，避免 chunk hash 不匹配
  const ses = session.fromPartition('persist:timer-widget');
  ses.clearCache().then(() => {
    console.log('🧹 Cache cleared');
    setTimeout(createMainWindow, 300);
  });
});

// 打开创建任务窗口
function openCreateWindow() {
  console.log('🔵 [openCreateWindow] 函数被调用');
  
  if (createWindow) {
    console.log('🔵 [openCreateWindow] 窗口已存在，聚焦');
    createWindow.focus();
    return;
  }

  console.log('🔵 [openCreateWindow] 创建新窗口...');
  const ses = session.fromPartition('persist:timer-widget');
  
  const windowOptions = {
    width: 500,
    height: 810,
    title: '新建任务',
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    transparent: false,
    backgroundColor: '#111827',
    alwaysOnTop: true,
    resizable: true,
    minWidth: 400,
    minHeight: 700,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      session: ses,
    },
  };
  
  console.log('🔵 [openCreateWindow] 窗口配置:', JSON.stringify(windowOptions, null, 2));
  
  createWindow = new BrowserWindow(windowOptions);

  console.log('🔵 [openCreateWindow] 窗口创建完成，frame:', createWindow.isFrameless ? '无边框' : '有边框');

  // 确保移除菜单
  createWindow.setMenu(null);
  createWindow.removeMenu();

  createWindow.loadURL(`${BASE_URL}/widget/create`);
  console.log('🔵 [openCreateWindow] 加载URL:', `${BASE_URL}/widget/create`);
  
  createWindow.webContents.on('did-finish-load', () => {
    console.log('🔵 [openCreateWindow] 页面加载完成');
    createWindow.webContents.insertCSS(`
      * { scrollbar-width: none !important; }
      *::-webkit-scrollbar { display: none !important; }
    `);
    createWindow.setTitle('新建任务');
  });

  createWindow.on('closed', () => {
    console.log('🔵 [openCreateWindow] 窗口关闭');
    createWindow = null;
    if (mainWindow) {
      mainWindow.reload();
    }
  });
}

// 监听来自渲染进程的消息
ipcMain.on('open-create-window', () => {
  openCreateWindow();
});

app.on('window-all-closed', function () {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createMainWindow();
  }
});
