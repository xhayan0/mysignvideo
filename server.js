const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
  console.log('🔗 کاربر متصل شد:', socket.id);

  socket.on('join-room', (roomId) => {
    if (!roomId || typeof roomId !== 'string') {
      console.log('⚠️ roomId نامعتبر:', roomId);
      return;
    }

    if (!rooms[roomId]) {
      rooms[roomId] = {
        videoUrl: null,
        currentTime: 0,
        isPlaying: false,
        users: [],
        chatHistory: [],
        lastSyncTime: Date.now(),
      };
    }

    socket.join(roomId);
    rooms[roomId].users.push(socket.id);
    console.log(`👤 کاربر ${socket.id} به اتاق ${roomId} پیوست (${rooms[roomId].users.length} نفر)`);

    const room = rooms[roomId];
    // ارسال وضعیت با تایم‌استمپ سرور
    socket.emit('room-state', {
      videoUrl: room.videoUrl,
      currentTime: room.currentTime,
      isPlaying: room.isPlaying,
      users: room.users,
      serverTime: Date.now(),
    });

    // ارسال تاریخچه چت
    if (room.chatHistory && room.chatHistory.length > 0) {
      for (const msg of room.chatHistory.slice(-20)) {
        socket.emit('chat-message', msg);
      }
    }

    io.to(roomId).emit('user-count', room.users.length);
    socket.to(roomId).emit('user-joined', socket.id);
  });

  // تنظیم ویدیو
  socket.on('set-video', ({ roomId, videoUrl }) => {
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId].videoUrl = videoUrl;
    rooms[roomId].currentTime = 0;
    rooms[roomId].isPlaying = false;
    rooms[roomId].lastSyncTime = Date.now();
    io.to(roomId).emit('video-set', { videoUrl, serverTime: Date.now() });
    console.log(`🎬 ویدیو برای اتاق ${roomId} تنظیم شد`);
  });

  // پخش
  socket.on('play', ({ roomId, time }) => {
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId].isPlaying = true;
    rooms[roomId].currentTime = time || 0;
    rooms[roomId].lastSyncTime = Date.now();
    socket.to(roomId).emit('play', {
      time: rooms[roomId].currentTime,
      serverTime: Date.now(),
    });
  });

  // توقف
  socket.on('pause', ({ roomId, time }) => {
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId].isPlaying = false;
    rooms[roomId].currentTime = time || 0;
    rooms[roomId].lastSyncTime = Date.now();
    socket.to(roomId).emit('pause', {
      time: rooms[roomId].currentTime,
      serverTime: Date.now(),
    });
  });

  // سیك
  socket.on('seek', ({ roomId, time }) => {
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId].currentTime = time || 0;
    rooms[roomId].lastSyncTime = Date.now();
    socket.to(roomId).emit('seek', {
      time: rooms[roomId].currentTime,
      serverTime: Date.now(),
    });
  });

  // چت
  socket.on('chat-message', ({ roomId, username, message, time }) => {
    if (!roomId || !rooms[roomId]) return;
    const msgData = {
      username: username || 'ناشناس',
      message: message || '',
      time: time || new Date().toLocaleTimeString('fa-IR'),
    };
    rooms[roomId].chatHistory.push(msgData);
    if (rooms[roomId].chatHistory.length > 100) {
      rooms[roomId].chatHistory.shift();
    }
    io.to(roomId).emit('chat-message', msgData);
  });

  // درخواست همگام‌سازی (برای جلوگیری از انحراف)
  socket.on('sync-request', ({ roomId, clientTime }) => {
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    socket.emit('sync-response', {
      currentTime: room.currentTime,
      isPlaying: room.isPlaying,
      serverTime: Date.now(),
      clientTime: clientTime,
    });
  });

  socket.on('disconnect', () => {
    console.log(`❌ کاربر ${socket.id} قطع شد`);
    for (const roomId in rooms) {
      const index = rooms[roomId].users.indexOf(socket.id);
      if (index > -1) {
        rooms[roomId].users.splice(index, 1);
        io.to(roomId).emit('user-count', rooms[roomId].users.length);
        if (rooms[roomId].users.length === 0) {
          delete rooms[roomId];
          console.log(`🧹 اتاق ${roomId} خالی شد و حذف گردید`);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 سرور روشن شد => http://localhost:${PORT}`);
});
