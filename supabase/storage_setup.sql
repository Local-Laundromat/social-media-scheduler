-- Supabase Storage Setup for Quu Media Files
-- Run this in Supabase SQL Editor after creating the bucket

-- Storage bucket policies for quu-media

-- Allow authenticated users to upload files
CREATE POLICY "Users can upload media files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'quu-media' AND
    auth.role() = 'authenticated'
  );

-- Allow public read access (required for Instagram)
CREATE POLICY "Public can read media files"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'quu-media');

-- Allow users to update their own files
CREATE POLICY "Users can update own media files"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'quu-media' AND
    auth.role() = 'authenticated'
  );

-- Allow users to delete their own files
CREATE POLICY "Users can delete own media files"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'quu-media' AND
    auth.role() = 'authenticated'
  );
