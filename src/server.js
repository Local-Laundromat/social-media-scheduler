require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import routes and services
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth'); // OAuth routes (Facebook/Instagram)
const authApiRoutes = require('./routes/authApi'); // Supabase Auth routes
const userRoutes = require('./routes/users');
const uploadRoutes = require('./routes/upload');
const aiCaptionRoutes = require('./routes/aiCaption');
const csvRoutes = require('./routes/csv');
const commentsRoutes = require('./routes/comments');
const db = require('./database/db');
const scheduler = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api', apiRoutes);
app.use('/api', aiCaptionRoutes);
app.use('/api/auth', authApiRoutes); // Supabase Auth (signup, login, password reset)
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/csv', csvRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/auth', authRoutes); // OAuth routes (Facebook/Instagram)

// Page routes
app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

app.get('/embed', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/embed.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    scheduler: scheduler.isRunning,
  });
});

// Serve uploaded files (for Instagram public URLs)
app.use('/files', express.static(process.env.MEDIA_FOLDER || '/Users/aminatamansaray/Downloads/PK Property/Combined Social Media Posts'));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   Social Media Scheduler API Server       ║
║                                            ║
║   Server running on: http://localhost:${PORT}  ║
║   Dashboard: http://localhost:${PORT}          ║
║                                            ║
║   Status: ✓ Ready                          ║
╚════════════════════════════════════════════╝
  `);

  // Auto-start scheduler if configured
  if (process.env.AUTO_START_SCHEDULER === 'true') {
    const cronExpression = process.env.CRON_SCHEDULE || '0 * * * *';
    scheduler.start(cronExpression);
    console.log(`✓ Scheduler auto-started with cron: ${cronExpression}`);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  scheduler.stop();
  db.close(() => {
    console.log('Database connection closed');
    process.exit(0);
  });
});

module.exports = app;
