const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');
const telegramRoutes = require('./routes/telegram');

// Import socket handlers
const socketHandler = require('./socket/socketHandler');

// Import database connection
const { pool } = require('./config/database');

// Import Telegram Bot
const telegramBot = require('./services/telegramBot');

const app = express();
const server = http.createServer(app);

// Configure Socket.io with proper CORS
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["my-custom-header"],
    transports: ['websocket', 'polling'] // Allow both transports
  },
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/telegram', telegramRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Socket.io connection handling with error logging
io.on('connection', (socket) => {
  console.log('✅ New client connected:', socket.id);
  console.log('Total clients:', io.engine.clientsCount);
  
  socketHandler(socket, io);
  
  socket.on('disconnect', (reason) => {
    console.log('❌ Client disconnected:', socket.id, 'Reason:', reason);
  });
  
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================`);  
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔌 WebSocket server ready at ws://localhost:${PORT}`);
  console.log(`🌐 API URL: http://localhost:${PORT}/api`);
  console.log(`💾 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`=================================`);
});

module.exports = { app, io };