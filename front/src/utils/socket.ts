import { io, Socket } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || 'https://16.163.147.228:8989'

// 全局唯一 socket 实例，永不销毁，只断开/重连
let socket: Socket | null = null

/** 获取 socket 单例（全局唯一，不会重建） */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket'], // 强制 WebSocket，禁止轮询
      path: '/socket.io'         // 明确路径
    })
  }
  return socket
}

/** 连接并登录 */
export function connectAndLogin(username: string) {
  const s = getSocket()
  if (!s.connected) {
    s.connect()
  }
  if (s.connected) {
    s.emit('login', username)
  } else {
    s.once('connect', () => {
      s.emit('login', username)
    })
  }
}

/** 断开连接（不销毁实例，保证事件能被正确 off） */
export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
  }
}
