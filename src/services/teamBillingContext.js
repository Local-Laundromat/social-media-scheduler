const { supabase } = require('../database/supabase');

/**
 * Stripe subscription + quota rows live on profiles.
 * Teams share billing: whoever created the team (teams.created_by) is the payer;
 * teammates should see entitlements against that profile, not their own blank row.
 */

async function fetchProfileTeam(actorUserId) {
  const { data } = await supabase
    .from('profiles')
    .select('id, team_id, role')
    .eq('id', actorUserId)
    .maybeSingle();
  return data || null;
}

/**
 * UUID of profiles row that owns Stripe customer + subscription counters (team owner).
 */
async function resolveStripeBillingProfileId(actorUserId) {
  const p = await fetchProfileTeam(actorUserId);
  if (!p?.team_id) return actorUserId;
  const { data: team } = await supabase
    .from('teams')
    .select('created_by')
    .eq('id', p.team_id)
    .maybeSingle();
  const owner = team?.created_by;
  return owner ? String(owner) : actorUserId;
}

async function listTeamMemberProfileIds(teamId) {
  const { data, error } = await supabase.from('profiles').select('id').eq('team_id', teamId);
  if (error) {
    console.warn('[teamBilling] listTeamMemberProfileIds:', error.message);
    return [];
  }
  const ids = (data || []).map((r) => r.id).filter(Boolean);
  return ids.length ? ids.map(String) : [];
}

/**
 * @returns {{
 *   actorUserId: string,
 *   billingProfileId: string,
 *   teamId: string|number|null,
 *   role: string|null,
 *   memberProfileIds: string[],
 *   canManageStripe: boolean
 * }}
 */
async function getBillingContext(actorUserId) {
  const actor = await fetchProfileTeam(actorUserId);
  let billingProfileId = actorUserId;
  /** @type {string[]} */
  let memberProfileIds = [actorUserId];

  if (actor?.team_id != null && actor.team_id !== '') {
    const { data: team } = await supabase
      .from('teams')
      .select('created_by')
      .eq('id', actor.team_id)
      .maybeSingle();

    billingProfileId = team?.created_by ? String(team.created_by) : actorUserId;

    memberProfileIds = await listTeamMemberProfileIds(actor.team_id);
    if (!memberProfileIds.length) memberProfileIds = [actorUserId];
  }

  const canManageStripe = billingProfileId === String(actorUserId);

  return {
    actorUserId: String(actorUserId),
    billingProfileId: String(billingProfileId),
    teamId: actor?.team_id ?? null,
    role: actor?.role ?? null,
    memberProfileIds,
    canManageStripe,
  };
}

module.exports = {
  fetchProfileTeam,
  resolveStripeBillingProfileId,
  getBillingContext,
  listTeamMemberProfileIds,
};
