import { app, BrowserWindow, Menu, ipcMain, desktopCapturer } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import isDev from 'electron-is-dev';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow = null;
// 获取项目根目录（electron 目录的父目录）
const rootPath = isDev ? path.join(__dirname, '..') : app.getAppPath();
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
    }
    catch (error) {
        console.error('获取桌面源失败:', error);
        return [];
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
        }
        else {
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
    if (BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
// 关闭所有窗口退出
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
});
