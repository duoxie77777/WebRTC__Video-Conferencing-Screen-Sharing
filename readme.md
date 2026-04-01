# WebRTC 多人视频会议

基于 WebRTC + Socket.IO 的多人视频会议系统，支持视频通话、屏幕共享、区域共享等功能。

## 技术栈

| 端 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Ant Design + TailwindCSS + Vite |
| 后端 | Node.js + Express + Socket.IO |
| 通信 | WebRTC (Mesh 架构) + Socket.IO 信令 |

## 功能

- **用户登录** — 输入用户名即可加入
- **在线用户列表** — 实时展示所有在线用户
- **创建/加入会议** — 创建会议房间，邀请其他用户加入
- **多人视频通话** — Mesh 架构，支持多人同时通话
- **摄像头/麦克风控制** — 默认关闭，按需开启，实时同步状态
- **屏幕共享** — 共享整个屏幕 / 自定义区域共享
- **媒体状态同步** — 可看到对方的摄像头、麦克风、共享状态
- **二次确认** — 邀请、离开、退出等操作均有确认弹窗

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
6. 底部工具栏可控制麦克风、摄像头、屏幕共享、离开会议

## 项目结构

```
webRtc/
├── back/
│   └── index.js              # 信令服务器（Socket.IO + HTTP 接口）
├── front/
│   └── src/
│       ├── api/user.ts        # HTTP 接口封装
│       ├── types/participant.ts # 参与者类型定义
│       ├── utils/
│       │   ├── request.ts     # Axios 封装
│       │   ├── socket.ts      # Socket.IO 客户端单例
│       │   └── webrtc.ts      # Mesh WebRTC 管理器
│       └── pages/
│           ├── login/         # 登录页
│           └── home/
│               ├── index.tsx  # 主页面（状态中心）
│               └── components/
│                   ├── UserSidebar/      # 侧边栏（用户列表、邀请）
│                   ├── MeetingContent/   # 会议主区域（视频网格）
│                   └── RegionPicker/     # 区域共享选择器
└── readme.md
```
