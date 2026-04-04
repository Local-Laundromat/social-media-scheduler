const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Supabase Database Helper
 * Clean, modern helper for all database operations
 */

// ============================================
// PROFILES
// ============================================

async function getProfileById(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // Ignore "not found" errors
  return data;
}

async function createProfile(profileData) {
  const { data, error } = await supabase
    .from('profiles')
    .insert(profileData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================
// FACEBOOK ACCOUNTS
// ============================================

async function saveFacebookAccount(userId, pageData) {
  const { page_id, page_name, access_token } = pageData;

  const { data, error} = await supabase
    .from('facebook_accounts')
    .upsert({
      user_id: userId,
      page_id: page_id,
      page_name: page_name,
      access_token: access_token,
      is_active: true,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,page_id',
      ignoreDuplicates: false
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getFacebookAccounts(userId) {
  const { data, error } = await supabase
    .from('facebook_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) throw error;
  return data;
}

// ============================================
// INSTAGRAM ACCOUNTS
// ============================================

async function saveInstagramAccount(userId, instagramData) {
  const { account_id, username, access_token } = instagramData;

  const { data, error } = await supabase
    .from('instagram_accounts')
    .upsert({
      user_id: userId,
      account_id: account_id,
      username: username,
      access_token: access_token,
      is_active: true,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,account_id',
      ignoreDuplicates: false
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getInstagramAccounts(userId) {
  const { data, error } = await supabase
    .from('instagram_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) throw error;
  return data;
}

// ============================================
// TIKTOK ACCOUNTS
// ============================================

async function saveTikTokAccount(userId, tiktokData) {
  const { open_id, username, access_token, refresh_token } = tiktokData;

  const { data, error } = await supabase
    .from('tiktok_accounts')
    .upsert({
      user_id: userId,
      open_id: open_id,
      username: username,
      access_token: access_token,
      refresh_token: refresh_token,
      is_active: true,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,open_id',
      ignoreDuplicates: false
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getTikTokAccounts(userId) {
  const { data, error } = await supabase
    .from('tiktok_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) throw error;
  return data;
}

// ============================================
// POSTS
// ============================================

async function createPost(postData) {
  const { data, error } = await supabase
    .from('posts')
    .insert(postData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getPostById(postId) {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (error) throw error;
  return data;
}

async function getPostsByUser(userId, filters = {}) {
  let query = supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

async function updatePost(postId, updates) {
  const { data, error } = await supabase
    .from('posts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', postId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getScheduledPosts() {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_time', new Date().toISOString())
    .order('scheduled_time', { ascending: true });

  if (error) throw error;
  return data;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  supabase,

  // Profiles
  getProfileById,
  createProfile,
  updateProfile,

  // Facebook
  saveFacebookAccount,
  getFacebookAccounts,

  // Instagram
  saveInstagramAccount,
  getInstagramAccounts,

  // TikTok
  saveTikTokAccount,
  getTikTokAccounts,

  // Posts
  createPost,
  getPostById,
  getPostsByUser,
  updatePost,
  getScheduledPosts,
};
