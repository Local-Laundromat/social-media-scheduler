require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

// Import security middleware
const {
  configureHelmet,
  configureCORS,
  generalLimiter,
  authLimiter,
  aiLimiter,
  sanitizeInputs,
  securityLogger,
  securityErrorHandler,
  cookieParser
} = require('./middleware/security');

// Import routes and services
const apiRoutes = require('./routes/api'); // External API for OmniBroker/Sun Production
const authRoutes = require('./routes/auth'); // OAuth routes (Facebook/Instagram)
const authApiRoutes = require('./routes/authApi'); // Supabase Auth routes
const userRoutes = require('./routes/users'); // External user management API
const uploadRoutes = require('./routes/upload');
const aiCaptionRoutes = require('./routes/aiCaption');
const csvRoutes = require('./routes/csv');
const commentsRoutes = require('./routes/comments');
const reviewsRoutes = require('./routes/reviews'); // Google Business Reviews
const profileRoutes = require('./routes/profile'); // Profile settings including brand voice
const clientsRoutes = require('./routes/clients'); // Client management for agencies
const agentPostRoutes = require('./routes/agentPost'); // LangGraph autonomous agent
const ragCaptionRoutes = require('./routes/ragCaption'); // RAG-powered brand voice
const agentCommentsRoutes = require('./routes/agentComments'); // Multi-agent comment system
const contentPlannerRoutes = require('./routes/contentPlanner'); // Content planning agent
const scheduler = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// PROXY CONFIGURATION
// ============================================
// Trust proxy headers (required for Railway, Heroku, AWS, etc.)
app.set('trust proxy', 1);

// ============================================
// SECURITY MIDDLEWARE (Applied First)
// ============================================

// Security headers
app.use(configureHelmet());

// CORS protection
app.use(configureCORS());

// Cookie parsing (for httpOnly session cookies)
app.use(cookieParser);

// Body parsing
app.use(express.json({ limit: '10mb' })); // Limit payload size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization (XSS protection)
app.use(sanitizeInputs);

// Request logging (security audit trail)
app.use(securityLogger);

// General rate limiting (exclude static files)
app.use((req, res, next) => {
  // Skip rate limiting for static files
  if (req.path.startsWith('/js/') ||
      req.path.startsWith('/css/') ||
      req.path.startsWith('/images/') ||
      req.path.startsWith('/files/') ||
      req.path.startsWith('/uploads/') ||
      req.path.endsWith('.svg') ||
      req.path.endsWith('.ico') ||
      req.path.endsWith('.png') ||
      req.path.endsWith('.jpg') ||
      req.path.endsWith('.jpeg') ||
      req.path.endsWith('.gif') ||
      req.path.endsWith('.webp')) {
    return next();
  }
  generalLimiter(req, res, next);
});

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

// ============================================
// API ROUTES (with rate limiting)
// ============================================

// Authentication routes (no global rate limiting - applied per-route in authApi.js)
app.use('/api/auth', authApiRoutes);
app.use('/auth', authRoutes); // OAuth routes (Facebook/Instagram)

// AI-powered routes (AI usage rate limiting)
app.use('/api/agent', aiLimiter, agentPostRoutes);
app.use('/api/agent', aiLimiter, agentCommentsRoutes);
app.use('/api/rag', aiLimiter, ragCaptionRoutes);
app.use('/api/content-planner', aiLimiter, contentPlannerRoutes);
app.use('/api', aiLimiter, aiCaptionRoutes);

// Standard API routes (general rate limiting already applied globally)
app.use('/api', apiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/csv', csvRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/reviews', reviewsRoutes);

// Page routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
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

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/privacy.html'));
});

app.get('/data-deletion', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/data-deletion.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/terms.html'));
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

// ============================================
// ERROR HANDLING (Must be last)
// ============================================
app.use(securityErrorHandler);

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
