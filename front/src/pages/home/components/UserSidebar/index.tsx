import { useState, useEffect } from 'react'
import { List, Avatar, Button, Space, Badge, Modal, message, Tag } from 'antd'
import { UserOutlined, PhoneOutlined, LogoutOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons'
import { getSocket } from '../../../../utils/socket'
import type { Participant } from '../../../../types/participant'

interface UserSidebarProps {
    currentUser: string
    inRoom: boolean
    roomId: string | null
    participants: Map<string, Participant>
    onLogout: () => void
    onCreateRoom: () => void
    onInviteUser: (target: string) => void
    onLeaveRoom: () => void
}

const UserSidebar = ({
    currentUser,
    inRoom,
    participants,
    onLogout,
    onCreateRoom,
    onInviteUser,
    onLeaveRoom,
}: UserSidebarProps) => {
    const [onlineUsers, setOnlineUsers] = useState<string[]>([])

    useEffect(() => {
        const socket = getSocket()
        const handleOnlineUsers = (userList: string[]) => {
            setOnlineUsers(userList)
        }
        socket.on('online-users', handleOnlineUsers)
        return () => {
            socket.off('online-users', handleOnlineUsers)
        }
    }, [currentUser])
    console.log(currentUser)
    // 不包含自己
    const otherUsers = onlineUsers.filter((u) => u !== currentUser)
    // 已在房间内的用户
    const roomMembers = new Set(participants.keys())

    const handleInvite = (target: string) => {
        if (!inRoom) {
            message.warning('请先创建会议')
            return
        }
        Modal.confirm({
            title: '邀请用户',
            content: `邀请 ${target} 加入会议？`,
            okText: '邀请',
            cancelText: '取消',
            icon: <PhoneOutlined style={{ color: '#1677ff' }} />,
            onOk: () => {
                onInviteUser(target)
                message.success(`已向 ${target} 发送邀请`)
            },
        })
    }

    const handleLogout = () => {
        Modal.confirm({
            title: '退出登录',
            content: '确定要退出登录吗？',
            okText: '退出',
            okType: 'danger',
            cancelText: '取消',
            onOk: onLogout,
        })
    }

    return (
        <div className="w-64 h-screen bg-white border-r border-gray-200 p-4 flex flex-col justify-between">
            <div className="flex flex-col gap-3 overflow-hidden">
                {/* 当前用户 */}
                <div className="pb-3 border-b border-gray-100 flex items-center gap-2">
                    <Avatar style={{ backgroundColor: '#1677ff' }}>
                        {currentUser[0]}
                    </Avatar>
                    <div>
                        <div className="text-sm font-semibold text-gray-800">{currentUser}</div>
                        <div className="text-xs text-green-500">
                            {inRoom ? '会议中' : '在线'}
                        </div>
                    </div>
                </div>

                {/* 房间状态 */}
                {inRoom ? (
                    <div className="pb-3 border-b border-gray-100">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                                <TeamOutlined /> 会议中 · {participants.size + 1} 人
                            </span>
                            <Button size="small" danger onClick={onLeaveRoom}>
                                离开
                            </Button>
                        </div>
                        {/* 房间内成员 */}
                        <div className="flex flex-wrap gap-1">
                            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                                {currentUser}（我）
                            </span>
                            {Array.from(participants.keys()).map((name) => (
                                <span key={name} className="text-[10px] bg-gray-50 text-gray-600 px-1.5 py-0.5 rounded">
                                    {name}
                                </span>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="pb-3 border-b border-gray-100">
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            block
                            onClick={onCreateRoom}
                        >
                            创建会议
                        </Button>
                    </div>
                )}

                {/* 在线用户列表 */}
                <div className="pb-2">
                    <h2 className="text-sm font-semibold text-gray-800">在线用户</h2>
                    <p className="text-xs text-gray-400 mt-0.5">共 {onlineUsers.length} 人在线</p>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <List
                        itemLayout="horizontal"
                        // 作用是让自己排在第一
                        dataSource={[currentUser, ...otherUsers]}
                        locale={{ emptyText: '暂无在线用户' }}
                        renderItem={(name) => {
                            const isSelf = name === currentUser
                            const isInMyRoom = roomMembers.has(name)
                            return (
                                <List.Item className="py-2 border-b border-gray-100">
                                    <Space align="center">
                                        <Badge status="success" dot>
                                            <Avatar size="small" icon={<UserOutlined />} />
                                        </Badge>
                                        <span className="text-gray-700 text-sm">{name}</span>
                                        {isSelf && (
                                            <Tag color="blue">我</Tag>
                                        )}
                                        {isInMyRoom && !isSelf && (
                                            <span className="text-[10px] bg-green-50 text-green-600 px-1 rounded">会议中</span>
                                        )}
                                    </Space>
                                    {inRoom && !isInMyRoom && !isSelf && (
                                        <Button
                                            type="primary"
                                            size="small"
                                            icon={<PhoneOutlined />}
                                            onClick={() => handleInvite(name)}
                                        >
                                            邀请
                                        </Button>
                                    )}
                                </List.Item>
                            )
                        }}
                    />
                </div>
            </div>

            <Button
                type="default"
                danger
                icon={<LogoutOutlined />}
                onClick={handleLogout}
            >
                退出登录
            </Button>
        </div>
    )
}

export default UserSidebar
