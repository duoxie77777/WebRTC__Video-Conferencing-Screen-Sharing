// 加载 node-turn
const Turn = require('node-turn');

// 创建 TURN 服务（专为你的 AWS 服务器配置）
const server = new Turn({
    // 认证方式（不用改）
    authMech: 'long-term',

    // ========== 账号密码 直接在这里 ==========
    credentials: {
        "xxx": "xxx"   // 用户名: 密码
    },

    // 监听端口（标准 3478）
    listeningPort: 3478,

    // 监听所有网卡
    listeningIps: ['0.0.0.0'],

    relayIps: ['xxx'],

    // 开启调试日志（方便看谁连接了）
    debug: true
});

// 启动服务
server.start();
