-- Add YouTube and Google Business post ID columns to posts table

ALTER TABLE posts
ADD COLUMN IF NOT EXISTS youtube_post_id TEXT,
ADD COLUMN IF NOT EXISTS google_post_id TEXT;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_posts_youtube_post_id ON posts(youtube_post_id) WHERE youtube_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_google_post_id ON posts(google_post_id) WHERE google_post_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN posts.youtube_post_id IS 'YouTube video ID returned after successful upload';
COMMENT ON COLUMN posts.google_post_id IS 'Google Business Profile post name/ID returned after successful post creation';
