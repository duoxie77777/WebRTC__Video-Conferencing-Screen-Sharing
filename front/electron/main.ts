import { app, BrowserWindow, Menu, ipcMain, desktopCapturer, screen, systemPreferences } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import isDev from 'electron-is-dev';
import { mouse, keyboard, Button, Key } from '@nut-tree/nut-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
// 获取项目根目录（electron 目录的父目录）
const rootPath = isDev ? path.join(__dirname, '..') : app.getAppPath();

// 远程控制权限管理
const remoteControlPermissions = new Map<string, boolean>(); // user -> isAllowed

// 配置 nut-js (加快响应速度)
mouse.config.mouseSpeed = 5000; // 鼠标移动速度
mouse.config.autoDelayMs = 0; // 无延迟

// 处理屏幕共享请求
ipcMain.handle('get-desktop-sources', async () => {
    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 150, height: 150 }
        });
        
        return sources.map(source => ({
            id: source.id,
            name: source.name,
            thumbnail: source.thumbnail.toDataURL()
        }));
    } catch (error) {
        console.error('获取桌面源失败:', error);
        return [];
    }
});

// ======================== 远程控制功能 ========================

// 请求远程控制权限
ipcMain.handle('request-remote-control', async (_event, data: { fromUser: string }) => {
    console.log(`[远程控制] ${data.fromUser} 请求控制权限`);
    
    // 在 macOS 上请求辅助功能权限
    if (process.platform === 'darwin') {
        const status = systemPreferences.getMediaAccessStatus('screen');
        if (status !== 'granted') {
            console.warn('[远程控制] macOS 辅助功能权限未授予');
        }
    }
    
    return { allowed: true };
});

// 授予/撤销远程控制权限
ipcMain.handle('set-remote-control-permission', async (_event, data: { user: string; allowed: boolean }) => {
    remoteControlPermissions.set(data.user, data.allowed);
    console.log(`[远程控制] ${data.user} 权限 ${data.allowed ? '已授予' : '已撤销'}`);
    return { success: true };
});

// 执行远程鼠标移动
ipcMain.handle('remote-mouse-move', async (_event, data: { user: string; x: number; y: number; screenWidth: number; screenHeight: number }) => {
    if (!remoteControlPermissions.get(data.user)) {
        console.warn(`[远程控制] ${data.user} 无权限`);
        return { success: false, error: 'Permission denied' };
    }
    
    try {
        // 获取主屏幕尺寸
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.bounds;
        
        // 转换坐标（相对坐标 0-1 转绝对坐标）
        const absX = Math.round(data.x * width);
        const absY = Math.round(data.y * height);
        
        // 使用 nut-js 移动鼠标
        await mouse.setPosition({ x: absX, y: absY });
        
        console.log(`[远程控制] 鼠标移动到 (${absX}, ${absY})`);
        
        return { success: true, x: absX, y: absY };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[远程控制] 鼠标移动失败:', errorMessage);
        return { success: false, error: errorMessage };
    }
});

// 执行远程鼠标点击
ipcMain.handle('remote-mouse-click', async (_event, data: { user: string; button: 'left' | 'right' | 'middle'; action: 'down' | 'up'; x: number; y: number }) => {
    if (!remoteControlPermissions.get(data.user)) {
        return { success: false, error: 'Permission denied' };
    }
    
    try {
        // 获取主屏幕尺寸
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.bounds;
        
        // 转换坐标
        const absX = Math.round(data.x * width);
        const absY = Math.round(data.y * height);
        
        // 先移动到点击位置
        await mouse.setPosition({ x: absX, y: absY });
        
        // 映射按钮
        const buttonMap = {
            'left': Button.LEFT,
            'right': Button.RIGHT,
            'middle': Button.MIDDLE,
        };
        const nutButton = buttonMap[data.button];
        
        // 执行点击
        if (data.action === 'down') {
            await mouse.pressButton(nutButton);
        } else {
            await mouse.releaseButton(nutButton);
        }
        
        console.log(`[远程控制] ${data.button} ${data.action} 在 (${absX}, ${absY})`);
        return { success: true };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[远程控制] 鼠标点击失败:', errorMessage);
        return { success: false, error: errorMessage };
    }
});

// 执行远程键盘输入
ipcMain.handle('remote-keyboard', async (_event, data: { 
    user: string; 
    key: string; 
    action: 'press' | 'release';
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
}) => {
    if (!remoteControlPermissions.get(data.user)) {
        return { success: false, error: 'Permission denied' };
    }
    
    try {
        // 键盘映射
        const keyMap: Record<string, Key> = {
            'Enter': Key.Enter,
            'Backspace': Key.Backspace,
            'Tab': Key.Tab,
            'Escape': Key.Escape,
            'Delete': Key.Delete,
            'Home': Key.Home,
            'End': Key.End,
            'PageUp': Key.PageUp,
            'PageDown': Key.PageDown,
            'ArrowUp': Key.Up,
            'ArrowDown': Key.Down,
            'ArrowLeft': Key.Left,
            'ArrowRight': Key.Right,
            'Space': Key.Space,
            ' ': Key.Space,
            'Control': Key.LeftControl,
            'Shift': Key.LeftShift,
            'Alt': Key.LeftAlt,
            'Meta': Key.LeftSuper,
        };
        
        // 获取按键
        let nutKey: Key | string;
        if (keyMap[data.key]) {
            nutKey = keyMap[data.key];
        } else if (data.key.length === 1) {
            // 单个字符直接使用
            nutKey = data.key;
        } else {
            console.warn(`[远程控制] 不支持的按键: ${data.key}`);
            return { success: false, error: 'Unsupported key' };
        }
        
        // 执行按键
        if (data.action === 'press') {
            await keyboard.pressKey(nutKey as Key);
        } else {
            await keyboard.releaseKey(nutKey as Key);
        }
        
        console.log(`[远程控制] 键盘 ${data.action}: ${data.key}`);
        return { success: true };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[远程控制] 键盘操作失败:', errorMessage);
        return { success: false, error: errorMessage };
    }
});

function createWindow() {
    // 图标路径：Windows 建议使用 .ico 格式
    const iconPath = isDev
        ? path.join(rootPath, 'public/video.ico')
        : path.join(__dirname, '../dist/video.ico');

    console.log('Electron 环境:', isDev ? '开发环境' : '生产环境');
    console.log('rootPath:', rootPath);
    console.log('__dirname:', __dirname);
    console.log('图标路径:', iconPath);
    console.log('图标文件是否存在:', existsSync(iconPath));

    mainWindow = new BrowserWindow({
        title: "WebRTC Video",
        icon: iconPath,
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true, // 允许渲染进程使用 Node API
            contextIsolation: false,
            webSecurity: false // 开发 WebRTC 本地文件权限用
        },
    });

    Menu.setApplicationMenu(null);
    
    // 允许屏幕共享权限
    mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
        if (permission === 'media') {
            callback(true);
        } else {
            callback(false);
        }
    });

    // 开发环境加载 localhost，生产环境加载 build 文件夹
    const url = isDev
        ? 'http://localhost:5173'
        : `file://${path.join(__dirname, '../build/index.html')}`;

    mainWindow.loadURL(url);

    // 关闭时清空
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}


// 启动 Electron
app.whenReady().then(createWindow);

// Mac 窗口行为
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// 关闭所有窗口退出
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});