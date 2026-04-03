import { useRef, useEffect, useMemo, useState } from 'react'
import { Button, Modal, Tooltip, message, Dropdown, Tag } from 'antd'
import {
    CameraOutlined,
    AudioOutlined,
    DesktopOutlined,
    PhoneOutlined,
    AudioMutedOutlined,
    VideoCameraOutlined,
    NotificationOutlined,
    CloseOutlined,
    ScissorOutlined,
    ControlOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons'
import type { Participant } from '../../../../types/participant'
import { isElectron } from '../../../../utils/remote-control'
import type { SubtitleItem } from '../SubtitleDisplay'

// ======================== 统一用户卡片 ========================
interface UserCardProps {
    name: string
    isSelf?: boolean
    cameraOn: boolean
    micOn: boolean
    sharing: boolean
    stream?: MediaStream | null
    onStopShare?: () => void
    isBeingControlled?: boolean
    compact?: boolean
    onClick?: () => void
    subtitle?: string
}

const UserCard = ({ name, isSelf, cameraOn, micOn, sharing, stream, onStopShare, isBeingControlled, compact, onClick, subtitle }: UserCardProps) => {
    const videoRef = useRef<HTMLVideoElement>(null)

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream
            videoRef.current.play().catch(() => {})
        }
    }, [stream])

    const avatarBg = isSelf ? 'bg-sky-500/25 border-sky-500/40' : 'bg-indigo-500/25 border-indigo-500/40'
    const avatarText = isSelf ? 'text-sky-300' : 'text-indigo-300'

    // 是否显示视频：
    // - 对方：有流 + cameraOn（通过 media-status 同步）
    // - 自己：cameraOn + stream + 不在共享
    const showVideo = (!isSelf && stream && cameraOn) || (isSelf && cameraOn && !sharing && stream)

    // 对于远程用户，始终需要渲染视频元素以播放音频
    const needAudioElement = !isSelf && stream

    return (
        <div
            className={`bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl relative flex items-center justify-center overflow-hidden w-full h-full ${onClick ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
            onClick={onClick}
        >
            {/* 被控制状态指示器 */}
            {isBeingControlled && (
                <div className={`absolute top-1 right-1 z-[3] bg-red-500/90 text-white px-1.5 py-0.5 rounded-full flex items-center gap-0.5 animate-pulse ${compact ? 'text-[8px]' : 'text-xs'}`}>
                    <ControlOutlined /> 控制中
                </div>
            )}

            {/* 视频画面 - object-contain 保持比例不拉伸 */}
            {/* 对于远程用户，始终渲染视频元素以播放音频，即使不显示视频 */}
            {(showVideo || needAudioElement) && (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isSelf}
                    className={`absolute inset-0 w-full h-full object-contain bg-gray-900 ${showVideo ? '' : 'invisible'}`}
                    style={isSelf ? { transform: 'scaleX(-1)' } : undefined}
                />
            )}

            {/* 头像覆盖层 */}
            {!showVideo && (
                <div className={`relative z-[1] flex flex-col items-center pointer-events-none ${compact ? 'gap-0.5' : 'gap-3'}`}>
                    <div className={`rounded-full ${avatarBg} border-2 flex items-center justify-center backdrop-blur-sm ${compact ? 'w-8 h-8' : 'w-16 h-16'}`}>
                        {sharing ? (
                            <DesktopOutlined className={compact ? 'text-sm text-blue-400' : 'text-2xl text-blue-400'} />
                        ) : (
                            <span className={`font-bold ${avatarText} ${compact ? 'text-sm' : 'text-2xl'}`}>{name[0]?.toUpperCase()}</span>
                        )}
                    </div>
                    {/* 紧凑模式只显示名字 */}
                    {compact ? (
                        <div className="text-gray-300 text-[10px] font-medium truncate max-w-[90%]">
                            {isSelf ? '我' : name}
                        </div>
                    ) : (
                        <>
                            <div className="text-gray-200 text-sm font-medium drop-shadow-lg">
                                {isSelf ? `${name}（我）` : name}
                            </div>
                            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
                                {sharing && (
                                    <span className="flex items-center gap-1 text-xs text-blue-400">
                                        <DesktopOutlined /> 共享屏幕中
                                    </span>
                                )}
                                {cameraOn ? (
                                    <span className="flex items-center gap-1 text-xs text-green-400">
                                        <VideoCameraOutlined /> 摄像头开
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 text-xs text-red-400">
                                        <CloseOutlined /> 未开启摄像头
                                    </span>
                                )}
                                {!micOn && (
                                    <span className="flex items-center gap-1 text-xs text-red-400">
                                        <AudioMutedOutlined /> 静音
                                    </span>
                                )}
                            </div>
                            {isSelf && sharing && onStopShare && (
                                <Button size="small" danger icon={<DesktopOutlined />} onClick={onStopShare} className="pointer-events-auto mt-2">
                                    停止共享
                                </Button>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* 底部名牌 */}
            <div className={`absolute left-1 z-[2] bg-black/60 backdrop-blur-sm text-white rounded-full flex items-center ${compact ? 'bottom-0.5 text-[8px] px-1.5 py-0.5 gap-0.5' : 'bottom-2 text-[11px] px-2.5 py-1 gap-1.5'}`}>
                <span className={`rounded-full bg-green-400 inline-block ${compact ? 'w-1 h-1' : 'w-1.5 h-1.5'}`} />
                {!micOn && <AudioMutedOutlined className="text-red-400" />}
                {sharing && <DesktopOutlined className="text-blue-400" />}
                {isBeingControlled && <ControlOutlined className="text-red-400" />}
                {isSelf ? '我' : name}
            </div>

            {/* 字幕显示 */}
            {subtitle && !compact && (
                <div className="absolute bottom-8 left-1 right-1 z-[10] bg-black/80 backdrop-blur-sm text-white px-3 py-2 rounded-lg text-sm text-center">
                    {subtitle}
                </div>
            )}
        </div>
    )
}

// ======================== 主组件 ========================
interface MeetingContentProps {
    currentUser: string
    inRoom: boolean
    participants: Map<string, Participant>
    localStream: MediaStream | null
    isCameraOn: boolean
    isMicOn: boolean
    isSharing: boolean
    screenSharer: string | null
    onLeaveRoom: () => void
    onStartScreenShare: () => void
    onStartRegionShare: () => void
    onStopScreenShare: () => void
    onToggleCamera: (enabled: boolean) => void
    onToggleMic: (enabled: boolean) => void
    onRequestRemoteControl?: (user: string) => void
    controllingUser?: string | null
    subtitles: SubtitleItem[]
}

const MeetingContent = ({
    currentUser,
    inRoom,
    participants,
    localStream,
    isCameraOn,
    isMicOn,
    isSharing,
    screenSharer,
    onLeaveRoom,
    onStartScreenShare,
    onStartRegionShare,
    onStopScreenShare,
    onToggleCamera,
    onToggleMic,
    onRequestRemoteControl,
    controllingUser,
    subtitles,
}: MeetingContentProps) => {
    const screenVideoRef = useRef<HTMLVideoElement>(null)

    // 找到共享者的屏幕流
    const screenShareStream = useMemo(() => {
        if (!screenSharer) return null
        if (screenSharer === currentUser) return null // 自己共享不显示大屏
        return participants.get(screenSharer)?.screenStream || null
    }, [screenSharer, currentUser, participants])

    useEffect(() => {
        if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = screenShareStream
            if (screenShareStream) {
                screenVideoRef.current.play().catch(() => {})
            }
        }
    }, [screenShareStream])

    // 添加 ESC 键监听，按 ESC 停止控制
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && controllingUser && onRequestRemoteControl) {
                e.preventDefault()
                onRequestRemoteControl(controllingUser) // 再次调用会停止控制
                message.info('已按 ESC 停止控制')
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [controllingUser, onRequestRemoteControl])

    const handleLeaveRoom = () => {
        Modal.confirm({
            title: '离开会议',
            content: '确定要离开当前会议吗？',
            okText: '离开',
            okType: 'danger',
            cancelText: '取消',
            onOk: onLeaveRoom,
        })
    }

    // 计算网格列数和行数
    const totalUsers = participants.size + 1 // 包含自己
    const gridCols = totalUsers <= 1 ? 1 : totalUsers <= 4 ? 2 : totalUsers <= 9 ? 3 : 4
    const gridRows = Math.ceil(totalUsers / gridCols)

    // 获取每个用户的最新字幕（需要定期更新以实现自动消失）
    const [userSubtitles, setUserSubtitles] = useState<Map<string, string>>(new Map())

    useEffect(() => {
        const updateSubtitles = () => {
            const map = new Map<string, string>()
            const now = Date.now()
            for (const sub of subtitles) {
                if (now - sub.timestamp < 4000) {
                    map.set(sub.from, sub.text)
                }
            }
            if (map.size > 0) {
                console.log('[字幕] 当前显示的字幕:', Object.fromEntries(map))
            }
            setUserSubtitles(map)
        }

        updateSubtitles()
        const timer = setInterval(updateSubtitles, 500)
        return () => clearInterval(timer)
    }, [subtitles])

    // 未在房间中
    if (!inRoom) {
        return (
            <div className="flex flex-col flex-1 min-w-0 bg-gray-900 h-screen relative">
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="text-gray-400 text-lg"><NotificationOutlined /> 欢迎，{currentUser}</div>
                        <div className="text-gray-500 text-sm mt-2">创建或加入一个会议开始通话</div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col flex-1 min-w-0 bg-gray-900 h-screen overflow-hidden relative">
            {/* 顶部状态栏 */}
            <div className="p-3 flex justify-between items-center border-b border-gray-700/50 z-10">
                <div className="text-white text-sm flex items-center gap-2">
                    会议中 · <span className="text-blue-400">{totalUsers}</span> 人
                    {/* 平台标识 */}
                    {isElectron ? (
                        <Tag color="green" icon={<ControlOutlined />}>客户端</Tag>
                    ) : (
                        <Tooltip title="Web端可控制他人,但无法被控制。需要被控制功能请使用客户端">
                            <Tag color="orange" icon={<InfoCircleOutlined />}>Web(仅可控制)</Tag>
                        </Tooltip>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {screenSharer && (
                        <span className="text-orange-400 text-xs flex items-center gap-1">
                            <DesktopOutlined /> {screenSharer === currentUser ? '你' : screenSharer} 正在共享屏幕
                        </span>
                    )}
                </div>
            </div>

            {/* 视频主区域 */}
            <div className="flex-1 p-2 overflow-hidden relative">
                {/* 控制状态悬浮面板 */}
                {controllingUser && (
                    <div
                        className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] pointer-events-auto"
                        onMouseDown={(e) => e.stopPropagation()}
                        onMouseUp={(e) => e.stopPropagation()}
                        onMouseMove={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="bg-red-500/95 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-pulse">
                            <ControlOutlined className="text-xl" />
                            <span className="font-medium">正在控制 {controllingUser} 的屏幕</span>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="small"
                                    danger
                                    onClick={() => onRequestRemoteControl?.(controllingUser)}
                                    icon={<CloseOutlined />}
                                >
                                    停止控制
                                </Button>
                                <span className="text-xs opacity-80">按 ESC 停止 | 按住 Ctrl 暂停</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* 远端屏幕共享大屏 - 始终挂载，用 CSS 控制显隐，避免条件渲染导致 insertBefore 错误 */}
                <div
                    className="absolute inset-2 z-10 bg-black rounded-lg overflow-hidden"
                    style={{ display: screenShareStream ? 'block' : 'none' }}
                >
                    <video ref={screenVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
                    {screenSharer && (
                        <div className="absolute top-3 left-3 bg-black/60 text-orange-400 text-xs px-2 py-1 rounded">
                            {screenSharer} 的屏幕共享
                        </div>
                    )}
                </div>

                {/* 根据是否有屏幕共享切换不同的渲染模式 */}
                {screenShareStream ? (
                    <div key="screen-share-mode" className="h-full relative">
                        {/* 屏幕共享时，底部小窗 */}
                        <div className="absolute bottom-2 right-4 z-20 flex gap-2 overflow-x-auto max-w-[70%]">
                            <div className="w-36 h-24 shrink-0 rounded-lg overflow-hidden shadow-lg border border-gray-600">
                                <UserCard key="self-thumb" name={currentUser} isSelf cameraOn={isCameraOn} micOn={isMicOn} sharing={isSharing} stream={localStream} compact />
                            </div>
                            {Array.from(participants.entries()).map(([user, p]) => (
                                <div key={`thumb-${user}`} className="w-36 h-24 shrink-0 rounded-lg overflow-hidden shadow-lg border border-gray-600">
                                    <UserCard
                                        name={p.name}
                                        cameraOn={p.cameraOn}
                                        micOn={p.micOn}
                                        sharing={p.sharing}
                                        stream={p.stream}
                                        isBeingControlled={controllingUser === user}
                                        compact
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div
                        key="grid-mode"
                        className="grid gap-3 h-full p-1"
                        style={{
                            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                            gridTemplateRows: `repeat(${gridRows}, 1fr)`,
                        }}
                    >
                        {/* 自己（排第一,在左边） */}
                        <UserCard
                            key="self-grid"
                            name={currentUser}
                            isSelf
                            cameraOn={isCameraOn}
                            micOn={isMicOn}
                            sharing={isSharing}
                            stream={localStream}
                            onStopShare={onStopScreenShare}
                            subtitle={userSubtitles.get(currentUser)}
                        />

                        {/* 其他参与者 */}
                        {Array.from(participants.entries()).map(([user, p]) => (
                            <UserCard
                                key={`grid-${user}`}
                                name={p.name}
                                cameraOn={p.cameraOn}
                                micOn={p.micOn}
                                sharing={p.sharing}
                                stream={p.stream}
                                isBeingControlled={controllingUser === user}
                                subtitle={userSubtitles.get(user)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* 底部控制栏 */}
            <div className="h-16 shrink-0 bg-gray-900/90 backdrop-blur-md border-t border-gray-700/50 flex items-center justify-center gap-2 sm:gap-3 px-2 z-10">
                <Tooltip title={isMicOn ? '关闭麦克风' : '打开麦克风'}>
                    <Button
                        type={isMicOn ? 'default' : 'primary'}
                        danger={!isMicOn}
                        icon={isMicOn ? <AudioOutlined /> : <AudioMutedOutlined />}
                        shape="circle"
                        size="large"
                        onClick={() => onToggleMic(!isMicOn)}
                    />
                </Tooltip>
                <Tooltip title={isCameraOn ? '关闭摄像头' : '打开摄像头'}>
                    <Button
                        type={isCameraOn ? 'default' : 'primary'}
                        danger={!isCameraOn}
                        icon={<CameraOutlined />}
                        shape="circle"
                        size="large"
                        onClick={() => onToggleCamera(!isCameraOn)}
                    />
                </Tooltip>
                {isSharing ? (
                    <Tooltip title="停止共享">
                        <Button
                            type="primary"
                            icon={<DesktopOutlined />}
                            shape="circle"
                            size="large"
                            onClick={onStopScreenShare}
                        />
                    </Tooltip>
                ) : (
                    <Dropdown
                        menu={{
                            items: [
                                { key: 'full', icon: <DesktopOutlined />, label: '共享整个屏幕' },
                                { key: 'region', icon: <ScissorOutlined />, label: '共享自定义区域' },
                            ],
                            onClick: ({ key }) => {
                                if (screenSharer) {
                                    message.warning(`${screenSharer} 正在共享屏幕`)
                                    return
                                }
                                if (key === 'full') onStartScreenShare()
                                else onStartRegionShare()
                            },
                        }}
                        trigger={['click']}
                        disabled={!!screenSharer}
                        placement="top"
                    >
                        <Tooltip title={screenSharer ? `${screenSharer} 正在共享` : '共享屏幕'}>
                            <Button
                                icon={<DesktopOutlined />}
                                shape="circle"
                                size="large"
                                disabled={!!screenSharer}
                                style={{
                                    borderColor: screenSharer ? '#6b7280' : undefined,
                                    color: screenSharer ? '#9ca3af' : undefined,
                                    cursor: screenSharer ? 'not-allowed' : 'pointer',
                                }}
                            />
                        </Tooltip>
                    </Dropdown>
                )}
                {/* 远程控制按钮 - 仅当他人共享屏幕时可用 */}
                <Tooltip title={
                    !screenSharer ? '无人共享屏幕' :
                        screenSharer === currentUser ? '无法控制自己的共享' :
                            controllingUser ? '停止控制' :
                                '请求控制屏幕'
                }>
                    <Button
                        type={controllingUser ? 'primary' : 'default'}
                        danger={!!controllingUser}
                        icon={<ControlOutlined />}
                        shape="circle"
                        size="large"
                        disabled={!screenSharer || screenSharer === currentUser}
                        onClick={() => {
                            if (screenSharer && screenSharer !== currentUser && onRequestRemoteControl) {
                                onRequestRemoteControl(screenSharer)
                            }
                        }}
                        style={{
                            borderColor: (!screenSharer || screenSharer === currentUser) ? '#6b7280' : undefined,
                            color: (!screenSharer || screenSharer === currentUser) ? '#9ca3af' : undefined,
                            cursor: (!screenSharer || screenSharer === currentUser) ? 'not-allowed' : 'pointer',
                        }}
                    />
                </Tooltip>
                <Tooltip title="离开会议">
                    <Button
                        danger
                        type="primary"
                        icon={<PhoneOutlined rotate={225} />}
                        shape="circle"
                        size="large"
                        onClick={handleLeaveRoom}
                    />
                </Tooltip>
            </div>
        </div>
    )
}

export default MeetingContent
