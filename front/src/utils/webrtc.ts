import { getSocket } from './socket'
import { getDisplayMediaCompat } from './electron-screen-share'

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:16.163.147.228:3478?transport=udp',
      username: 'testuser',
      credential: 'testpass123'
    },
    {
      urls: 'turn:16.163.147.228:3478?transport=tcp',
      username: 'testuser',
      credential: 'testpass123'
    }
  ],
  iceTransportPolicy: 'all'
}

/** 创建静默流（黑屏视频 + 无声音频） */
function createSilentStream(): MediaStream {
  const stream = new MediaStream()
  const canvas = Object.assign(document.createElement('canvas'), { width: 640, height: 480 })
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, 640, 480)
  const videoTrack = canvas.captureStream(1).getVideoTracks()[0]
  videoTrack.enabled = false
  stream.addTrack(videoTrack)

  const audioCtx = new AudioContext()
  const oscillator = audioCtx.createOscillator()
  const dst = audioCtx.createMediaStreamDestination()
  oscillator.connect(dst)
  oscillator.start()
  const audioTrack = dst.stream.getAudioTracks()[0]
  audioTrack.enabled = false
  stream.addTrack(audioTrack)

  return stream
}

/** 每个远端用户对应的 Peer 连接信息 */
export interface PeerInfo {
  pc: RTCPeerConnection
  screenPc: RTCPeerConnection | null
  dataChannel: RTCDataChannel | null  // 数据通道（用于远程控制）
}

/**
 * Mesh 多人 WebRTC 管理器
 * 与房间内每个人各建一条 PeerConnection
 */
export class MeshRTCManager {
  private currentUser: string
  private localStream: MediaStream | null = null
  screenStream: MediaStream | null = null
  private peers: Map<string, PeerInfo> = new Map()

  // 外部回调
  onRemoteStream: ((user: string, stream: MediaStream) => void) | null = null
  onRemoteScreenStream: ((user: string, stream: MediaStream) => void) | null = null
  onPeerLeft: ((user: string) => void) | null = null
  onScreenShareStopped: (() => void) | null = null
  onRemoteControlRequest: ((user: string) => Promise<boolean>) | null = null  // 远程控制请求
  onRemoteControlEvent: ((user: string, event: any) => void) | null = null  // 远程控制事件

  constructor(currentUser: string) {
    this.currentUser = currentUser
    this._bindSocketEvents()
  }

  private _getOrCreateLocalStream(): MediaStream {
    if (!this.localStream) {
      this.localStream = createSilentStream()
    }
    return this.localStream
  }

  /** 获取本地流（外部用于预览自己的画面） */
  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  // ======================== 与新用户建立连接（发起方） ========================
  async callUser(targetUser: string) {
    const stream = this._getOrCreateLocalStream()
    const pc = this._createPC(targetUser, 'call')

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream)
    })

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    getSocket().emit('call', {
      from: this.currentUser,
      to: targetUser,
      offer,
    })

    // 如果当前正在共享屏幕，也向新用户发送屏幕流
    if (this.screenStream) {
      await this.sendScreenStreamToUser(targetUser, this.screenStream)
    }
  }

  /** 重新协商所有 PeerConnection，确保视频轨道更新 */
  async reNegotiateAllPeers() {
    for (const [user, info] of this.peers) {
      try {
        const offer = await info.pc.createOffer()
        await info.pc.setLocalDescription(offer)
        
        getSocket().emit('call', {
          from: this.currentUser,
          to: user,
          offer,
        })
      } catch (error) {
        console.error(`与 ${user} 重新协商失败:`, error)
      }
    }
  }

  // ======================== 接听来电（被动方） ========================
  async answerCall(from: string, offer: RTCSessionDescriptionInit) {
    const stream = this._getOrCreateLocalStream()

    // 检查是否已有连接（重新协商场景）
    let pc: RTCPeerConnection
    const existingInfo = this.peers.get(from)

    if (existingInfo) {
      // 重新协商：使用已有的 PeerConnection
      console.log('[WebRTC] 检测到重新协商，使用已有连接')
      pc = existingInfo.pc
      
      // 确保本地流的轨道都已添加（即使是静默流）
      const senders = pc.getSenders()
      const existingKinds = senders.map(s => s.track?.kind).filter(Boolean)
      
      stream.getTracks().forEach((track) => {
        if (!existingKinds.includes(track.kind)) {
          console.log(`[WebRTC] 重新协商时添加新 ${track.kind} 轨道`)
          pc.addTrack(track, stream)
        }
      })
    } else {
      // 新连接：创建新的 PeerConnection
      console.log('[WebRTC] 创建新的 PeerConnection')
      pc = this._createPC(from, 'call')

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
      })
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    getSocket().emit('answer', {
      from: this.currentUser,
      to: from,
      answer,
    })

    // 重新协商完成后，检查对方的流并手动触发回调
    // 因为 ontrack 事件在重新协商时不会再次触发
    if (existingInfo) {
      console.log('[WebRTC] 重新协商场景，准备手动触发 onRemoteStream')
      setTimeout(() => {
        const receivers = pc.getReceivers()
        console.log('[WebRTC] receivers 数量:', receivers.length)
        receivers.forEach(r => {
          console.log('[WebRTC] receiver track:', r.track?.kind, r.track?.enabled, r.track?.muted)
        })
        const tracks = receivers.map(r => r.track).filter(Boolean) as MediaStreamTrack[]
        
        if (tracks.length > 0) {
          console.log(`[WebRTC] 重新协商后手动触发 onRemoteStream，轨道数: ${tracks.length}`)
          const remoteStream = new MediaStream(tracks)
          this.onRemoteStream?.(from, remoteStream)
        }
      }, 1000) // 增加延迟，确保轨道已经同步
    }
  }

  // ======================== 离开（挂断所有人） ========================
  hangupAll() {
    const socket = getSocket()
    for (const [user, info] of this.peers) {
      socket.emit('hangup', { from: this.currentUser, to: user })
      info.pc.close()
      info.screenPc?.close()
    }
    this.peers.clear()
    this.localStream?.getTracks().forEach((t) => t.stop())
    this.localStream = null
  }

  /** 移除单个 peer（对方离开） */
  removePeer(user: string) {
    const info = this.peers.get(user)
    if (info) {
      info.pc.close()
      info.screenPc?.close()
      this.peers.delete(user)
    }
    this.onPeerLeft?.(user)
  }

  // ======================== 屏幕共享（向所有 peer 发起） ========================

  /** 共享区域参数 */
  private cropCanvas: HTMLCanvasElement | null = null
  private cropAnimationId: number | null = null
  private sourceVideo: HTMLVideoElement | null = null

  async startScreenShare(targetUsers: string[]): Promise<MediaStream> {
    // 使用兼容性包装，自动适配客户端和浏览器环境
    this.screenStream = await getDisplayMediaCompat({
      video: true,
      audio: true,
    })

    this.screenStream.getVideoTracks()[0].onended = () => {
      this.stopScreenShare(targetUsers)
    }

    await this._sendScreenStream(targetUsers, this.screenStream)
    return this.screenStream
  }

  /** 区域共享：先获取屏幕流，然后用 Canvas 裁剪指定区域 */
  async startRegionShare(
    targetUsers: string[],
    region: { x: number; y: number; width: number; height: number }
  ): Promise<MediaStream> {
    // 获取整个屏幕（使用兼容性包装）
    const fullStream = await getDisplayMediaCompat({
      video: { displaySurface: 'monitor' } as MediaTrackConstraints,
      audio: false,
    })

    fullStream.getVideoTracks()[0].onended = () => {
      this.stopScreenShare(targetUsers)
    }

    // 用隐藏 video 播放源流
    this.sourceVideo = document.createElement('video')
    this.sourceVideo.srcObject = fullStream
    this.sourceVideo.muted = true
    this.sourceVideo.play()

    // Canvas 裁剪
    this.cropCanvas = document.createElement('canvas')
    this.cropCanvas.width = region.width
    this.cropCanvas.height = region.height
    const ctx = this.cropCanvas.getContext('2d')!

    // 持续裁剪绘制
    const draw = () => {
      if (!this.sourceVideo || !this.cropCanvas) return
      ctx.drawImage(
        this.sourceVideo,
        region.x, region.y, region.width, region.height,
        0, 0, region.width, region.height
      )
      this.cropAnimationId = requestAnimationFrame(draw)
    }
    draw()

    // 从 Canvas 获取裁剪后的流
    this.screenStream = this.cropCanvas.captureStream(30)

    // 保存源流用于停止时清理
    this._fullScreenStream = fullStream

    await this._sendScreenStream(targetUsers, this.screenStream)
    return this.screenStream
  }

  /** 更新裁剪区域（拖拽/调整大小时实时调用） */
  updateCropRegion(region: { x: number; y: number; width: number; height: number }) {
    if (!this.cropCanvas || !this.sourceVideo) return

    this.cropCanvas.width = region.width
    this.cropCanvas.height = region.height
    const ctx = this.cropCanvas.getContext('2d')!

    // 停掉旧的绘制循环，重新开始
    if (this.cropAnimationId) cancelAnimationFrame(this.cropAnimationId)

    const draw = () => {
      if (!this.sourceVideo || !this.cropCanvas) return
      ctx.drawImage(
        this.sourceVideo,
        region.x, region.y, region.width, region.height,
        0, 0, region.width, region.height
      )
      this.cropAnimationId = requestAnimationFrame(draw)
    }
    draw()
  }

  private _fullScreenStream: MediaStream | null = null

  /** 内部：发送屏幕流给所有 peers */
  private async _sendScreenStream(targetUsers: string[], stream: MediaStream) {
    for (const user of targetUsers) {
      await this.sendScreenStreamToUser(user, stream)
    }
  }

  /** 向单个用户发送屏幕流（可外部调用） */
  async sendScreenStreamToUser(user: string, stream: MediaStream) {
    const screenPc = this._createPC(user, 'screen')
    const info = this.peers.get(user)
    if (info) info.screenPc = screenPc

    stream.getTracks().forEach((track) => {
      screenPc.addTrack(track, stream)
    })

    const offer = await screenPc.createOffer()
    await screenPc.setLocalDescription(offer)

    getSocket().emit('start-screen-share', {
      from: this.currentUser,
      to: user,
      offer,
    })
  }

  stopScreenShare(targetUsers: string[]) {
    const socket = getSocket()
    for (const user of targetUsers) {
      socket.emit('stop-screen-share', { from: this.currentUser, to: user })
      const info = this.peers.get(user)
      if (info?.screenPc) {
        info.screenPc.close()
        info.screenPc = null
      }
    }
    // 清理区域共享资源
    if (this.cropAnimationId) {
      cancelAnimationFrame(this.cropAnimationId)
      this.cropAnimationId = null
    }
    this.cropCanvas = null
    if (this.sourceVideo) {
      this.sourceVideo.srcObject = null
      this.sourceVideo = null
    }
    this._fullScreenStream?.getTracks().forEach((t) => t.stop())
    this._fullScreenStream = null

    this.screenStream?.getTracks().forEach((t) => t.stop())
    this.screenStream = null
    this.onScreenShareStopped?.()
  }

  // ======================== 媒体控制 ========================
  async toggleCamera(enabled: boolean) {
    if (!this.localStream) {
      this._getOrCreateLocalStream()
    }
    if (enabled) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true })
        const newTrack = camStream.getVideoTracks()[0]
        newTrack.enabled = true
        await this._replaceTrackAll('video', newTrack)
        console.log('[Camera] 摄像头已开启并发送到所有用户')
      } catch (error) {
        console.error('[Camera] 开启摄像头失败:', error)
        throw error
      }
    } else {
      this.localStream?.getVideoTracks().forEach((t) => (t.enabled = false))
      console.log('[Camera] 摄像头已关闭')
    }
  }

  async toggleMic(enabled: boolean) {
    if (!this.localStream) {
      this._getOrCreateLocalStream()
    }
    if (enabled) {
      try {
        console.log('[Mic] 开始获取麦克风...')
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const newTrack = micStream.getAudioTracks()[0]
        newTrack.enabled = true
        console.log('[Mic] 麦克风轨道获取成功，当前 peers 数量:', this.peers.size)
        await this._replaceTrackAll('audio', newTrack)
        console.log('[Mic] 麦克风已开启并发送到所有用户')
      } catch (error) {
        console.error('[Mic] 开启麦克风失败:', error)
        throw error
      }
    } else {
      this.localStream?.getAudioTracks().forEach((t) => (t.enabled = false))
      console.log('[Mic] 麦克风已关闭')
    }
  }

  // ======================== 远程控制功能 ========================

  /** 请求控制远端用户 */
  async requestRemoteControl(targetUser: string): Promise<boolean> {
    const info = this.peers.get(targetUser)
    if (!info) {
      console.error('[远程控制] 未找到目标用户的连接')
      return false
    }

    // 检查 PeerConnection 状态
    if (info.pc.connectionState !== 'connected') {
      console.warn('[远程控制] PeerConnection 未连接，当前状态:', info.pc.connectionState)
      // 等待连接建立
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('PeerConnection 连接超时'))
        }, 8000)

        const checkConnection = () => {
          const state = info.pc.connectionState
          if (state === 'connected') {
            clearTimeout(timeout)
            info.pc.removeEventListener('connectionstatechange', checkConnection)
            console.log('[远程控制] PeerConnection 已连接')
            resolve()
          } else if (state === 'failed' || state === 'closed') {
            clearTimeout(timeout)
            info.pc.removeEventListener('connectionstatechange', checkConnection)
            reject(new Error(`PeerConnection 连接失败: ${state}`))
          }
        }

        info.pc.addEventListener('connectionstatechange', checkConnection)
        checkConnection() // 立即检查一次
      }).catch((err) => {
        console.error('[远程控制] PeerConnection 连接失败:', err)
        return false
      })
    }

    // 创建或获取 DataChannel
    let needsNegotiation = false
    if (!info.dataChannel) {
      console.log('[远程控制] 创建 DataChannel')
      info.dataChannel = info.pc.createDataChannel('remote-control', {
        ordered: true,
      })
      this._setupDataChannel(targetUser, info.dataChannel)
      needsNegotiation = true
    }

    // 如果刚创建了 DataChannel，需要重新协商
    if (needsNegotiation) {
      console.log('[远程控制] DataChannel 已创建，触发重新协商')
      try {
        const offer = await info.pc.createOffer()
        await info.pc.setLocalDescription(offer)

        console.log('[远程控制] 发送新的 offer 到信令服务器（使用 call 事件）')
        // 使用现有的 call 事件机制进行重新协商
        getSocket().emit('call', {
          to: targetUser,
          from: this.currentUser,
          offer: offer,
        })
      } catch (error) {
        console.error('[远程控制] 重新协商失败:', error)
        return false
      }
    }

    // 等待 DataChannel 打开
    if (info.dataChannel.readyState !== 'open') {
      console.log('[远程控制] 等待 DataChannel 打开，当前状态:', info.dataChannel.readyState)

      const opened = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          console.error('[远程控制] DataChannel 打开超时，当前状态:', info.dataChannel?.readyState)
          resolve(false)
        }, 15000) // 增加到15秒，因为需要等待协商完成

        const handleOpen = () => {
          clearTimeout(timeout)
          info.dataChannel?.removeEventListener('open', handleOpen)
          console.log('[远程控制] DataChannel 已打开')
          resolve(true)
        }

        const handleError = (e: Event) => {
          clearTimeout(timeout)
          info.dataChannel?.removeEventListener('error', handleError)
          console.error('[远程控制] DataChannel 错误:', e)
          resolve(false)
        }

        if (info.dataChannel!.readyState === 'open') {
          clearTimeout(timeout)
          resolve(true)
        } else {
          info.dataChannel!.addEventListener('open', handleOpen)
          info.dataChannel!.addEventListener('error', handleError)
        }
      })

      if (!opened) {
        console.error('[远程控制] DataChannel 未能在规定时间内打开')
        return false
      }
    }

    console.log('[远程控制] DataChannel 已就绪，发送控制请求')

    // 发送控制请求
    return new Promise((resolve) => {
      const requestId = `req_${Date.now()}`

      try {
        info.dataChannel!.send(JSON.stringify({
          type: 'control-request',
          from: this.currentUser,
          requestId,
        }))
        console.log('[远程控制] 已发送控制请求')
      } catch (error) {
        console.error('[远程控制] 发送请求失败:', error)
        resolve(false)
        return
      }

      // 监听响应（超时 10 秒）
      const timeout = setTimeout(() => {
        console.warn('[远程控制] 请求响应超时')
        resolve(false)
      }, 10000)

      const handleMessage = (event: MessageEvent) => {
        if (!info.dataChannel) return
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'control-response' && data.requestId === requestId) {
            clearTimeout(timeout)
            info.dataChannel.removeEventListener('message', handleMessage)
            console.log('[远程控制] 收到响应:', data.allowed ? '允许' : '拒绝')
            resolve(data.allowed)
          }
        } catch {
          // 忽略解析错误
        }
      }

      if (info.dataChannel) {
        info.dataChannel.addEventListener('message', handleMessage)
      }
    })
  }

  /** 发送远程控制事件（鼠标/键盘） */
  sendRemoteControlEvent(targetUser: string, event: {
    type: 'mouse-move' | 'mouse-click' | 'mouse-wheel' | 'keyboard'
    [key: string]: string
  }) {
    const info = this.peers.get(targetUser)
    if (!info?.dataChannel || info.dataChannel.readyState !== 'open') {
      console.warn(`[远程控制] DataChannel 未就绪: ${targetUser}`)
      return
    }

    try {
      info.dataChannel.send(JSON.stringify({
        type: 'control-event',
        from: this.currentUser,
        event,
      }))
    } catch (error) {
      console.error('[远程控制] 发送事件失败:', error)
    }
  }

  /** 设置是否允许被远程控制 */
  setRemoteControlAllowed(user: string, allowed: boolean) {
    const info = this.peers.get(user)
    if (!info?.dataChannel) return

    info.dataChannel.send(JSON.stringify({
      type: 'control-permission',
      from: this.currentUser,
      allowed,
    }))
  }

  private _setupDataChannel(remoteUser: string, channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log(`[DataChannel] 已连接到 ${remoteUser}`)
    }

    channel.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)

        // 处理控制请求
        if (data.type === 'control-request') {
          const allowed = await this.onRemoteControlRequest?.(data.from) ?? false
          channel.send(JSON.stringify({
            type: 'control-response',
            requestId: data.requestId,
            allowed,
          }))
        }

        // 处理控制事件
        if (data.type === 'control-event') {
          this.onRemoteControlEvent?.(data.from, data.event)
        }

        // 处理权限变更
        if (data.type === 'control-permission') {
          console.log(`[远程控制] ${data.from} ${data.allowed ? '允许' : '拒绝'} 控制`)
        }
      } catch (error) {
        console.error('[DataChannel] 消息处理失败:', error)
      }
    }

    channel.onerror = (error) => {
      console.error(`[DataChannel] 错误:`, error)
    }

    channel.onclose = () => {
      console.log(`[DataChannel] 已断开与 ${remoteUser}`)
    }
  }

  /** 替换所有 PeerConnection 的轨道 */
  private async _replaceTrackAll(kind: 'audio' | 'video', newTrack: MediaStreamTrack) {
    if (!this.localStream) {
      console.warn('[Media] localStream 不存在，无法替换轨道')
      return
    }

    console.log(`[Media] 开始替换 ${kind} 轨道，peers 数量:`, this.peers.size)

    const oldTrack = this.localStream.getTracks().find((t) => t.kind === kind)
    if (oldTrack) {
      this.localStream.removeTrack(oldTrack)
      oldTrack.stop()
    }
    this.localStream.addTrack(newTrack)

    // 遍历所有 PeerConnection，替换轨道并重新协商
    for (const [user, info] of this.peers) {
      console.log(`[Media] 处理用户 ${user} 的 ${kind} 轨道`)
      const sender = info.pc.getSenders().find((s) => s.track?.kind === kind)
      
      if (sender) {
        // 使用更温和的方式替换轨道，避免连接断开
        console.log(`[Media] 替换 ${kind} 轨道到 ${user}`)
        await sender.replaceTrack(newTrack)
        console.log(`[Media] ${kind} 轨道替换成功`)
      } else {
        // 如果没有发送器，添加新轨道
        info.pc.addTrack(newTrack, this.localStream)
        console.log(`[Media] 添加新 ${kind} 轨道到 ${user}`)
      }

      // 触发重新协商，确保新轨道被发送到对方
      try {
        const offer = await info.pc.createOffer()
        await info.pc.setLocalDescription(offer)
        
        getSocket().emit('call', {
          from: this.currentUser,
          to: user,
          offer,
        })
        console.log(`[Media] 发送 ${kind} 轨道重新协商到 ${user}`)
      } catch (error) {
        console.error(`[Media] 重新协商失败 ${user}:`, error)
      }
    }
  }

  // ======================== 销毁 ========================
  destroy() {
    this.hangupAll()
    this._unbindSocketEvents()
  }

  // ======================== 内部方法 ========================
  private _createPC(remoteUser: string, type: 'call' | 'screen'): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_SERVERS)

    // 添加 ICE 候选收集调试信息
    let iceCandidatesCount = 0
    let iceCandidates: RTCIceCandidate[] = []

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        iceCandidatesCount++
        iceCandidates.push(e.candidate)
        
        // 详细记录每个 ICE 候选
        console.log(`[ICE ${type}] ${this.currentUser} -> ${remoteUser} 候选 #${iceCandidatesCount}:`, {
          type: e.candidate.type,
          protocol: e.candidate.protocol,
          address: e.candidate.address,
          port: e.candidate.port,
          candidate: e.candidate.candidate
        })

        const event = type === 'call' ? 'ice-candidate' : 'screen-ice-candidate'
        getSocket().emit(event, {
          from: this.currentUser,
          to: remoteUser,
          candidate: e.candidate,
        })
      } else {
        // ICE 收集完成
        console.log(`[ICE ${type}] ${this.currentUser} -> ${remoteUser} ICE 候选收集完成，共 ${iceCandidatesCount} 个候选`)
        console.log(`[ICE ${type}] 候选类型统计:`, {
          host: iceCandidates.filter(c => c.type === 'host').length,
          srflx: iceCandidates.filter(c => c.type === 'srflx').length,
          relay: iceCandidates.filter(c => c.type === 'relay').length
        })
        
        // 检查是否有 relay 候选（TURN 服务器）
        const hasRelay = iceCandidates.some(c => c.type === 'relay')
        if (!hasRelay) {
          console.warn(`[ICE ${type}] ${this.currentUser} -> ${remoteUser} 警告：没有找到 relay 候选，TURN 服务器可能无法连接！`)
        }
      }
    }

    // 监听 ICE 连接状态变化
    pc.oniceconnectionstatechange = () => {
      console.log(`[ICE ${type}] ${this.currentUser} -> ${remoteUser} 连接状态: ${pc.iceConnectionState}`)
      if (pc.iceConnectionState === 'failed') {
        console.error(`[ICE ${type}] ${this.currentUser} -> ${remoteUser} 连接失败！`)
      }
    }

    // 监听连接状态变化
    pc.onconnectionstatechange = () => {
      console.log(`[Connection ${type}] ${this.currentUser} -> ${remoteUser} 状态: ${pc.connectionState}`)
    }

    pc.ontrack = (e) => {
      console.log(`[Track ${type}] ${this.currentUser} <- ${remoteUser} 收到媒体流:`, {
        trackCount: e.streams[0]?.getTracks().length,
        tracks: e.streams[0]?.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          muted: t.muted
        }))
      })
      if (type === 'call') {
        this.onRemoteStream?.(remoteUser, e.streams[0])
      } else {
        this.onRemoteScreenStream?.(remoteUser, e.streams[0])
      }
    }

    // 监听远端创建的 DataChannel
    pc.ondatachannel = (event) => {
      const channel = event.channel
      const info = this.peers.get(remoteUser)
      if (info) {
        info.dataChannel = channel
        this._setupDataChannel(remoteUser, channel)
      }
    }

    if (type === 'call') {
      // 存储 peer 信息
      const existing = this.peers.get(remoteUser)
      if (existing) {
        // 如果已存在，不要替换，保持原有的 PeerConnection
        // 这种情况发生在重新协商时，但我们不应该创建新的 PC
        console.log(`[WebRTC] 已存在 peer 连接，不替换 ${remoteUser}`)
      } else {
        this.peers.set(remoteUser, { pc, screenPc: null, dataChannel: null })
      }
    }

    return pc
  }

  // ======================== Socket 事件 ========================
  private _onCallAnswered = async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
    const info = this.peers.get(data.from)
    if (info) {
      await info.pc.setRemoteDescription(new RTCSessionDescription(data.answer))
    }
  }

  private _onIceCandidate = async (data: { from: string; candidate: RTCIceCandidateInit }) => {
    const info = this.peers.get(data.from)
    if (info) {
      await info.pc.addIceCandidate(new RTCIceCandidate(data.candidate))
    }
  }

  private _onHangup = (data: { from: string }) => {
    this.removePeer(data.from)
  }

  private _onScreenShareOffer = async (data: { from: string; offer: RTCSessionDescriptionInit }) => {
    const screenPc = this._createPC(data.from, 'screen')
    const info = this.peers.get(data.from)
    if (info) info.screenPc = screenPc

    await screenPc.setRemoteDescription(new RTCSessionDescription(data.offer))
    const answer = await screenPc.createAnswer()
    await screenPc.setLocalDescription(answer)

    getSocket().emit('answer-screen-share', {
      from: this.currentUser,
      to: data.from,
      answer,
    })
  }

  private _onScreenShareAnswer = async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
    const info = this.peers.get(data.from)
    if (info?.screenPc) {
      await info.screenPc.setRemoteDescription(new RTCSessionDescription(data.answer))
    }
  }

  private _onScreenIceCandidate = async (data: { from: string; candidate: RTCIceCandidateInit }) => {
    const info = this.peers.get(data.from)
    if (info?.screenPc) {
      await info.screenPc.addIceCandidate(new RTCIceCandidate(data.candidate))
    }
  }

  private _onStopScreenShare = (data: { from: string }) => {
    const info = this.peers.get(data.from)
    if (info?.screenPc) {
      info.screenPc.close()
      info.screenPc = null
    }
  }

  private _onIncomingCall = async (data: { from: string; offer: RTCSessionDescriptionInit }) => {
    console.log('[WebRTC] 收到 incoming-call，来自:', data.from)
    // 自动接听（多人房间内自动建立连接）
    await this.answerCall(data.from, data.offer)
  }

  private _bindSocketEvents() {
    const s = getSocket()
    // 先清理，防止 StrictMode 或重复调用导致事件重复绑定
    this._unbindSocketEvents()
    s.on('incoming-call', this._onIncomingCall)
    s.on('call-answered', this._onCallAnswered)
    s.on('ice-candidate', this._onIceCandidate)
    s.on('hangup', this._onHangup)
    s.on('screen-share-offer', this._onScreenShareOffer)
    s.on('screen-share-answer', this._onScreenShareAnswer)
    s.on('screen-ice-candidate', this._onScreenIceCandidate)
    s.on('stop-screen-share', this._onStopScreenShare)
  }

  private _unbindSocketEvents() {
    const s = getSocket()
    s.off('incoming-call', this._onIncomingCall)
    s.off('call-answered', this._onCallAnswered)
    s.off('ice-candidate', this._onIceCandidate)
    s.off('hangup', this._onHangup)
    s.off('screen-share-offer', this._onScreenShareOffer)
    s.off('screen-share-answer', this._onScreenShareAnswer)
    s.off('screen-ice-candidate', this._onScreenIceCandidate)
    s.off('stop-screen-share', this._onStopScreenShare)
  }
}
