import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { message } from 'antd'

// 统一后端响应格式
interface ApiResponse<T = any> {
  code: number
  data: T
  message: string
}

// 创建 axios 实例
const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'xxx',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ======================== 请求拦截器 ========================
service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 从 localStorage 取 token，有则带上
    const token = localStorage.getItem('token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

// ======================== 响应拦截器 ========================
service.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response.data

    // 如果后端返回的是文件流（blob），直接返回
    if (response.config.responseType === 'blob') {
      return res
    }

    // 如果后端没有包一层 { code, data, message }，直接返回原始数据
    if (res.code === undefined) {
      return res
    }

    // 正常业务成功
    if (res.code === 0 || res.code === 200) {
      return res.data
    }

    // 401 未授权 → 清除 token 并跳转登录
    if (res.code === 401) {
      localStorage.removeItem('token')
      message.error('登录已过期，请重新登录')
      // 如果有路由可以在这里跳转: window.location.href = '/login'
      return Promise.reject(new Error(res.message || '未授权'))
    }

    // 其它业务错误
    message.error(res.message || '请求失败')
    return Promise.reject(new Error(res.message || '请求失败'))
  },
  (error) => {
    // HTTP 层错误处理
    const status = error.response?.status
    const errorMap: Record<number, string> = {
      400: '请求参数错误',
      401: '未授权，请登录',
      403: '拒绝访问',
      404: '请求资源不存在',
      500: '服务器内部错误',
      502: '网关错误',
      503: '服务不可用',
      504: '网关超时',
    }
    const msg = errorMap[status] || error.message || '网络异常'
    message.error(msg)
    return Promise.reject(error)
  },
)

// ======================== 封装请求方法 ========================

const request = {
  get<T = any>(url: string, params?: object, config?: AxiosRequestConfig): Promise<T> {
    return service.get(url, { params, ...config })
  },

  post<T = any>(url: string, data?: object, config?: AxiosRequestConfig): Promise<T> {
    return service.post(url, data, config)
  },

  put<T = any>(url: string, data?: object, config?: AxiosRequestConfig): Promise<T> {
    return service.put(url, data, config)
  },

  delete<T = any>(url: string, params?: object, config?: AxiosRequestConfig): Promise<T> {
    return service.delete(url, { params, ...config })
  },

  /** 上传文件 */
  upload<T = any>(url: string, formData: FormData, config?: AxiosRequestConfig): Promise<T> {
    return service.post(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      ...config,
    })
  },

  /** 下载文件（返回 Blob） */
  download(url: string, params?: object, config?: AxiosRequestConfig): Promise<Blob> {
    return service.get(url, { params, responseType: 'blob', ...config })
  },
}

export default request
export { service, type ApiResponse }
