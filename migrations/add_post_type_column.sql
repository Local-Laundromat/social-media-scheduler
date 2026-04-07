-- Add post_type column to posts table for supporting different content types
-- Values: 'post' (default), 'reel', 'story'

ALTER TABLE posts
ADD COLUMN IF NOT EXISTS post_type VARCHAR(20) DEFAULT 'post' NOT NULL;

-- Add check constraint to ensure only valid values
ALTER TABLE posts
ADD CONSTRAINT posts_post_type_check
CHECK (post_type IN ('post', 'reel', 'story'));

-- Create index for faster filtering by post type
CREATE INDEX IF NOT EXISTS idx_posts_post_type ON posts(post_type);

-- Update any existing posts to have 'post' type (for backward compatibility)
UPDATE posts SET post_type = 'post' WHERE post_type IS NULL;
