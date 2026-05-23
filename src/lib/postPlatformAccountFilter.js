/**
 * Single place for mapping ?platform=&accountId= to posts table columns.
 * Keep in sync with dashboard global account switcher and social post rows.
 *
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder} query
 * @returns {import('@supabase/supabase-js').PostgrestFilterBuilder}
 */
function applyPostPlatformAccountFilter(query, platform, accountId) {
  if (!platform || accountId === undefined || accountId === null || accountId === '') {
    return query;
  }
  const aid = String(accountId);

  switch (String(platform).toLowerCase()) {
    case 'facebook':
      return query.eq('facebook_page_id', aid);
    case 'instagram':
      return query.eq('instagram_account_id', aid);
    case 'tiktok':
      return query.eq('tiktok_open_id', aid);
    case 'pinterest':
      return query.eq('pinterest_user_id', aid);
    case 'youtube':
      return query.eq('youtube_channel_id', aid);
    case 'google_business':
    case 'google':
      return query.eq('google_business_location_id', aid);
    default:
      return query;
  }
}

module.exports = { applyPostPlatformAccountFilter };
