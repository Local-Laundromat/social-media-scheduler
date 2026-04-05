/**
 * Supabase Client for Frontend
 * Handles authentication using Supabase Auth
 */

// Load Supabase from CDN (add this script tag to your HTML)
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

const SUPABASE_URL = 'https://nnvxkooiwyrlqbxhqxac.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5udnhrb29pd3lybHFieGhxeGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Njg3ODYsImV4cCI6MjA4OTM0NDc4Nn0.aRFw3ysejLtacYxT1b6ulQa_OFeD2cwnF752ig_6mzA';

// Auth below uses /api/auth/* via fetch and does not need a browser Supabase client.
// If you need supabase-js (Realtime, etc.), load the CDN script from the comment at the top, then:
//   const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Auth Helper Functions
 */

// Sign up new user
async function signUp(email, password, name, teamName, inviteCode) {
  try {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password, name, teamName, inviteCode })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Signup failed');
    }

    // Store session
    if (data.session) {
      localStorage.setItem('supabase_session', JSON.stringify(data.session));
      localStorage.setItem('auth_token', data.session.access_token);
    }

    return data;
  } catch (error) {
    console.error('Signup error:', error);
    throw error;
  }
}

// Sign in existing user
async function signIn(email, password) {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // Store session
    if (data.session) {
      localStorage.setItem('supabase_session', JSON.stringify(data.session));
      localStorage.setItem('auth_token', data.session.access_token);
    }

    return data;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

// Sign out
async function signOut() {
  try {
    const token = localStorage.getItem('auth_token');

    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    // Clear local storage
    localStorage.removeItem('supabase_session');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');

    // Redirect to login
    window.location.href = '/login';
  } catch (error) {
    console.error('Logout error:', error);
    // Clear storage anyway
    localStorage.clear();
    window.location.href = '/login';
  }
}

// Get current session
function getSession() {
  const sessionStr = localStorage.getItem('supabase_session');
  return sessionStr ? JSON.parse(sessionStr) : null;
}

// Get auth token
function getToken() {
  return localStorage.getItem('auth_token');
}

// Check if user is authenticated
async function isAuthenticated() {
  const token = getToken();

  if (!token) {
    return false;
  }

  try {
    const response = await fetch('/api/auth/verify', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    return data.valid === true;
  } catch (error) {
    console.error('Auth check error:', error);
    return false;
  }
}

// Get current user info
async function getCurrentUser() {
  const token = getToken();

  if (!token) {
    return null;
  }

  try {
    const response = await fetch('/api/auth/verify', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (data.valid) {
      return data.user;
    }

    return null;
  } catch (error) {
    console.error('Get user error:', error);
    return null;
  }
}

// Request password reset
async function requestPasswordReset(email) {
  try {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Password reset request failed');
    }

    return data;
  } catch (error) {
    console.error('Password reset error:', error);
    throw error;
  }
}

// Reset password
async function resetPassword(newPassword) {
  try {
    const token = getToken();

    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ newPassword })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Password reset failed');
    }

    return data;
  } catch (error) {
    console.error('Reset password error:', error);
    throw error;
  }
}

// Protected route guard (call on page load)
async function requireAuth() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    window.location.href = '/login';
    return false;
  }

  return true;
}

// API request helper with auth
async function apiRequest(url, options = {}) {
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  // Handle 401 (unauthorized)
  if (response.status === 401) {
    // Token expired or invalid, redirect to login
    localStorage.clear();
    window.location.href = '/login';
    throw new Error('Authentication required');
  }

  return response;
}

// Export for use in other files
window.SupabaseAuth = {
  signUp,
  signIn,
  signOut,
  getSession,
  getToken,
  isAuthenticated,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
  requireAuth,
  apiRequest
};
