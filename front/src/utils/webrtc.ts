import { getSocket } from './socket'
import { getDisplayMediaCompat } from './electron-screen-share'

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
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

  // ======================== 接听来电（被动方） ========================
  async answerCall(from: string, offer: RTCSessionDescriptionInit) {
    const stream = this._getOrCreateLocalStream()
    const pc = this._createPC(from, 'call')

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream)
    })

    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    getSocket().emit('answer', {
      from: this.currentUser,
      to: from,
      answer,
    })
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
    // 使用兼容性包装，自动适配 Electron 和浏览器环境
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
    if (!this.localStream) return
    if (enabled) {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true })
      const newTrack = camStream.getVideoTracks()[0]
      this._replaceTrackAll('video', newTrack)
      newTrack.enabled = true
    } else {
      this.localStream.getVideoTracks().forEach((t) => (t.enabled = false))
    }
  }

  async toggleMic(enabled: boolean) {
    if (!this.localStream) return
    if (enabled) {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const newTrack = micStream.getAudioTracks()[0]
      this._replaceTrackAll('audio', newTrack)
      newTrack.enabled = true
    } else {
      this.localStream.getAudioTracks().forEach((t) => (t.enabled = false))
    }
  }

  /** 替换所有 PeerConnection 的轨道 */
  private _replaceTrackAll(kind: 'audio' | 'video', newTrack: MediaStreamTrack) {
    if (!this.localStream) return

    const oldTrack = this.localStream.getTracks().find((t) => t.kind === kind)
    if (oldTrack) {
      this.localStream.removeTrack(oldTrack)
      oldTrack.stop()
    }
    this.localStream.addTrack(newTrack)

    for (const [, info] of this.peers) {
      const sender = info.pc.getSenders().find((s) => s.track?.kind === kind || (!s.track && kind === 'video'))
      sender?.replaceTrack(newTrack)
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

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const event = type === 'call' ? 'ice-candidate' : 'screen-ice-candidate'
        getSocket().emit(event, {
          from: this.currentUser,
          to: remoteUser,
          candidate: e.candidate,
        })
      }
    }

    pc.ontrack = (e) => {
      if (type === 'call') {
        this.onRemoteStream?.(remoteUser, e.streams[0])
      } else {
        this.onRemoteScreenStream?.(remoteUser, e.streams[0])
      }
    }

    if (type === 'call') {
      // 存储 peer 信息
      const existing = this.peers.get(remoteUser)
      if (existing) {
        existing.pc = pc
      } else {
        this.peers.set(remoteUser, { pc, screenPc: null })
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
