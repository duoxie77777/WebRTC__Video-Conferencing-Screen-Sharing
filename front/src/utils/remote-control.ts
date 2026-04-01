/**
 * 远程屏幕控制工具
 * 捕获本地鼠标/键盘事件并发送到远端
 * 
 * 平台支持:
 * - Web端: 可作为控制端(发送控制指令) ✅
 * - 客户端: 可作为控制端和被控制端 ✅
 */

// 声明 Electron 类型
declare global {
  interface Window {
    electron?: {
      ipcRenderer: {
        invoke: (channel: string, data?: any) => Promise<any>
      }
    }
  }
  
  // 声明 Node.js require (用于 nodeIntegration 模式)
  const require: any
  const process: any
}

// 平台检测
// 检测方式1: 使用 preload 暴露的 electron 对象
// 检测方式2: 使用 process.versions.electron (nodeIntegration: true 模式)
export const isElectron = (
  (typeof window !== 'undefined' && 'electron' in window) ||
  (typeof process !== 'undefined' && process.versions && 'electron' in process.versions)
)
export const canBeControlled = isElectron // 只有客户端可以被控制
export const canControl = true // 任何平台都可以作为控制端

export interface RemoteControlEvent {
  type: 'mouse-move' | 'mouse-click' | 'mouse-wheel' | 'keyboard'
  [key: string]: any
}

export class RemoteControlManager {
  private videoElement: HTMLVideoElement | null = null
  private isControlling = false
  private isPaused = false // 按住 Ctrl 键时暂停控制
  private onEventCallback: ((event: RemoteControlEvent) => void) | null = null
  private onStopCallback: (() => void) | null = null // ESC 键停止控制的回调

  /**
   * 开始控制远端屏幕
   * @param videoElement 显示远端屏幕的 video 元素
   * @param onEvent 事件回调函数
   * @param onStop ESC 键停止控制的回调函数
   */
  startControl(
    videoElement: HTMLVideoElement, 
    onEvent: (event: RemoteControlEvent) => void,
    onStop?: () => void
  ) {
    this.videoElement = videoElement
    this.onEventCallback = onEvent
    this.onStopCallback = onStop || null
    this.isControlling = true
    this.isPaused = false

    // 绑定事件监听
    this._bindEvents()

    console.log('[远程控制] 已启动控制 (按住 Ctrl 暂停，按 ESC 停止)')
  }

  /** 停止控制 */
  stopControl() {
    this.isControlling = false
    this.isPaused = false
    this._unbindEvents()
    this.videoElement = null
    this.onEventCallback = null
    this.onStopCallback = null

    console.log('[远程控制] 已停止控制')
  }

  // ======================== 事件处理 ========================

  private _bindEvents() {
    if (!this.videoElement) return

    this.videoElement.addEventListener('mousemove', this._handleMouseMove)
    this.videoElement.addEventListener('mousedown', this._handleMouseDown)
    this.videoElement.addEventListener('mouseup', this._handleMouseUp)
    this.videoElement.addEventListener('wheel', this._handleWheel)
    this.videoElement.addEventListener('contextmenu', this._handleContextMenu)
    
    // 键盘事件需要绑定到 document
    document.addEventListener('keydown', this._handleKeyDown)
    document.addEventListener('keyup', this._handleKeyUp)

    // 阻止默认右键菜单
    this.videoElement.style.cursor = 'crosshair'
  }

  private _unbindEvents() {
    if (!this.videoElement) return

    this.videoElement.removeEventListener('mousemove', this._handleMouseMove)
    this.videoElement.removeEventListener('mousedown', this._handleMouseDown)
    this.videoElement.removeEventListener('mouseup', this._handleMouseUp)
    this.videoElement.removeEventListener('wheel', this._handleWheel)
    this.videoElement.removeEventListener('contextmenu', this._handleContextMenu)
    
    document.removeEventListener('keydown', this._handleKeyDown)
    document.removeEventListener('keyup', this._handleKeyUp)

    if (this.videoElement) {
      this.videoElement.style.cursor = ''
    }
  }

  private _handleMouseMove = (e: MouseEvent) => {
    if (!this.isControlling || !this.videoElement) return
    
    // 按住 Ctrl 键时暂停控制
    if (e.ctrlKey || e.metaKey) {
      if (!this.isPaused) {
        this.isPaused = true
        if (this.videoElement) {
          this.videoElement.style.cursor = 'not-allowed'
          this.videoElement.style.opacity = '0.7'
        }
        console.log('[远程控制] 已暂停 (松开 Ctrl 继续)')
      }
      return
    } else if (this.isPaused) {
      this.isPaused = false
      if (this.videoElement) {
        this.videoElement.style.cursor = 'crosshair'
        this.videoElement.style.opacity = '1'
      }
      console.log('[远程控制] 已恢复')
    }

    const rect = this.videoElement.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // 转换为相对坐标（0-1）
    const relativeX = x / rect.width
    const relativeY = y / rect.height

    this.onEventCallback?.({
      type: 'mouse-move',
      x: relativeX,
      y: relativeY,
      screenWidth: rect.width,
      screenHeight: rect.height,
    })
  }

  private _handleMouseDown = (e: MouseEvent) => {
    if (!this.isControlling || !this.videoElement) return
    e.preventDefault()

    const rect = this.videoElement.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    this.onEventCallback?.({
      type: 'mouse-click',
      button: e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle',
      action: 'down',
      x,
      y,
    })
  }

  private _handleMouseUp = (e: MouseEvent) => {
    if (!this.isControlling || !this.videoElement) return
    e.preventDefault()

    const rect = this.videoElement.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    this.onEventCallback?.({
      type: 'mouse-click',
      button: e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle',
      action: 'up',
      x,
      y,
    })
  }

  private _handleWheel = (e: WheelEvent) => {
    if (!this.isControlling) return
    e.preventDefault()

    this.onEventCallback?.({
      type: 'mouse-wheel',
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaZ: e.deltaZ,
    })
  }

  private _handleContextMenu = (e: MouseEvent) => {
    if (this.isControlling) {
      e.preventDefault()
    }
  }

  private _handleKeyDown = (e: KeyboardEvent) => {
    if (!this.isControlling) return

    // ESC 键停止控制
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      console.log('[远程控制] 按 ESC 停止控制')
      this.onStopCallback?.()
      return
    }

    // Ctrl 键用于暂停控制，不发送到远端
    if (e.key === 'Control' || e.key === 'Meta') {
      return
    }

    // 阻止某些快捷键（如 F5 刷新）
    if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
      e.preventDefault()
    }

    this.onEventCallback?.({
      type: 'keyboard',
      action: 'press',
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    })
  }

  private _handleKeyUp = (e: KeyboardEvent) => {
    if (!this.isControlling) return

    this.onEventCallback?.({
      type: 'keyboard',
      action: 'release',
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    })
  }
}

/**
 * 远程控制事件执行器（被控制端）
 * 接收远程事件并在本地执行
 * 
 * 注意: Web端无法执行控制事件(浏览器安全限制),仅客户端支持
 */
export class RemoteControlExecutor {
  /**
   * 执行远程控制事件
   */
  async executeEvent(event: RemoteControlEvent, fromUser: string): Promise<boolean> {
    if (!isElectron) {
      console.warn('[远程控制] Web端不支持被控制功能,需要使用客户端')
      return false
    }

    // 获取 ipcRenderer（支持两种模式）
    let ipcRenderer: any
    if (window.electron) {
      // preload 模式
      ipcRenderer = window.electron.ipcRenderer
    } else {
      // nodeIntegration 模式
      const { ipcRenderer: renderer } = require('electron')
      ipcRenderer = renderer
    }

    try {
      switch (event.type) {
        case 'mouse-move':
          const moveResult = await ipcRenderer.invoke('remote-mouse-move', {
            user: fromUser,
            x: event.x,
            y: event.y,
            screenWidth: event.screenWidth,
            screenHeight: event.screenHeight,
          })
          return moveResult.success

        case 'mouse-click':
          const clickResult = await ipcRenderer.invoke('remote-mouse-click', {
            user: fromUser,
            button: event.button,
            action: event.action,
            x: event.x,
            y: event.y,
          })
          return clickResult.success

        case 'keyboard':
          const keyResult = await ipcRenderer.invoke('remote-keyboard', {
            user: fromUser,
            key: event.key,
            action: event.action,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
          })
          return keyResult.success

        default:
          console.warn('[远程控制] 未知事件类型:', event.type)
          return false
      }
    } catch (error) {
      console.error('[远程控制] 执行事件失败:', error)
      return false
    }
  }

  /**
   * 请求远程控制权限
   */
  async requestPermission(fromUser: string): Promise<boolean> {
    if (!isElectron) {
      console.warn('[远程控制] Web端不支持被控制功能')
      return false
    }

    // 获取 ipcRenderer（支持两种模式）
    let ipcRenderer: any
    if (window.electron) {
      ipcRenderer = window.electron.ipcRenderer
    } else {
      const { ipcRenderer: renderer } = require('electron')
      ipcRenderer = renderer
    }

    try {
      const result = await ipcRenderer.invoke('request-remote-control', {
        fromUser,
      })
      return result.allowed
    } catch (error) {
      console.error('[远程控制] 请求权限失败:', error)
      return false
    }
  }

  /**
   * 设置用户控制权限
   */
  async setPermission(user: string, allowed: boolean): Promise<void> {
    if (!isElectron) {
      console.warn('[远程控制] Web端不支持被控制功能')
      return
    }

    // 获取 ipcRenderer（支持两种模式）
    let ipcRenderer: any
    if (window.electron) {
      ipcRenderer = window.electron.ipcRenderer
    } else {
      const { ipcRenderer: renderer } = require('electron')
      ipcRenderer = renderer
    }

    try {
      await ipcRenderer.invoke('set-remote-control-permission', {
        user,
        allowed,
      })
    } catch (error) {
      console.error('[远程控制] 设置权限失败:', error)
    }
  }
}
