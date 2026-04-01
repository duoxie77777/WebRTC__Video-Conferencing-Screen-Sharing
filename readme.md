# WebRTC 多人视频会议

基于 WebRTC + Socket.IO 的多人视频会议系统，支持视频通话、屏幕共享、区域共享等功能。

## 技术栈

| 端 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Ant Design + TailwindCSS + Vite |
| 后端 | Node.js + Express + Socket.IO |
| 通信 | WebRTC (Mesh 架构) + Socket.IO 信令 |

## 功能特性

### 核心功能
- **用户登录** — 输入用户名即可加入
- **在线用户列表** — 实时展示所有在线用户，支持侧边栏折叠实现全屏效果
- **创建/加入会议** — 创建会议房间，邀请其他用户加入
- **多人视频通话** — Mesh 架构，支持多人同时通话
- **摄像头/麦克风控制** — 默认关闭，按需开启，实时同步状态
- **屏幕共享** — 共享整个屏幕 / 自定义区域共享
- **媒体状态同步** — 可看到对方的摄像头、麦克风、共享状态
- **二次确认** — 邀请、离开、退出等操作均有确认弹窗

### 高级功能
- **远程控制** — 在他人共享屏幕时可请求远程控制权限
- **侧边栏折叠** — 一键隐藏用户列表，提供沉浸式会议体验
- **智能按钮状态** — 根据当前场景自动启用/禁用相关功能按钮
- **平滑动画** — 侧边栏滑动、按钮切换均有流畅过渡效果

## 快速开始

### 1. 启动后端

```bash
cd back
npm install
node index.js
```

服务运行在 `http://localhost:8989`

### 2. 启动前端

```bash
cd front
npm install
npm run dev
```

### 3. 使用

1. 打开两个浏览器窗口访问前端地址
2. 分别输入不同的用户名登录
3. 一方点击「创建会议」
4. 从在线用户列表中点击「邀请」对方
5. 对方收到邀请弹窗，点击「加入」即可进入会议
6. 底部工具栏可控制麦克风、摄像头、屏幕共享、远程控制、离开会议
7. 点击侧边栏右侧的折叠按钮可隐藏用户列表，实现全屏效果

#### 功能说明

- **远程控制**：仅在他人共享屏幕时可用，点击后向共享者发起控制请求
- **侧边栏折叠**：点击侧边栏右边缘的蓝色按钮可切换显示/隐藏
- **禁用状态**：不可用的功能按钮会显示为灰色样式，便于识别

## 项目结构

```
webRtc/
├── back/
│   ├── index.js              # 信令服务器（Socket.IO + HTTP 接口）
│   └── package.json          # 后端依赖配置
├── front/
│   ├── src/
│   │   ├── api/
│   │   │   └── user.ts        # HTTP 接口封装
│   │   ├── types/
│   │   │   └── participant.ts # 参与者类型定义
│   │   ├── utils/
│   │   │   ├── request.ts     # Axios 封装
│   │   │   ├── socket.ts      # Socket.IO 客户端单例
│   │   │   └── webrtc.ts      # Mesh WebRTC 管理器
│   │   └── pages/
│   │       ├── login/         # 登录页
│   │       │   └── index.tsx
│   │       └── home/
│   │           ├── index.tsx  # 主页面（状态中心、会议逻辑）
│   │           └── components/
│   │               ├── UserSidebar/       # 侧边栏
│   │               │   ├── index.tsx      # 用户列表、邀请、折叠功能
│   │               │   └── UserCard.tsx   # 用户卡片组件
│   │               ├── MeetingContent/    # 会议主区域
│   │               │   ├── index.tsx      # 视频网格、底部控制栏
│   │               │   └── VideoCard.tsx  # 视频卡片组件
│   │               └── RegionPicker/      # 区域共享选择器
│   │                   └── index.tsx
│   ├── tailwind.config.js    # TailwindCSS 配置
│   ├── vite.config.ts        # Vite 构建配置
│   └── package.json          # 前端依赖配置
└── readme.md
```
