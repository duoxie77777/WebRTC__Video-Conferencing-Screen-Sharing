import request from '../utils/request'

/** 登录 */
export function login(username: string) {
  return request.post<{ username: string }>('/api/login', { username })
}

/** 获取在线用户列表 */
export function getOnlineUsers() {
  return request.get<string[]>('/api/online-users')
}
