const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 在线用户: { username: socketId }
const onlineUsers = {};
// 房间: { roomId: Set<username> }
const rooms = {};
// 用户所在房间: { username: roomId }
const userRoom = {};

io.on('connection', (socket) => {
    console.log('用户连接：', socket.id);

    // ====================== 用户管理 ======================
    socket.on('login', (username) => {
        onlineUsers[username] = socket.id;
        io.emit('online-users', Object.keys(onlineUsers));
        console.log(`用户 ${username} 登录，ID：${socket.id}`);
    });

    // ====================== 房间管理 ======================
    // 创建/加入房间
    socket.on('join-room', (data) => {
        const { username, roomId } = data;

        // 如果用户已在其他房间，先离开
        if (userRoom[username]) {
            leaveRoom(username);
        }

        // 创建或加入房间
        if (!rooms[roomId]) {
            rooms[roomId] = new Set();
        }
        rooms[roomId].add(username);
        userRoom[username] = roomId;
        socket.join(roomId);

        // 通知房间内已有成员列表给新加入的用户
        const members = Array.from(rooms[roomId]);
        socket.emit('room-members', { roomId, members });

        // 通知房间内其他人有新成员加入
        socket.to(roomId).emit('user-joined', { username, roomId });

        console.log(`用户 ${username} 加入房间 ${roomId}，当前成员：${members}`);
    });

    // 离开房间
    socket.on('leave-room', (data) => {
        leaveRoom(data.username);
    });

    // 邀请用户进房间
    socket.on('invite', (data) => {
        const { from, to, roomId } = data;
        const targetSocketId = onlineUsers[to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('invite', { from, roomId });
        }
    });

    // ====================== WebRTC 信令（点对点，带 from/to） ======================
    socket.on('call', (data) => {
        const targetSocketId = onlineUsers[data.to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('incoming-call', {
                from: data.from,
                offer: data.offer
            });
        }
    });

    socket.on('answer', (data) => {
        const targetSocketId = onlineUsers[data.to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-answered', {
                from: data.from,
                answer: data.answer
            });
        }
    });

    socket.on('ice-candidate', (data) => {
        const targetSocketId = onlineUsers[data.to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', {
                from: data.from,
                candidate: data.candidate
            });
        }
    });

    socket.on('hangup', (data) => {
        const targetSocketId = onlineUsers[data.to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('hangup', { from: data.from });
        }
    });

    // ====================== 屏幕共享信令 ======================
    socket.on('start-screen-share', (data) => {
        const targetSocketId = onlineUsers[data.to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('screen-share-offer', {
                from: data.from,
                offer: data.offer
            });
        }
    });

    socket.on('answer-screen-share', (data) => {
        const targetSocketId = onlineUsers[data.to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('screen-share-answer', {
                from: data.from,
                answer: data.answer
            });
        }
    });

    socket.on('screen-ice-candidate', (data) => {
        const targetSocketId = onlineUsers[data.to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('screen-ice-candidate', {
                from: data.from,
                candidate: data.candidate
            });
        }
    });

    socket.on('stop-screen-share', (data) => {
        // 广播给房间内所有人
        const roomId = userRoom[data.from];
        if (roomId) {
            socket.to(roomId).emit('stop-screen-share', { from: data.from });
        }
    });

    // ====================== 媒体状态同步（广播给房间） ======================
    socket.on('media-status', (data) => {
        const roomId = userRoom[data.from];
        if (roomId) {
            socket.to(roomId).emit('media-status', {
                from: data.from,
                camera: data.camera,
                mic: data.mic,
                sharing: data.sharing
            });
        }
    });

    // ====================== 断开连接 ======================
    socket.on('disconnect', () => {
        for (const [username, id] of Object.entries(onlineUsers)) {
            if (id === socket.id) {
                leaveRoom(username);
                delete onlineUsers[username];
                io.emit('online-users', Object.keys(onlineUsers));
                console.log(`用户 ${username} 离线`);
                break;
            }
        }
    });

    function leaveRoom(username) {
        const roomId = userRoom[username];
        if (!roomId || !rooms[roomId]) return;

        rooms[roomId].delete(username);
        delete userRoom[username];

        // 通知房间其他人
        const members = Array.from(rooms[roomId]);
        io.to(roomId).emit('user-left', { username, roomId, members });

        // 空房间删除
        if (rooms[roomId].size === 0) {
            delete rooms[roomId];
        }

        console.log(`用户 ${username} 离开房间 ${roomId}`);
    }
});

// ====================== HTTP 接口 ======================
app.use(express.json());

const cors = require('cors');
app.use(cors());

app.post('/api/login', (req, res) => {
    const { username } = req.body;
    if (!username || !username.trim()) {
        return res.json({ code: 400, message: '用户名不能为空', data: null });
    }
    const name = username.trim();
    if (onlineUsers[name]) {
        return res.json({ code: 409, message: '该用户名已在线，请换一个', data: null });
    }
    res.json({ code: 200, message: '登录成功', data: { username: name } });
});

app.get('/api/online-users', (req, res) => {
    res.json({ code: 200, message: 'ok', data: Object.keys(onlineUsers) });
});

app.use(express.static('public'));

const PORT = 8989;
server.listen(PORT, () => {
    console.log(`信令服务器运行在 http://localhost:${PORT}`);
});
