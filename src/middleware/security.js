/**
 * Security Middleware
 * Comprehensive security hardening for production deployment
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const xss = require('xss');

/**
 * HTML Sanitization - Prevents XSS attacks
 */
function sanitizeHTML(dirty) {
  if (!dirty || typeof dirty !== 'string') return '';

  return xss(dirty, {
    whiteList: {
      b: [],
      i: [],
      em: [],
      strong: [],
      a: ['href', 'target'],
      p: [],
      br: []
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script']
  });
}

/**
 * Sanitize object recursively
 */
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const sanitized = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      sanitized[key] = sanitizeHTML(obj[key]);
    } else if (typeof obj[key] === 'object') {
      sanitized[key] = sanitizeObject(obj[key]);
    } else {
      sanitized[key] = obj[key];
    }
  }

  return sanitized;
}

/**
 * Helmet Configuration - Secure HTTP headers
 */
function configureHelmet() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://static.cloudflareinsights.com"
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: [
          "'self'",
          "https://api.openai.com",
          process.env.SUPABASE_URL,
          "https://cloudflareinsights.com"
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    frameguard: {
      action: 'deny'
    },
    noSniff: true,
    ieNoOpen: true,
    xssFilter: true
  });
}

/**
 * CORS Configuration
 */
function configureCORS() {
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];

  return cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) === -1) {
        return callback(new Error('CORS policy violation'), false);
      }

      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Set-Cookie'],
    maxAge: 600 // 10 minutes
  });
}

/**
 * Rate Limiting - Prevent brute force attacks
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again in 15 minutes.'
    });
  }
});

/**
 * Strict rate limiting for authentication endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many login attempts',
      code: 'AUTH_RATE_LIMIT',
      message: 'Account temporarily locked. Try again in 15 minutes.'
    });
  }
});

/**
 * Rate limiting for AI features (prevent API abuse)
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 AI requests per hour
  message: 'AI usage limit exceeded',
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'AI usage limit exceeded',
      code: 'AI_RATE_LIMIT',
      message: 'You\'ve made too many AI requests. Please wait an hour or upgrade your plan.'
    });
  }
});

/**
 * Input sanitization middleware
 */
function sanitizeInputs(req, res, next) {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  next();
}

/**
 * Request logging middleware (security audit trail)
 */
function securityLogger(req, res, next) {
  const timestamp = new Date().toISOString();
  const ip = req.ip || req.connection.remoteAddress;
  const userId = req.user?.id || 'anonymous';

  console.log(`[Security] ${timestamp} | ${req.method} ${req.path} | User: ${userId} | IP: ${ip}`);

  // Log sensitive operations
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    console.log(`[Security] Mutation operation: ${req.method} ${req.path}`);
  }

  next();
}

/**
 * Error handling middleware
 */
function securityErrorHandler(err, req, res, next) {
  console.error('[Security] Error:', err);

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(err.status || 500).json({
    success: false,
    error: isDevelopment ? err.message : 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    ...(isDevelopment && { stack: err.stack })
  });
}

module.exports = {
  sanitizeHTML,
  sanitizeObject,
  sanitizeInputs,
  configureHelmet,
  configureCORS,
  generalLimiter,
  authLimiter,
  aiLimiter,
  securityLogger,
  securityErrorHandler,
  cookieParser: cookieParser()
};
