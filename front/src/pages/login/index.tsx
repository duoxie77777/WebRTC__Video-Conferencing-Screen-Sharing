import { useState } from 'react'
import { Input, Button, message } from 'antd'
import { UserOutlined } from '@ant-design/icons'
import { login } from '../../api/user'
import {VideoCameraOutlined} from "@ant-design/icons"
interface LoginProps {
  onLoginSuccess: (username: string) => void
}

const Login = ({ onLoginSuccess }: LoginProps) => {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    const name = username.trim()
    if (!name) {
      message.warning('请输入用户名')
      return
    }

    setLoading(true)
    try {
      const data = await login(name)
      message.success('登录成功')
      // 存到 localStorage
      localStorage.setItem('username', data.username)
      onLoginSuccess(data.username)
    } catch {
      // 错误已在 request 拦截器中提示
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <div className="w-full h-screen bg-gray-200 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-96 flex flex-col items-center gap-6">
        {/* Logo / 标题 */}
        <div className="text-center">
          <div className="text-4xl mb-2"><VideoCameraOutlined className="text-blue-500"/></div>
          <h1 className="text-2xl font-bold text-blue-500">多人视频会议</h1>
          <p className="text-gray-400 text-sm mt-1">输入用户名即可加入</p>
        </div>

        {/* 输入框 */}
        <Input
          size="large"
          placeholder="请输入用户名"
          prefix={<UserOutlined className="text-gray-400" />}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={20}
        />

        {/* 登录按钮 */}
        <Button
          type="primary"
          size="large"
          block
          loading={loading}
          onClick={handleLogin}
        >
          加入会议
        </Button>
      </div>
    </div>
  )
}

export default Login
