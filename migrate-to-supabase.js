/**
 * Migrate data from SQLite to Supabase PostgreSQL
 * Run this script to migrate existing users and posts to Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

// Supabase connection
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// SQLite connection
const dbPath = path.join(__dirname, 'data/posts.db');
const db = new sqlite3.Database(dbPath);

/**
 * Helper to query SQLite
 */
function querySQL(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/**
 * Migrate users from SQLite to Supabase
 */
async function migrateUsers() {
  console.log('\n📊 Migrating users...');

  try {
    const users = await querySQL('SELECT * FROM users');
    console.log(`Found ${users.length} users in SQLite`);

    if (users.length === 0) {
      console.log('No users to migrate');
      return;
    }

    for (const user of users) {
      try {
        // Convert SQLite INTEGER (0/1) to PostgreSQL BOOLEAN
        // Note: company and app_name fields from SQLite are skipped (not in Supabase schema)
        const userData = {
          external_user_id: user.external_user_id,
          email: user.email,
          password_hash: user.password_hash,
          name: user.name,
          facebook_page_token: user.facebook_page_token,
          facebook_page_id: user.facebook_page_id,
          facebook_page_name: user.facebook_page_name,
          instagram_token: user.instagram_token,
          instagram_account_id: user.instagram_account_id,
          instagram_username: user.instagram_username,
          facebook_connected: user.facebook_connected === 1,
          instagram_connected: user.instagram_connected === 1,
          api_key: user.api_key,
          webhook_url: user.webhook_url,
          auto_reply_enabled: user.auto_reply_enabled === 1,
          openai_api_key: user.openai_api_key,
          created_at: user.created_at,
          updated_at: user.updated_at
        };

        const { error } = await supabase
          .from('users')
          .insert([userData]);

        if (error) {
          console.error(`  ❌ Failed to migrate user ${user.email}:`, error.message);
        } else {
          console.log(`  ✅ Migrated user: ${user.email}`);
        }
      } catch (err) {
        console.error(`  ❌ Error migrating user ${user.email}:`, err.message);
      }
    }

    console.log('✅ Users migration completed');
  } catch (error) {
    console.error('❌ Error migrating users:', error);
  }
}

/**
 * Migrate posts from SQLite to Supabase
 */
async function migratePosts() {
  console.log('\n📊 Migrating posts...');

  try {
    const posts = await querySQL('SELECT * FROM posts');
    console.log(`Found ${posts.length} posts in SQLite`);

    if (posts.length === 0) {
      console.log('No posts to migrate');
      return;
    }

    for (const post of posts) {
      try {
        const postData = {
          id: post.id,
          filename: post.filename,
          filepath: post.filepath,
          filetype: post.filetype,
          caption: post.caption,
          platforms: post.platforms, // Already a JSON string
          status: post.status,
          scheduled_time: post.scheduled_time,
          posted_time: post.posted_time,
          facebook_post_id: post.facebook_post_id,
          instagram_post_id: post.instagram_post_id,
          error_message: post.error_message,
          account_id: post.account_id,
          user_id: post.user_id,
          api_key: post.api_key,
          webhook_url: post.webhook_url,
          created_at: post.created_at
        };

        const { error } = await supabase
          .from('posts')
          .upsert([postData], { onConflict: 'id' });

        if (error) {
          console.error(`  ❌ Failed to migrate post ${post.id}:`, error.message);
        } else {
          console.log(`  ✅ Migrated post: ${post.filename}`);
        }
      } catch (err) {
        console.error(`  ❌ Error migrating post ${post.id}:`, err.message);
      }
    }

    console.log('✅ Posts migration completed');
  } catch (error) {
    console.error('❌ Error migrating posts:', error);
  }
}

/**
 * Migrate comment replies from SQLite to Supabase
 */
async function migrateCommentReplies() {
  console.log('\n📊 Migrating comment replies...');

  try {
    const replies = await querySQL('SELECT * FROM comment_replies');
    console.log(`Found ${replies.length} comment replies in SQLite`);

    if (replies.length === 0) {
      console.log('No comment replies to migrate');
      return;
    }

    for (const reply of replies) {
      try {
        const replyData = {
          id: reply.id,
          user_id: reply.user_id,
          platform: reply.platform,
          comment_id: reply.comment_id,
          comment_text: reply.comment_text,
          reply_text: reply.reply_text,
          reply_id: reply.reply_id,
          was_auto_reply: reply.was_auto_reply === 1,
          created_at: reply.created_at
        };

        const { error } = await supabase
          .from('comment_replies')
          .upsert([replyData], { onConflict: 'id' });

        if (error) {
          console.error(`  ❌ Failed to migrate reply ${reply.id}:`, error.message);
        } else {
          console.log(`  ✅ Migrated reply: ${reply.comment_id}`);
        }
      } catch (err) {
        console.error(`  ❌ Error migrating reply ${reply.id}:`, err.message);
      }
    }

    console.log('✅ Comment replies migration completed');
  } catch (error) {
    console.error('❌ Error migrating comment replies:', error);
  }
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting migration from SQLite to Supabase PostgreSQL');
  console.log('━'.repeat(60));

  try {
    await migrateUsers();
    await migratePosts();
    await migrateCommentReplies();

    console.log('\n' + '━'.repeat(60));
    console.log('🎉 Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Add SUPABASE_SERVICE_KEY to your .env file');
    console.log('2. The app will automatically use Supabase when deployed');
    console.log('3. Test locally by setting SUPABASE_SERVICE_KEY');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
  } finally {
    db.close();
    process.exit(0);
  }
}

// Run migration
migrate();
