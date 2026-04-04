/**
 * Supabase query helpers for resolving which Facebook/Instagram account row to use.
 * Used by scheduler.getCredentials — keep in sync when changing posting logic.
 */

function applyFacebookAccountFilter(query, post, profile) {
  if (post.facebook_account_id != null && post.facebook_account_id !== '') {
    return query.eq('id', post.facebook_account_id);
  }
  if (profile.team_id) {
    return query.or(`user_id.eq.${post.user_id},team_id.eq.${profile.team_id}`);
  }
  return query.eq('user_id', post.user_id);
}

function applyInstagramAccountFilter(query, post, profile) {
  if (post.instagram_account_id != null && post.instagram_account_id !== '') {
    return query.eq('id', post.instagram_account_id);
  }
  if (profile.team_id) {
    return query.or(`user_id.eq.${post.user_id},team_id.eq.${profile.team_id}`);
  }
  return query.eq('user_id', post.user_id);
}

module.exports = {
  applyFacebookAccountFilter,
  applyInstagramAccountFilter,
};
