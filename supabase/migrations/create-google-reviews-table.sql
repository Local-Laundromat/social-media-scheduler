-- Create table for storing Google Business reviews
CREATE TABLE IF NOT EXISTS google_business_reviews (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_name TEXT NOT NULL, -- Google Business location resource name
  review_name TEXT NOT NULL UNIQUE, -- Google review resource name (unique ID)
  reviewer_name TEXT, -- Display name of the reviewer
  reviewer_profile_photo_url TEXT, -- Profile photo URL
  star_rating INTEGER CHECK (star_rating >= 1 AND star_rating <= 5), -- 1-5 stars
  comment TEXT, -- Review text
  create_time TIMESTAMP WITH TIME ZONE, -- When review was created
  update_time TIMESTAMP WITH TIME ZONE, -- When review was last updated

  -- AI Analysis fields
  sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')), -- AI sentiment
  review_type TEXT, -- AI classification (praise, complaint, question, etc.)
  priority TEXT CHECK (priority IN ('low', 'medium', 'high')), -- AI priority
  ai_suggested_reply TEXT, -- AI-generated reply suggestion

  -- Reply tracking
  has_replied BOOLEAN DEFAULT FALSE,
  reply_comment TEXT, -- Our reply text
  reply_created_time TIMESTAMP WITH TIME ZONE, -- When we replied
  reply_updated_time TIMESTAMP WITH TIME ZONE, -- When reply was updated
  is_auto_reply BOOLEAN DEFAULT FALSE, -- Was it auto-replied?

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_google_reviews_user_id ON google_business_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_google_reviews_location_name ON google_business_reviews(location_name);
CREATE INDEX IF NOT EXISTS idx_google_reviews_star_rating ON google_business_reviews(star_rating);
CREATE INDEX IF NOT EXISTS idx_google_reviews_sentiment ON google_business_reviews(sentiment);
CREATE INDEX IF NOT EXISTS idx_google_reviews_has_replied ON google_business_reviews(has_replied);
CREATE INDEX IF NOT EXISTS idx_google_reviews_priority ON google_business_reviews(priority);
CREATE INDEX IF NOT EXISTS idx_google_reviews_create_time ON google_business_reviews(create_time DESC);

-- Enable Row Level Security
ALTER TABLE google_business_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own Google reviews"
  ON google_business_reviews FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Google reviews"
  ON google_business_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Google reviews"
  ON google_business_reviews FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Google reviews"
  ON google_business_reviews FOR DELETE
  USING (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON TABLE google_business_reviews IS 'Stores Google Business Profile reviews with AI analysis and reply tracking';
COMMENT ON COLUMN google_business_reviews.review_name IS 'Google review resource name (e.g., accounts/.../locations/.../reviews/...)';
COMMENT ON COLUMN google_business_reviews.sentiment IS 'AI-detected sentiment: positive, negative, or neutral';
COMMENT ON COLUMN google_business_reviews.review_type IS 'AI classification of review type';
COMMENT ON COLUMN google_business_reviews.priority IS 'AI-determined priority level';
COMMENT ON COLUMN google_business_reviews.ai_suggested_reply IS 'AI-generated reply suggestion';
COMMENT ON COLUMN google_business_reviews.is_auto_reply IS 'Whether the reply was automatically posted or manually reviewed';
