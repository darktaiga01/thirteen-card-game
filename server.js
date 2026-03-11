const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { setupSocketHandlers } = require('./src/sockets/socketHandlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// Initialize game socket handlers
setupSocketHandlers(io);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let lanIP = 'localhost';

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        lanIP = net.address;
        break;
      }
    }
  }

  console.log(`\n🃏 Tiến Lên Server Running`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   LAN:     http://${lanIP}:${PORT}\n`);
});
