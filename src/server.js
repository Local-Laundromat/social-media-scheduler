require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import routes and services
const apiRoutes = require('./routes/api'); // External API for OmniBroker/Sun Production
const authRoutes = require('./routes/auth'); // OAuth routes (Facebook/Instagram)
const authApiRoutes = require('./routes/authApi'); // Supabase Auth routes
const userRoutes = require('./routes/users'); // External user management API
const uploadRoutes = require('./routes/upload');
const aiCaptionRoutes = require('./routes/aiCaption');
const csvRoutes = require('./routes/csv');
const commentsRoutes = require('./routes/comments');
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

// Default browser request; serve SVG so we don't need a binary .ico file
app.get('/favicon.ico', (req, res) => {
  res.type('image/svg+xml');
  res.sendFile(path.join(__dirname, '../public/favicon.svg'));
});

// Some setups mistakenly request /dashboard.js; the real asset is /js/dashboard.js
app.get('/dashboard.js', (req, res) => {
  res.type('application/javascript; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/js/dashboard.js'));
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api', apiRoutes); // External API for OmniBroker/Sun Production
app.use('/api', aiCaptionRoutes);
app.use('/api/auth', authApiRoutes); // Supabase Auth (signup, login, password reset)
app.use('/api/users', userRoutes); // External user management
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

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/reset-password.html'));
});

app.get('/embed', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/embed.html'));
});

// Health check endpoint (used by dashboard Analytics to explain stuck "pending" posts)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    scheduler: scheduler.isRunning,
    publishing: {
      autoStartScheduler: process.env.AUTO_START_SCHEDULER === 'true',
      immediatePostOnCreate: process.env.IMMEDIATE_POST_ON_CREATE !== 'false',
    },
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

    // Drain due posts once shortly after boot (don't rely only on next cron tick)
    const drainDelayMs = parseInt(process.env.SCHEDULER_STARTUP_DRAIN_DELAY_MS || '3000', 10);
    setTimeout(() => {
      scheduler
        .processPendingPosts()
        .then((r) => {
          console.log(`✓ Startup queue drain: processed ${r.processed} post(s)`);
        })
        .catch((e) => console.error('✗ Startup queue drain failed:', e.message || e));
    }, drainDelayMs);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  scheduler.stop();
  console.log('Server stopped');
  process.exit(0);
});

module.exports = app;
