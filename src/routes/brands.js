/**
 * Brand Profiles API Routes
 * Manages brand profiles for multi-client agencies and solo users
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

/** PostgREST filter: user's personal brands OR brands owned by user's teams */
function brandAccessOrFilter(userId) {
  return `user_id.eq.${userId},team_id.in.(select team_id from team_members where user_id='${userId}')`;
}

/** When `brand_profile_stats` view is missing, return rows shaped like the view for the UI */
function augmentBrandProfileRows(rows) {
  return (rows || []).map((bp) => ({
    ...bp,
    facebook_accounts_count: bp.facebook_accounts_count ?? 0,
    instagram_accounts_count: bp.instagram_accounts_count ?? 0,
    tiktok_accounts_count: bp.tiktok_accounts_count ?? 0,
    total_social_accounts: bp.total_social_accounts ?? 0,
    posts_count: bp.posts_count ?? 0,
    scheduled_posts_count: bp.scheduled_posts_count ?? 0,
    posted_posts_count: bp.posted_posts_count ?? 0,
    failed_posts_count: bp.failed_posts_count ?? 0
  }));
}

/**
 * Prefer `brand_profile_stats`; if migrations are incomplete that view/query may fail —
 * fall back to `brand_profiles` so POST/create still flows end-to-end.
 */
async function listBrandsWithFallback(userId) {
  const stats = await supabase
    .from('brand_profile_stats')
    .select('*')
    .or(brandAccessOrFilter(userId))
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (!stats.error) {
    return { data: stats.data || [], error: null };
  }

  console.warn('[api/brands] brand_profile_stats unavailable; using brand_profiles:', stats.error.message || stats.error);

  const inclusive = await supabase
    .from('brand_profiles')
    .select('*')
    .or(brandAccessOrFilter(userId))
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (!inclusive.error) {
    return { data: augmentBrandProfileRows(inclusive.data), error: null };
  }

  console.warn('[api/brands] team/subquery fetch failed; solo user fallback:', inclusive.error.message || inclusive.error);

  const solo = await supabase
    .from('brand_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (!solo.error) {
    return { data: augmentBrandProfileRows(solo.data), error: null };
  }

  return { data: null, error: solo.error };
}

async function getBrandWithFallback(userId, brandId) {
  const stats = await supabase
    .from('brand_profile_stats')
    .select('*')
    .eq('id', brandId)
    .or(brandAccessOrFilter(userId))
    .maybeSingle();

  if (!stats.error && stats.data) {
    return { data: stats.data, error: null };
  }

  if (stats.error) {
    console.warn('[api/brands] brand_profile_stats lookup failed; using brand_profiles:', stats.error.message || stats.error);
  }

  const inclusive = await supabase
    .from('brand_profiles')
    .select('*')
    .eq('id', brandId)
    .or(brandAccessOrFilter(userId))
    .maybeSingle();

  if (!inclusive.error && inclusive.data) {
    return { data: augmentBrandProfileRows([inclusive.data])[0], error: null };
  }

  if (inclusive.error) {
    console.warn('[api/brands] team/subquery lookup failed; solo:', inclusive.error.message || inclusive.error);
  }

  const solo = await supabase
    .from('brand_profiles')
    .select('*')
    .eq('id', brandId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!solo.error && solo.data) {
    return { data: augmentBrandProfileRows([solo.data])[0], error: null };
  }

  return { data: null, error: solo.error || inclusive.error || stats.error };
}

/** Include Supabase/Postgres details in logs and JSON when create/update fails */
function supabaseMutationError(status, message, sbError, res) {
  const hint = sbError?.hint || sbError?.details || '';
  console.error(`${message}`, sbError);
  const body = {
    error: message,
    details: sbError?.message || String(sbError)
  };
  if (hint) body.hint = hint;
  if (sbError?.code) body.code = sbError.code;
  return res.status(status).json(body);
}

// Middleware to verify authentication
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  next();
};

// ============================================
// GET /api/brands - List all brands for user
// ============================================
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: brands, error } = await listBrandsWithFallback(userId);

    if (error) {
      console.error('Error fetching brands:', error);
      return res.status(500).json({
        error: 'Failed to fetch brands',
        details: error.message || String(error),
        ...(error.code ? { code: error.code } : {})
      });
    }

    res.json({ brands: brands || [] });
  } catch (error) {
    console.error('Error in GET /api/brands:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// GET /api/brands/:id - Get single brand
// ============================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const brandId = req.params.id;

    const { data: brand, error } = await getBrandWithFallback(userId, brandId);

    if (error || !brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    res.json({ brand });
  } catch (error) {
    console.error('Error in GET /api/brands/:id:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// POST /api/brands - Create new brand
// ============================================
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      description,
      team_id,
      brand_voice,
      logo_url,
      brand_colors
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Brand name is required' });
    }

    // Create brand (slug auto-generated by trigger)
    const brandData = {
      name,
      description: description || null,
      user_id: team_id ? null : userId, // If team, user_id is null
      team_id: team_id || null,         // If no team, team_id is null
      brand_voice: brand_voice || {},
      logo_url: logo_url || null,
      brand_colors: brand_colors || [],
      is_active: true
    };

    const { data: brand, error } = await supabase
      .from('brand_profiles')
      .insert([brandData])
      .select()
      .single();

    if (error) {
      return supabaseMutationError(500, 'Failed to create brand', error, res);
    }

    res.status(201).json({ brand });
  } catch (error) {
    console.error('Error in POST /api/brands:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// PUT /api/brands/:id - Update brand
// ============================================
router.put('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const brandId = req.params.id;
    const {
      name,
      description,
      brand_voice,
      logo_url,
      brand_colors,
      is_active
    } = req.body;

    // Check if user can manage this brand
    const { data: canManage } = await supabase
      .rpc('user_can_manage_brand', {
        p_user_id: userId,
        p_brand_id: parseInt(brandId)
      });

    if (!canManage) {
      return res.status(403).json({ error: 'You do not have permission to update this brand' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (brand_voice !== undefined) updateData.brand_voice = brand_voice;
    if (logo_url !== undefined) updateData.logo_url = logo_url;
    if (brand_colors !== undefined) updateData.brand_colors = brand_colors;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data: brand, error } = await supabase
      .from('brand_profiles')
      .update(updateData)
      .eq('id', brandId)
      .select()
      .single();

    if (error) {
      return supabaseMutationError(500, 'Failed to update brand', error, res);
    }

    res.json({ brand });
  } catch (error) {
    console.error('Error in PUT /api/brands/:id:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// DELETE /api/brands/:id - Delete brand
// ============================================
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const brandId = req.params.id;

    // Check if user can manage this brand
    const { data: canManage } = await supabase
      .rpc('user_can_manage_brand', {
        p_user_id: userId,
        p_brand_id: parseInt(brandId)
      });

    if (!canManage) {
      return res.status(403).json({ error: 'You do not have permission to delete this brand' });
    }

    const { error } = await supabase
      .from('brand_profiles')
      .delete()
      .eq('id', brandId);

    if (error) {
      console.error('Error deleting brand:', error);
      return res.status(500).json({ error: 'Failed to delete brand' });
    }

    res.json({ message: 'Brand deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/brands/:id:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// GET /api/brands/:id/accounts - Get brand's social accounts
// ============================================
router.get('/:id/accounts', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const brandId = req.params.id;

    // Verify user can access this brand
    const { data: brand } = await supabase
      .from('brand_profiles')
      .select('id')
      .eq('id', brandId)
      .or(`user_id.eq.${userId},team_id.in.(select team_id from team_members where user_id='${userId}')`)
      .single();

    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    // Get all social accounts for this brand
    const [fbAccounts, igAccounts, ttAccounts] = await Promise.all([
      supabase.from('facebook_accounts').select('*').eq('brand_profile_id', brandId),
      supabase.from('instagram_accounts').select('*').eq('brand_profile_id', brandId),
      supabase.from('tiktok_accounts').select('*').eq('brand_profile_id', brandId)
    ]);

    const accounts = {
      facebook: fbAccounts.data || [],
      instagram: igAccounts.data || [],
      tiktok: ttAccounts.data || []
    };

    res.json({ accounts });
  } catch (error) {
    console.error('Error in GET /api/brands/:id/accounts:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// POST /api/brands/:id/accounts/:platform/:accountId - Link account to brand
// ============================================
router.post('/:id/accounts/:platform/:accountId', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: brandId, platform, accountId } = req.params;

    // Check if user can manage this brand
    const { data: canManage } = await supabase
      .rpc('user_can_manage_brand', {
        p_user_id: userId,
        p_brand_id: parseInt(brandId)
      });

    if (!canManage) {
      return res.status(403).json({ error: 'You do not have permission to manage this brand' });
    }

    // Determine the table name
    const tableMap = {
      facebook: 'facebook_accounts',
      instagram: 'instagram_accounts',
      tiktok: 'tiktok_accounts'
    };

    const tableName = tableMap[platform];
    if (!tableName) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    // Update the account
    const { data: account, error } = await supabase
      .from(tableName)
      .update({ brand_profile_id: brandId })
      .eq('id', accountId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error linking account to brand:', error);
      return res.status(500).json({ error: 'Failed to link account to brand' });
    }

    res.json({ account });
  } catch (error) {
    console.error('Error in POST /api/brands/:id/accounts/:platform/:accountId:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// DELETE /api/brands/:id/accounts/:platform/:accountId - Unlink account from brand
// ============================================
router.delete('/:id/accounts/:platform/:accountId', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: brandId, platform, accountId } = req.params;

    // Check if user can manage this brand
    const { data: canManage } = await supabase
      .rpc('user_can_manage_brand', {
        p_user_id: userId,
        p_brand_id: parseInt(brandId)
      });

    if (!canManage) {
      return res.status(403).json({ error: 'You do not have permission to manage this brand' });
    }

    // Determine the table name
    const tableMap = {
      facebook: 'facebook_accounts',
      instagram: 'instagram_accounts',
      tiktok: 'tiktok_accounts'
    };

    const tableName = tableMap[platform];
    if (!tableName) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    // Update the account (set brand_profile_id to null)
    const { data: account, error } = await supabase
      .from(tableName)
      .update({ brand_profile_id: null })
      .eq('id', accountId)
      .eq('brand_profile_id', brandId)
      .select()
      .single();

    if (error) {
      console.error('Error unlinking account from brand:', error);
      return res.status(500).json({ error: 'Failed to unlink account from brand' });
    }

    res.json({ account });
  } catch (error) {
    console.error('Error in DELETE /api/brands/:id/accounts/:platform/:accountId:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
