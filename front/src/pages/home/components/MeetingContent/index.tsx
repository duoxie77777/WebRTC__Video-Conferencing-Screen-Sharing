import { useRef, useEffect, useMemo } from 'react'
import { Button, Modal, Tooltip, message, Dropdown } from 'antd'
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
} from '@ant-design/icons'
import type { Participant } from '../../../../types/participant'

// ======================== 统一用户卡片 ========================
interface UserCardProps {
    name: string
    isSelf?: boolean
    cameraOn: boolean
    micOn: boolean
    sharing: boolean
    stream?: MediaStream | null
    onStopShare?: () => void
}

const UserCard = ({ name, isSelf, cameraOn, micOn, sharing, stream, onStopShare }: UserCardProps) => {
    const videoRef = useRef<HTMLVideoElement>(null)

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream
        }
    }, [stream])

    const avatarBg = isSelf ? 'bg-sky-500/25 border-sky-500/40' : 'bg-indigo-500/25 border-indigo-500/40'
    const avatarText = isSelf ? 'text-sky-300' : 'text-indigo-300'

    const statusItems: { icon: React.ReactNode; text: string; color: string }[] = []
    if (sharing) statusItems.push({ icon: <DesktopOutlined />, text: '共享屏幕中', color: 'text-blue-400' })
    if (cameraOn) statusItems.push({ icon: <VideoCameraOutlined />, text: '摄像头开', color: 'text-green-400' })
    else statusItems.push({ icon: <CloseOutlined />, text: '未开启摄像头', color: 'text-red-400' })
    if (!micOn) statusItems.push({ icon: <AudioMutedOutlined />, text: '静音', color: 'text-red-400' })

    return (
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl relative flex items-center justify-center overflow-hidden min-h-0">
            {/* 视频底层：自己开了摄像头且不在共享 / 对方有流 */}
            {((!isSelf && stream) || (isSelf && cameraOn && !sharing && stream)) && (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isSelf}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={isSelf ? { transform: 'scaleX(-1)' } : undefined}
                />
            )}

            {/* 头像覆盖层 */}
            <div className="relative z-[1] flex flex-col items-center gap-2 pointer-events-none">
                <div className={`w-16 h-16 rounded-full ${avatarBg} border-2 flex items-center justify-center backdrop-blur-sm`}>
                    {sharing ? (
                        <DesktopOutlined className="text-2xl text-blue-400" />
                    ) : (
                        <span className={`text-2xl font-bold ${avatarText}`}>{name[0]?.toUpperCase()}</span>
                    )}
                </div>
                <div className="text-gray-200 text-xs font-medium drop-shadow-lg">
                    {isSelf ? `${name}（我）` : name}
                </div>
                <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5">
                    {statusItems.map((item, i) => (
                        <span key={i} className={`flex items-center gap-0.5 text-[10px] ${item.color}`}>
                            {item.icon} {item.text}
                        </span>
                    ))}
                </div>
                {isSelf && sharing && onStopShare && (
                    <Button size="small" danger icon={<DesktopOutlined />} onClick={onStopShare} className="pointer-events-auto mt-1">
                        停止共享
                    </Button>
                )}
            </div>

            {/* 底部名牌 */}
            <div className="absolute bottom-2 left-2 z-[2] bg-black/50 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                {!micOn && <AudioMutedOutlined className="text-red-400" />}
                {sharing && <DesktopOutlined className="text-blue-400" />}
                {isSelf ? '我' : name}
            </div>
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
}: MeetingContentProps) => {
    const screenVideoRef = useRef<HTMLVideoElement>(null)

    // 找到共享者的屏幕流
    const screenShareStream = useMemo(() => {
        if (!screenSharer) return null
        if (screenSharer === currentUser) return null // 自己共享不显示大屏
        return participants.get(screenSharer)?.screenStream || null
    }, [screenSharer, currentUser, participants])

    useEffect(() => {
        if (screenVideoRef.current && screenShareStream) {
            screenVideoRef.current.srcObject = screenShareStream
        }
    }, [screenShareStream])

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

    // 计算网格列数
    const totalUsers = participants.size + 1 // 包含自己
    const gridCols = totalUsers <= 1 ? 1 : totalUsers <= 4 ? 2 : totalUsers <= 9 ? 3 : 4

    // 未在房间中
    if (!inRoom) {
        return (
            <div className="flex flex-col flex-1 bg-gray-900 h-screen items-center justify-center">
                <div className="text-gray-400 text-lg"><NotificationOutlined /> 欢迎，{currentUser}</div>
                <div className="text-gray-500 text-sm mt-2">创建或加入一个会议开始通话</div>
            </div>
        )
    }

    return (
        <div className="flex flex-col flex-1 bg-gray-900 h-screen overflow-hidden">
            {/* 顶部状态栏 */}
            <div className="p-3 flex justify-between items-center border-b border-gray-700/50 z-10">
                <div className="text-white text-sm flex items-center gap-2">
                    会议中 · <span className="text-blue-400">{totalUsers}</span> 人
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
                {/* 远端屏幕共享大屏 */}
                {screenShareStream && (
                    <div className="absolute inset-2 z-10 bg-black rounded-lg overflow-hidden">
                        <video ref={screenVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
                        <div className="absolute top-3 left-3 bg-black/60 text-orange-400 text-xs px-2 py-1 rounded">
                            {screenSharer} 的屏幕共享
                        </div>
                    </div>
                )}

                {/* 多人视频网格 */}
                <div
                    className={`grid gap-2 h-full ${screenShareStream ? 'opacity-0 pointer-events-none' : ''}`}
                    style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}
                >
                    {/* 自己（排第一，在左边） */}
                    <UserCard
                        name={currentUser}
                        isSelf
                        cameraOn={isCameraOn}
                        micOn={isMicOn}
                        sharing={isSharing}
                        stream={localStream}
                        onStopShare={onStopScreenShare}
                    />

                    {/* 其他参与者 */}
                    {Array.from(participants.entries()).map(([user, p]) => (
                        <UserCard
                            key={user}
                            name={p.name}
                            cameraOn={p.cameraOn}
                            micOn={p.micOn}
                            sharing={p.sharing}
                            stream={p.stream}
                        />
                    ))}
                </div>

                {/* 屏幕共享时，底部小窗 */}
                {screenShareStream && (
                    <div className="absolute bottom-4 right-4 z-20 flex gap-2 overflow-x-auto max-w-[60%]">
                        <div className="w-36 h-24 shrink-0">
                            <UserCard name={currentUser} isSelf cameraOn={isCameraOn} micOn={isMicOn} sharing={isSharing} stream={localStream} />
                        </div>
                        {Array.from(participants.entries()).map(([user, p]) => (
                            <div key={user} className="w-36 h-24 shrink-0">
                                <UserCard name={p.name} cameraOn={p.cameraOn} micOn={p.micOn} sharing={p.sharing} stream={p.stream} />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 底部控制栏 */}
            <div className="h-16 bg-gray-900/90 backdrop-blur-md border-t border-gray-700/50 flex items-center justify-center gap-3 z-10">
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
                            />
                        </Tooltip>
                    </Dropdown>
                )}
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
