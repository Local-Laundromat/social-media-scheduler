const express = require('express');
const router = express.Router();
const { supabase } = require('../database/supabase');
const { authenticateSupabase } = require('../middleware/auth');

/**
 * POST /api/teams - Create a new team
 * Authenticated users only
 */
router.post('/', authenticateSupabase, async (req, res) => {
  const { name, description } = req.body;
  const userId = req.userId;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Team name is required' });
  }

  try {
    // Generate unique slug
    const { data: slugData, error: slugError } = await supabase
      .rpc('generate_team_slug', { team_name: name });

    if (slugError) throw slugError;

    // Create team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        name: name.trim(),
        slug: slugData,
        owner_id: userId,
        description: description?.trim() || null
      })
      .select()
      .single();

    if (teamError) throw teamError;

    // Auto-add owner as team member happens via trigger
    // Update user's profile to set team_id
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ team_id: team.id })
      .eq('id', userId);

    if (profileError) throw profileError;

    res.json({
      success: true,
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        description: team.description,
        owner_id: team.owner_id,
        created_at: team.created_at
      }
    });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/teams - List user's teams
 * Returns teams where user is a member
 */
router.get('/', authenticateSupabase, async (req, res) => {
  const userId = req.userId;

  try {
    // Get teams where user is a member
    const { data: memberships, error: memberError } = await supabase
      .from('team_members')
      .select('team_id, role, joined_at')
      .eq('user_id', userId);

    if (memberError) throw memberError;

    if (!memberships || memberships.length === 0) {
      return res.json({ teams: [] });
    }

    const teamIds = memberships.map(m => m.team_id);

    // Get team details
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id, name, slug, description, owner_id, created_at')
      .in('id', teamIds);

    if (teamsError) throw teamsError;

    // Combine with membership info
    const teamsWithRole = teams.map(team => {
      const membership = memberships.find(m => m.team_id === team.id);
      return {
        ...team,
        role: membership.role,
        joined_at: membership.joined_at,
        is_owner: team.owner_id === userId
      };
    });

    res.json({ teams: teamsWithRole });
  } catch (error) {
    console.error('List teams error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/teams/:teamId - Get team details
 * Must be a team member
 */
router.get('/:teamId', authenticateSupabase, async (req, res) => {
  const userId = req.userId;
  const teamId = parseInt(req.params.teamId, 10);

  if (!Number.isFinite(teamId)) {
    return res.status(400).json({ error: 'Invalid team ID' });
  }

  try {
    // Verify user is team member
    const { data: membership, error: memberError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .single();

    if (memberError || !membership) {
      return res.status(403).json({ error: 'You are not a member of this team' });
    }

    // Get team details
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Get team members
    const { data: members, error: membersError } = await supabase
      .from('team_member_details')
      .select('*')
      .eq('team_id', teamId);

    if (membersError) throw membersError;

    // Get pending invitations (only for admins/owners)
    let invitations = [];
    if (['owner', 'admin'].includes(membership.role)) {
      const { data: invData, error: invError } = await supabase
        .from('team_invitations')
        .select('id, email, role, status, created_at, expires_at')
        .eq('team_id', teamId)
        .eq('status', 'pending');

      if (!invError) {
        invitations = invData || [];
      }
    }

    res.json({
      team,
      members: members || [],
      invitations,
      user_role: membership.role
    });
  } catch (error) {
    console.error('Get team details error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/teams/:teamId - Update team
 * Owner only
 */
router.put('/:teamId', authenticateSupabase, async (req, res) => {
  const userId = req.userId;
  const teamId = parseInt(req.params.teamId, 10);
  const { name, description } = req.body;

  if (!Number.isFinite(teamId)) {
    return res.status(400).json({ error: 'Invalid team ID' });
  }

  try {
    // Verify user is team owner
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('owner_id')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    if (team.owner_id !== userId) {
      return res.status(403).json({ error: 'Only team owner can update team settings' });
    }

    const updates = {};
    if (name && name.trim()) {
      updates.name = name.trim();
      // Generate new slug if name changed
      const { data: slugData } = await supabase
        .rpc('generate_team_slug', { team_name: name.trim() });
      if (slugData) updates.slug = slugData;
    }
    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }
    updates.updated_at = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('teams')
      .update(updates)
      .eq('id', teamId);

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Team updated successfully' });
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/teams/:teamId - Delete team
 * Owner only
 */
router.delete('/:teamId', authenticateSupabase, async (req, res) => {
  const userId = req.userId;
  const teamId = parseInt(req.params.teamId, 10);

  if (!Number.isFinite(teamId)) {
    return res.status(400).json({ error: 'Invalid team ID' });
  }

  try {
    // Verify user is team owner
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('owner_id')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    if (team.owner_id !== userId) {
      return res.status(403).json({ error: 'Only team owner can delete team' });
    }

    // Delete team (cascade will remove members and invitations)
    const { error: deleteError } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId);

    if (deleteError) throw deleteError;

    res.json({ success: true, message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/teams/:teamId/invite - Invite member to team
 * Admin/Owner only
 */
router.post('/:teamId/invite', authenticateSupabase, async (req, res) => {
  const userId = req.userId;
  const teamId = parseInt(req.params.teamId, 10);
  const { email, role = 'member' } = req.body;

  if (!Number.isFinite(teamId)) {
    return res.status(400).json({ error: 'Invalid team ID' });
  }

  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }

  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or member' });
  }

  try {
    // Verify user can manage team
    const { data: canManage } = await supabase
      .rpc('user_can_manage_team', { p_user_id: userId, p_team_id: teamId });

    if (!canManage) {
      return res.status(403).json({ error: 'You do not have permission to invite members' });
    }

    // Check if email is already a team member
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, team_id')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (existingProfile && existingProfile.team_id === teamId) {
      return res.status(400).json({ error: 'User is already a team member' });
    }

    // Check for existing pending invitation
    const { data: existingInvite } = await supabase
      .from('team_invitations')
      .select('id')
      .eq('team_id', teamId)
      .eq('email', email.trim().toLowerCase())
      .eq('status', 'pending')
      .single();

    if (existingInvite) {
      return res.status(400).json({ error: 'Invitation already sent to this email' });
    }

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .insert({
        team_id: teamId,
        inviter_id: userId,
        email: email.trim().toLowerCase(),
        role,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      })
      .select()
      .single();

    if (inviteError) throw inviteError;

    // TODO: Send invitation email
    // const inviteUrl = `${process.env.APP_URL}/accept-invite?token=${invitation.invitation_token}`;
    // await sendInvitationEmail(email, inviteUrl, teamName);

    res.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        invitation_token: invitation.invitation_token,
        expires_at: invitation.expires_at
      },
      message: 'Invitation sent successfully'
    });
  } catch (error) {
    console.error('Invite member error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/teams/accept-invite - Accept team invitation
 * Public endpoint (uses invitation token)
 */
router.post('/accept-invite', authenticateSupabase, async (req, res) => {
  const userId = req.userId;
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Invitation token is required' });
  }

  try {
    // Get user email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, team_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Find invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('invitation_token', token)
      .eq('email', profile.email.toLowerCase())
      .single();

    if (inviteError || !invitation) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    // Check invitation status
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: 'Invitation has already been processed' });
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('team_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      return res.status(400).json({ error: 'Invitation has expired' });
    }

    // Check if user is already on another team
    if (profile.team_id && profile.team_id !== invitation.team_id) {
      return res.status(400).json({
        error: 'You are already a member of another team. Please leave your current team first.'
      });
    }

    // Accept invitation
    const { error: updateInviteError } = await supabase
      .from('team_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by: userId
      })
      .eq('id', invitation.id);

    if (updateInviteError) throw updateInviteError;

    // Add to team members
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        team_id: invitation.team_id,
        user_id: userId,
        role: invitation.role,
        invited_by: invitation.inviter_id
      });

    if (memberError) throw memberError;

    // Update profile team_id (also done by trigger, but double-check)
    await supabase
      .from('profiles')
      .update({ team_id: invitation.team_id })
      .eq('id', userId);

    // Get team details
    const { data: team } = await supabase
      .from('teams')
      .select('id, name, slug')
      .eq('id', invitation.team_id)
      .single();

    res.json({
      success: true,
      team,
      message: `You have successfully joined ${team?.name || 'the team'}!`
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/teams/:teamId/invitations/:invitationId/cancel - Cancel invitation
 * Admin/Owner only
 */
router.post('/:teamId/invitations/:invitationId/cancel', authenticateSupabase, async (req, res) => {
  const userId = req.userId;
  const teamId = parseInt(req.params.teamId, 10);
  const invitationId = parseInt(req.params.invitationId, 10);

  try {
    // Verify user can manage team
    const { data: canManage } = await supabase
      .rpc('user_can_manage_team', { p_user_id: userId, p_team_id: teamId });

    if (!canManage) {
      return res.status(403).json({ error: 'You do not have permission to cancel invitations' });
    }

    // Cancel invitation
    const { error } = await supabase
      .from('team_invitations')
      .update({ status: 'canceled' })
      .eq('id', invitationId)
      .eq('team_id', teamId);

    if (error) throw error;

    res.json({ success: true, message: 'Invitation canceled' });
  } catch (error) {
    console.error('Cancel invitation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/teams/:teamId/members/:memberId - Remove team member
 * Admin/Owner only (cannot remove owner)
 */
router.delete('/:teamId/members/:memberId', authenticateSupabase, async (req, res) => {
  const userId = req.userId;
  const teamId = parseInt(req.params.teamId, 10);
  const memberId = req.params.memberId; // UUID

  try {
    // Verify user can manage team
    const { data: canManage } = await supabase
      .rpc('user_can_manage_team', { p_user_id: userId, p_team_id: teamId });

    if (!canManage) {
      return res.status(403).json({ error: 'You do not have permission to remove members' });
    }

    // Check if trying to remove owner
    const { data: member } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', memberId)
      .single();

    if (member?.role === 'owner') {
      return res.status(400).json({ error: 'Cannot remove team owner' });
    }

    // Remove member
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', memberId);

    if (error) throw error;

    // Clear team_id from profile
    await supabase
      .from('profiles')
      .update({ team_id: null })
      .eq('id', memberId);

    res.json({ success: true, message: 'Member removed from team' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/teams/:teamId/leave - Leave team
 * Cannot leave if you're the owner
 */
router.post('/:teamId/leave', authenticateSupabase, async (req, res) => {
  const userId = req.userId;
  const teamId = parseInt(req.params.teamId, 10);

  try {
    // Check if user is owner
    const { data: team } = await supabase
      .from('teams')
      .select('owner_id')
      .eq('id', teamId)
      .single();

    if (team?.owner_id === userId) {
      return res.status(400).json({
        error: 'Team owner cannot leave. Please transfer ownership or delete the team.'
      });
    }

    // Remove from team
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);

    if (error) throw error;

    // Clear team_id from profile
    await supabase
      .from('profiles')
      .update({ team_id: null })
      .eq('id', userId);

    res.json({ success: true, message: 'You have left the team' });
  } catch (error) {
    console.error('Leave team error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
