/**
 * 客户端环境下的屏幕共享工具
 */

// 检测是否在客户端环境中
export function isElectron(): boolean {
  return typeof window !== 'undefined' && 
         typeof (window as any).require === 'function'
}

// Electron desktopCapturer 源类型
export interface DesktopSource {
  id: string
  name: string
  thumbnail: string
}

/**
 * 获取客户端的屏幕共享源列表
 */
export async function getDesktopSources(): Promise<DesktopSource[]> {
  if (!isElectron()) {
    console.warn('不在客户端环境中')
    return []
  }

  try {
    // 通过 IPC 与主进程通信
    const { ipcRenderer } = (window as any).require('electron')
    const sources = await ipcRenderer.invoke('get-desktop-sources')
    return sources
  } catch (error) {
    console.error('获取桌面源失败:', error)
    return []
  }
}

/**
 * 在客户端中获取屏幕共享流
 * @param sourceId desktopCapturer 返回的 source id
 */
export async function getElectronDisplayMedia(sourceId?: string): Promise<MediaStream> {
  if (!isElectron()) {
    throw new Error('此方法仅在客户端环境中可用')
  }

  try {
    // 如果没有指定 sourceId，自动选择第一个屏幕
    let finalSourceId = sourceId
    
    if (!finalSourceId) {
      const sources = await getDesktopSources()
      const screenSource = sources.find(s => s.name.includes('Screen') || s.name.includes('屏幕'))
      if (screenSource) {
        finalSourceId = screenSource.id
      } else if (sources.length > 0) {
        finalSourceId = sources[0].id
      } else {
        throw new Error('没有可用的屏幕源')
      }
    }

    // 使用 getUserMedia 并指定 chromeMediaSourceId
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-ignore - Electron 特有属性
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: finalSourceId,
        }
      } as any
    })

    return stream
  } catch (error) {
    console.error('获取客户端屏幕流失败:', error)
    throw error
  }
}

/**
 * 兼容性包装：自动判断环境并获取屏幕共享流
 */
export async function getDisplayMediaCompat(options?: DisplayMediaStreamOptions): Promise<MediaStream> {
  if (isElectron()) {
    // 客户端环境：使用 desktopCapturer
    return getElectronDisplayMedia()
  } else {
    // 浏览器环境：使用标准 API
    return navigator.mediaDevices.getDisplayMedia(options || { video: true, audio: true })
  }
}
