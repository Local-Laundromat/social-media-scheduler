/**
 * Setup Supabase Storage Bucket
 * Run this once to create the storage bucket for Quu
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function setupStorage() {
  console.log('🔷 Setting up Supabase Storage...');

  // Create bucket
  const { data: bucket, error: bucketError } = await supabase.storage.createBucket('quu-media', {
    public: true
  });

  if (bucketError) {
    if (bucketError.message.includes('already exists')) {
      console.log('✅ Bucket "quu-media" already exists');
    } else {
      console.error('❌ Error creating bucket:', bucketError);
      return;
    }
  } else {
    console.log('✅ Created bucket "quu-media"');
  }

  // List buckets to verify
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    console.error('❌ Error listing buckets:', listError);
  } else {
    console.log('\n📦 Available buckets:');
    buckets.forEach(b => {
      console.log(`  - ${b.name} (${b.public ? 'public' : 'private'})`);
    });
  }

  console.log('\n✅ Supabase Storage is ready!');
  console.log('📁 You can now upload files to the "quu-media" bucket');
}

setupStorage().catch(console.error);
