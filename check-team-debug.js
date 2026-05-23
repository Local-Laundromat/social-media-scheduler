/**
 * Debug Team Creation Issue
 * Checks what teams and members exist in the database
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function debugTeam() {
  console.log('\n🔍 Debugging Team Issue...\n');

  try {
    // Check teams
    console.log('1️⃣ Checking teams table:');
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('*')
      .order('created_at', { ascending: false });

    if (teamsError) {
      console.log('❌ Error:', teamsError.message);
    } else {
      console.log(`✅ Found ${teams.length} team(s):`);
      teams.forEach(team => {
        console.log(`   - ID: ${team.id}, Name: ${team.name}, Owner: ${team.owner_id}`);
      });
    }

    // Check team_members
    console.log('\n2️⃣ Checking team_members table:');
    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select('*')
      .order('joined_at', { ascending: false });

    if (membersError) {
      console.log('❌ Error:', membersError.message);
    } else {
      console.log(`✅ Found ${members.length} team member(s):`);
      members.forEach(member => {
        console.log(`   - Team: ${member.team_id}, User: ${member.user_id}, Role: ${member.role}`);
      });
    }

    // Check team_invitations
    console.log('\n3️⃣ Checking team_invitations table:');
    const { data: invites, error: invitesError } = await supabase
      .from('team_invitations')
      .select('*')
      .order('created_at', { ascending: false });

    if (invitesError) {
      console.log('❌ Error:', invitesError.message);
    } else {
      console.log(`✅ Found ${invites.length} invitation(s):`);
      invites.forEach(invite => {
        console.log(`   - Email: ${invite.email}, Team: ${invite.team_id}, Status: ${invite.status}`);
      });
    }

    // Check team_member_details view
    console.log('\n4️⃣ Checking team_member_details view:');
    const { data: details, error: detailsError } = await supabase
      .from('team_member_details')
      .select('*')
      .limit(5);

    if (detailsError) {
      console.log('❌ Error:', detailsError.message);
      console.log('   This view might not exist!');
    } else {
      console.log(`✅ View exists with ${details.length} row(s)`);
    }

    // Check profiles with team_id
    console.log('\n5️⃣ Checking profiles with team_id:');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name, email, team_id')
      .not('team_id', 'is', null);

    if (profilesError) {
      console.log('❌ Error:', profilesError.message);
    } else {
      console.log(`✅ Found ${profiles.length} profile(s) with team_id:`);
      profiles.forEach(profile => {
        console.log(`   - User: ${profile.email}, Team ID: ${profile.team_id}`);
      });
    }

    console.log('\n✅ Debug complete!\n');

  } catch (error) {
    console.error('\n❌ Debug failed:', error.message);
  }
}

debugTeam();
