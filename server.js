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
    if (!roomId) return;
    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        chatHistory: [],
      };
    }
    socket.join(roomId);
    rooms[roomId].users.push(socket.id);
    console.log(`👤 کاربر ${socket.id} به اتاق ${roomId} پیوست`);

    // ارسال تاریخچه چت
    if (rooms[roomId].chatHistory.length > 0) {
      for (const msg of rooms[roomId].chatHistory.slice(-20)) {
        socket.emit('chat-message', msg);
      }
    }
    io.to(roomId).emit('user-count', rooms[roomId].users.length);
  });

  // ---------- رویدادهای ویدیو (فقط پخش به دیگران) ----------
  socket.on('video-play', ({ roomId, time }) => {
    if (!roomId || !rooms[roomId]) return;
    socket.to(roomId).emit('video-play', time);
  });

  socket.on('video-pause', ({ roomId, time }) => {
    if (!roomId || !rooms[roomId]) return;
    socket.to(roomId).emit('video-pause', time);
  });

  socket.on('video-seek', ({ roomId, time }) => {
    if (!roomId || !rooms[roomId]) return;
    socket.to(roomId).emit('video-seek', time);
  });

  // ---------- تنظیم ویدیو (وقتی کاربر اول لینک را وارد می‌کند) ----------
  socket.on('set-video', ({ roomId, videoUrl }) => {
    if (!roomId || !rooms[roomId]) return;
    socket.to(roomId).emit('video-set', videoUrl);
  });

  // ---------- چت ----------
  socket.on('chat-message', ({ roomId, username, message, time }) => {
    if (!roomId || !rooms[roomId]) return;
    const msgData = { username, message, time };
    rooms[roomId].chatHistory.push(msgData);
    if (rooms[roomId].chatHistory.length > 100) {
      rooms[roomId].chatHistory.shift();
    }
    io.to(roomId).emit('chat-message', msgData);
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
          console.log(`🧹 اتاق ${roomId} خالی شد`);
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
