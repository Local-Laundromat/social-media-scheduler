/**
 * Check Teams Tables Status
 * Checks what teams-related tables exist in Supabase
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function checkTables() {
  console.log('\n🔍 Checking Teams Tables Status...\n');

  try {
    // Check if teams table exists and its columns
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('*')
      .limit(0);

    if (teamsError) {
      if (teamsError.code === '42P01') {
        console.log('❌ teams table does NOT exist');
      } else {
        console.log('⚠️  teams table error:', teamsError.message);
      }
    } else {
      console.log('✅ teams table EXISTS');
    }

    // Check team_members
    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select('*')
      .limit(0);

    if (membersError) {
      if (membersError.code === '42P01') {
        console.log('❌ team_members table does NOT exist');
      } else {
        console.log('⚠️  team_members table error:', membersError.message);
      }
    } else {
      console.log('✅ team_members table EXISTS');
    }

    // Check team_invitations
    const { data: invites, error: invitesError } = await supabase
      .from('team_invitations')
      .select('*')
      .limit(0);

    if (invitesError) {
      if (invitesError.code === '42P01') {
        console.log('❌ team_invitations table does NOT exist');
      } else {
        console.log('⚠️  team_invitations table error:', invitesError.message);
      }
    } else {
      console.log('✅ team_invitations table EXISTS');
    }

    // Check profiles.team_id column
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('team_id')
      .limit(0);

    if (profilesError) {
      console.log('❌ profiles.team_id column does NOT exist');
    } else {
      console.log('✅ profiles.team_id column EXISTS');
    }

    console.log('\n📋 Recommendations:');
    console.log('If any tables are missing, you need to run the migration again.');
    console.log('If tables exist but owner_id is missing, run the fix-teams-schema.sql file.\n');

  } catch (error) {
    console.error('\n❌ Check failed:', error.message);
  }
}

checkTables();
