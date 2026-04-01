import { useState, useEffect, useRef, useCallback } from 'react'
import { Modal, message } from 'antd'
import { PhoneOutlined } from '@ant-design/icons'
import UserSidebar from './components/UserSidebar'
import MeetingContent from './components/MeetingContent'
import RegionPicker from './components/RegionPicker'
import Login from '../login'
import { connectAndLogin, disconnectSocket, getSocket } from '../../utils/socket'
import { MeshRTCManager } from '../../utils/webrtc'
import { RemoteControlManager, RemoteControlExecutor, canBeControlled } from '../../utils/remote-control'
import type { Participant } from '../../types/participant'

const MeetingRoom = () => {
    const [username, setUsername] = useState<string | null>(
        localStorage.getItem('username')
    )

    // 房间状态
    const [roomId, setRoomId] = useState<string | null>(null)
    const [inRoom, setInRoom] = useState(false)

    // 参与者 Map（不含自己）
    const [participants, setParticipants] = useState<Map<string, Participant>>(new Map())

    // 自己的媒体状态
    const [isCameraOn, setIsCameraOn] = useState(false)
    const [isMicOn, setIsMicOn] = useState(false)
    const [isSharing, setIsSharing] = useState(false)
    const [localStream, setLocalStream] = useState<MediaStream | null>(null)

    // 当前谁在共享屏幕
    const [screenSharer, setScreenSharer] = useState<string | null>(null)
    
    // 远程控制状态
    const [controllingUser, setControllingUser] = useState<string | null>(null)  // 正在控制的用户
    const [sidebarVisible, setSidebarVisible] = useState(true)  // 侧边栏可见性
    const remoteControlManagerRef = useRef<RemoteControlManager>(new RemoteControlManager())
    const remoteControlExecutorRef = useRef<RemoteControlExecutor>(new RemoteControlExecutor())

    const rtcRef = useRef<MeshRTCManager | null>(null)

    // 自动连接 socket
    useEffect(() => {
        if (username) {
            connectAndLogin(username)
        }
    }, [username])

    const addParticipant = useCallback((user: string) => {
        setParticipants((prev) => {
            if (prev.has(user)) return prev
            const next = new Map(prev)
            next.set(user, { name: user, stream: null, screenStream: null, cameraOn: false, micOn: false, sharing: false })
            return next
        })
    }, [])

    // ======================== 房间操作 ========================
    const joinRoom = useCallback((rid: string) => {
        if (!username) return
        const socket = getSocket()
        socket.emit('join-room', { username, roomId: rid })
        setRoomId(rid)
        setInRoom(true)
    }, [username])

    const leaveRoom = useCallback(() => {
        if (!username) return
        const socket = getSocket()
        socket.emit('leave-room', { username })
        rtcRef.current?.hangupAll()
        setRoomId(null)
        setInRoom(false)
        setParticipants(new Map())
        setIsCameraOn(false)
        setIsMicOn(false)
        setIsSharing(false)
        setLocalStream(null)
        setScreenSharer(null)
    }, [username])

    // ======================== 初始化 MeshRTCManager ========================
    useEffect(() => {
        if (!username) return

        const manager = new MeshRTCManager(username)

        manager.onRemoteStream = (user, stream) => {
            setParticipants((prev) => {
                const next = new Map(prev)
                const p = next.get(user) || { name: user, stream: null, screenStream: null, cameraOn: false, micOn: false, sharing: false }
                p.stream = stream
                next.set(user, p)
                return next
            })
        }

        manager.onRemoteScreenStream = (user, stream) => {
            setParticipants((prev) => {
                const next = new Map(prev)
                const p = next.get(user) || { name: user, stream: null, screenStream: null, cameraOn: false, micOn: false, sharing: false }
                p.screenStream = stream
                next.set(user, p)
                return next
            })
            setScreenSharer(user)
        }

        manager.onPeerLeft = (user) => {
            setParticipants((prev) => {
                const next = new Map(prev)
                next.delete(user)
                return next
            })
            setScreenSharer((prev) => (prev === user ? null : prev))
        }

        manager.onScreenShareStopped = () => {
            setIsSharing(false)
            setScreenSharer(null)
        }

        // 远程控制请求回调
        manager.onRemoteControlRequest = async (user) => {
            // 平台检测:只有客户端可以被控制
            if (!canBeControlled) {
                message.warning('Web网页端不支持被控制功能,请使用客户端')
                return false
            }

            return new Promise((resolve) => {
                Modal.confirm({
                    title: '远程控制请求',
                    content: `${user} 想要控制你的屏幕,是否允许?`,
                    okText: '允许',
                    cancelText: '拒绝',
                    onOk: async () => {
                        message.success(`已允许 ${user} 控制`)
                        // 设置权限
                        await remoteControlExecutorRef.current.setPermission(user, true)
                        resolve(true)
                    },
                    onCancel: () => {
                        message.info(`已拒绝 ${user} 的控制请求`)
                        resolve(false)
                    },
                })
            })
        }

        // 远程控制事件回调（被控制端）
        manager.onRemoteControlEvent = async (user, event) => {
            await remoteControlExecutorRef.current.executeEvent(event, user)
        }

        rtcRef.current = manager

        return () => {
            manager.destroy()
            rtcRef.current = null
        }
    }, [username])

    // ======================== 监听房间事件 ========================
    useEffect(() => {
        if (!username) return
        const socket = getSocket()

        // 收到房间成员列表（自己加入后）
        const onRoomMembers = (data: { roomId: string; members: string[] }) => {
            // 房间里已有的其他成员 → 主动和他们建立连接
            const others = data.members.filter((m) => m !== username)
            for (const user of others) {
                addParticipant(user)
                rtcRef.current?.callUser(user)
            }
        }

        // 有新用户加入房间（不需要主动 call，对方会 call 我们）
        const onUserJoined = (data: { username: string }) => {
            addParticipant(data.username)
            message.info(`${data.username} 加入了会议`)
            
            // 如果当前正在共享屏幕，向新用户发送屏幕流
            if (isSharing && rtcRef.current?.screenStream) {
                // 等待新用户建立基础连接后再发送屏幕流
                setTimeout(async () => {
                    try {
                        const stream = rtcRef.current?.screenStream
                        if (stream) {
                            await rtcRef.current?.sendScreenStreamToUser(data.username, stream)
                            console.log(`已向新用户 ${data.username} 发送屏幕流`)
                        }
                    } catch (err) {
                        console.error('向新用户发送屏幕流失败:', err)
                    }
                }, 1500)
            }
        }

        // 有用户离开房间
        const onUserLeft = (data: { username: string }) => {
            rtcRef.current?.removePeer(data.username)
            message.info(`${data.username} 离开了会议`)
        }

        // 收到邀请
        const onInvite = (data: { from: string; roomId: string }) => {
            Modal.confirm({
                title: '会议邀请',
                content: `${data.from} 邀请你加入会议，是否加入？`,
                okText: '加入',
                cancelText: '拒绝',
                icon: <PhoneOutlined style={{ color: '#52c41a' }} />,
                onOk: () => {
                    joinRoom(data.roomId)
                },
            })
        }

        // 媒体状态同步
        const onMediaStatus = (data: { from: string; camera: boolean; mic: boolean; sharing: boolean }) => {
            setParticipants((prev) => {
                const next = new Map(prev)
                const p = next.get(data.from)
                if (p) {
                    p.cameraOn = data.camera
                    p.micOn = data.mic
                    p.sharing = data.sharing
                    next.set(data.from, { ...p })
                }
                return next
            })
            if (data.sharing) {
                setScreenSharer(data.from)
            } else {
                setScreenSharer((prev) => (prev === data.from ? null : prev))
            }
        }

        // 对方停止屏幕共享
        const onStopScreenShare = (data: { from: string }) => {
            setParticipants((prev) => {
                const next = new Map(prev)
                const p = next.get(data.from)
                if (p) {
                    p.screenStream = null
                    p.sharing = false
                    next.set(data.from, { ...p })
                }
                return next
            })
            setScreenSharer((prev) => (prev === data.from ? null : prev))
        }

        socket.on('room-members', onRoomMembers)
        socket.on('user-joined', onUserJoined)
        socket.on('user-left', onUserLeft)
        socket.on('invite', onInvite)
        socket.on('media-status', onMediaStatus)
        socket.on('stop-screen-share', onStopScreenShare)

        return () => {
            socket.off('room-members', onRoomMembers)
            socket.off('user-joined', onUserJoined)
            socket.off('user-left', onUserLeft)
            socket.off('invite', onInvite)
            socket.off('media-status', onMediaStatus)
            socket.off('stop-screen-share', onStopScreenShare)
        }
    }, [username, addParticipant, joinRoom, isSharing])

    // 邀请用户
    const handleInviteUser = useCallback((target: string) => {
        if (!username || !roomId) return
        const socket = getSocket()
        socket.emit('invite', { from: username, to: target, roomId })
    }, [username, roomId])

    // 创建房间（以自己的名字 + 时间戳为房间 ID）
    const handleCreateRoom = useCallback(() => {
        const rid = `room_${username}_${Date.now()}`
        joinRoom(rid)
        message.success('会议已创建')
    }, [username, joinRoom])

    const handleLeaveRoom = useCallback(() => {
        leaveRoom()
    }, [leaveRoom])

    // ======================== 媒体控制 ========================
    const broadcastMediaStatus = useCallback((camera: boolean, mic: boolean, sharing: boolean) => {
        const socket = getSocket()
        if (username) {
            socket.emit('media-status', { from: username, camera, mic, sharing })
        }
    }, [username])

    const handleToggleCamera = useCallback(async (enabled: boolean) => {
        try {
            await rtcRef.current?.toggleCamera(enabled)
            setIsCameraOn(enabled)
            // 更新本地流引用，让自己的画面能显示
            const stream = rtcRef.current?.getLocalStream() || null
            setLocalStream(stream ? new MediaStream(stream.getTracks()) : null)
            broadcastMediaStatus(enabled, isMicOn, isSharing)
        } catch {
            message.error('无法访问摄像头')
        }
    }, [broadcastMediaStatus, isMicOn, isSharing])

    const handleToggleMic = useCallback(async (enabled: boolean) => {
        try {
            await rtcRef.current?.toggleMic(enabled)
            setIsMicOn(enabled)
            broadcastMediaStatus(isCameraOn, enabled, isSharing)
        } catch {
            message.error('无法访问麦克风')
        }
    }, [broadcastMediaStatus, isCameraOn, isSharing])

    const handleStartScreenShare = useCallback(async () => {
        if (!rtcRef.current) return
        try {
            const targets = Array.from(participants.keys())
            await rtcRef.current.startScreenShare(targets)
            setIsSharing(true)
            setScreenSharer(username)
            broadcastMediaStatus(isCameraOn, isMicOn, true)
        } catch {
            message.error('屏幕共享失败')
        }
    }, [participants, username, broadcastMediaStatus, isCameraOn, isMicOn])

    // 区域共享
    const [regionPickerOpen, setRegionPickerOpen] = useState(false)

    const handleStartRegionShare = useCallback(() => {
        setRegionPickerOpen(true)
    }, [])

    const handleRegionConfirm = useCallback(async (region: { x: number; y: number; width: number; height: number }) => {
        setRegionPickerOpen(false)
        if (!rtcRef.current) return
        try {
            const targets = Array.from(participants.keys())
            await rtcRef.current.startRegionShare(targets, region)
            setIsSharing(true)
            setScreenSharer(username)
            broadcastMediaStatus(isCameraOn, isMicOn, true)
        } catch {
            message.error('区域共享失败')
        }
    }, [participants, username, broadcastMediaStatus, isCameraOn, isMicOn])

    const handleStopScreenShare = useCallback(() => {
        const targets = Array.from(participants.keys())
        rtcRef.current?.stopScreenShare(targets)
        setIsSharing(false)
        setScreenSharer(null)
        broadcastMediaStatus(isCameraOn, isMicOn, false)
    }, [participants, broadcastMediaStatus, isCameraOn, isMicOn])

    // ======================== 登录/退出 ========================
    const handleLoginSuccess = (name: string) => {
        setUsername(name)
        connectAndLogin(name)
    }

    const handleLogout = () => {
        leaveRoom()
        rtcRef.current?.destroy()
        rtcRef.current = null
        localStorage.removeItem('username')
        disconnectSocket()
        setUsername(null)
    }

    // ======================== 远程控制 ========================
    const handleRequestRemoteControl = useCallback(async (targetUser: string) => {
        if (!rtcRef.current) return

        // 如果已经在控制,则停止控制
        if (controllingUser === targetUser) {
            remoteControlManagerRef.current.stopControl()
            setControllingUser(null)
            message.info(`已停止控制 ${targetUser}`)
            return
        }

        // 请求控制权限
        message.loading({ content: '请求控制中...', key: 'remote-control' })
        const allowed = await rtcRef.current.requestRemoteControl(targetUser)

        if (!allowed) {
            message.error({ content: `${targetUser} 拒绝了控制请求`, key: 'remote-control' })
            return
        }

        message.success({ content: `已获得 ${targetUser} 的控制权限`, key: 'remote-control' })
        setControllingUser(targetUser)

        // 获取对方的屏幕流 video 元素
        const participant = participants.get(targetUser)
        if (!participant?.screenStream) {
            message.error('无法获取对方的屏幕流')
            setControllingUser(null)
            return
        }

        // 查找显示该屏幕流的 video 元素
        setTimeout(() => {
            const videos = document.querySelectorAll('video')
            let targetVideo: HTMLVideoElement | null = null

            videos.forEach((video) => {
                if (video.srcObject === participant.screenStream) {
                    targetVideo = video
                }
            })

            if (!targetVideo) {
                message.error('无法找到屏幕共享画面')
                setControllingUser(null)
                return
            }

            // 启动远程控制
            remoteControlManagerRef.current.startControl(
                targetVideo, 
                (event) => {
                    rtcRef.current?.sendRemoteControlEvent(targetUser, event)
                },
                () => {
                    // ESC 键停止控制的回调
                    remoteControlManagerRef.current.stopControl()
                    setControllingUser(null)
                    message.info(`已停止控制 ${targetUser}`)
                }
            )

            message.success(`正在控制 ${targetUser} 的屏幕 (按住 Ctrl 暂停，按 ESC 停止)`)
        }, 500)
    }, [controllingUser, participants])

    if (!username) {
        return <Login onLoginSuccess={handleLoginSuccess} />
    }

    return (
        <div className="flex w-full h-screen">
            <UserSidebar
                currentUser={username}
                inRoom={inRoom}
                roomId={roomId}
                participants={participants}
                onLogout={handleLogout}
                onCreateRoom={handleCreateRoom}
                onInviteUser={handleInviteUser}
                onLeaveRoom={handleLeaveRoom}
                visible={sidebarVisible}
                onToggleVisible={() => setSidebarVisible(!sidebarVisible)}
            />
            <MeetingContent
                currentUser={username}
                inRoom={inRoom}
                participants={participants}
                localStream={localStream}
                isCameraOn={isCameraOn}
                isMicOn={isMicOn}
                isSharing={isSharing}
                screenSharer={screenSharer}
                onLeaveRoom={handleLeaveRoom}
                onStartScreenShare={handleStartScreenShare}
                onStartRegionShare={handleStartRegionShare}
                onStopScreenShare={handleStopScreenShare}
                onToggleCamera={handleToggleCamera}
                onToggleMic={handleToggleMic}
                onRequestRemoteControl={handleRequestRemoteControl}
                controllingUser={controllingUser}
            />
            <RegionPicker
                open={regionPickerOpen}
                onConfirm={handleRegionConfirm}
                onCancel={() => setRegionPickerOpen(false)}
            />
        </div>
    )
}

export default MeetingRoom
