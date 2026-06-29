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

  socket.on('create-room', (roomId) => {
    if (!roomId) return;
    if (!rooms[roomId]) {
      rooms[roomId] = {
        hostId: socket.id,
        videoUrl: null,
        currentTime: 0,
        isPlaying: false,
        users: [],
        chatHistory: [],
      };
    }
    socket.join(roomId);
    rooms[roomId].users.push(socket.id);
    socket.emit('host-status', true); // به کاربر می‌گوید که میزبان است
    console.log(`👤 میزبان ${socket.id} اتاق ${roomId} را ساخت`);
  });

  socket.on('join-room', (roomId) => {
    if (!roomId || !rooms[roomId]) return;
    socket.join(roomId);
    rooms[roomId].users.push(socket.id);
    // ارسال وضعیت فعلی به کاربر جدید
    const room = rooms[roomId];
    socket.emit('sync-state', {
      videoUrl: room.videoUrl,
      currentTime: room.currentTime,
      isPlaying: room.isPlaying,
    });
    // ارسال تاریخچه چت
    for (const msg of room.chatHistory.slice(-20)) {
      socket.emit('chat-message', msg);
    }
    io.to(roomId).emit('user-count', rooms[roomId].users.length);
    console.log(`👤 کاربر ${socket.id} به اتاق ${roomId} پیوست`);
  });

  // ---------- رویدادهای میزبان ----------
  socket.on('set-video', ({ roomId, videoUrl }) => {
    if (!roomId || !rooms[roomId] || rooms[roomId].hostId !== socket.id) return;
    rooms[roomId].videoUrl = videoUrl;
    rooms[roomId].currentTime = 0;
    rooms[roomId].isPlaying = false;
    io.to(roomId).emit('sync-state', {
      videoUrl: videoUrl,
      currentTime: 0,
      isPlaying: false,
    });
    console.log(`🎬 میزبان ویدیو را برای اتاق ${roomId} تنظیم کرد`);
  });

  socket.on('host-play', ({ roomId, time }) => {
    if (!roomId || !rooms[roomId] || rooms[roomId].hostId !== socket.id) return;
    rooms[roomId].isPlaying = true;
    rooms[roomId].currentTime = time;
    io.to(roomId).emit('sync-state', {
      videoUrl: rooms[roomId].videoUrl,
      currentTime: time,
      isPlaying: true,
    });
  });

  socket.on('host-pause', ({ roomId, time }) => {
    if (!roomId || !rooms[roomId] || rooms[roomId].hostId !== socket.id) return;
    rooms[roomId].isPlaying = false;
    rooms[roomId].currentTime = time;
    io.to(roomId).emit('sync-state', {
      videoUrl: rooms[roomId].videoUrl,
      currentTime: time,
      isPlaying: false,
    });
  });

  socket.on('host-seek', ({ roomId, time }) => {
    if (!roomId || !rooms[roomId] || rooms[roomId].hostId !== socket.id) return;
    rooms[roomId].currentTime = time;
    io.to(roomId).emit('sync-state', {
      videoUrl: rooms[roomId].videoUrl,
      currentTime: time,
      isPlaying: rooms[roomId].isPlaying,
    });
  });

  // ---------- چت (همه کاربران) ----------
  socket.on('chat-message', ({ roomId, username, message, time }) => {
    if (!roomId || !rooms[roomId]) return;
    const msgData = { username, message, time };
    rooms[roomId].chatHistory.push(msgData);
    if (rooms[roomId].chatHistory.length > 100) rooms[roomId].chatHistory.shift();
    io.to(roomId).emit('chat-message', msgData);
  });

  socket.on('disconnect', () => {
    console.log(`❌ کاربر ${socket.id} قطع شد`);
    for (const roomId in rooms) {
      const index = rooms[roomId].users.indexOf(socket.id);
      if (index > -1) {
        rooms[roomId].users.splice(index, 1);
        io.to(roomId).emit('user-count', rooms[roomId].users.length);
        // اگر میزبان قطع کرد، اتاق را حذف کن
        if (rooms[roomId].hostId === socket.id) {
          delete rooms[roomId];
          console.log(`🧹 اتاق ${roomId} به دلیل خروج میزبان حذف شد`);
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
