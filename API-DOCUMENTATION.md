# Social Media Scheduler API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication

All POST requests to `/api/posts` require an API key.

**Header:**
```
X-API-Key: your_api_key_here
```

**Or Query Parameter:**
```
?api_key=your_api_key_here
```

---

## Quick Start: Using from OmniBroker

### Step 1: Create an API Key

In the scheduler dashboard:
1. Go to Settings → API Keys
2. Click "Create API Key"
3. Name: "OmniBroker"
4. Webhook URL: `https://omnibroker.com/api/webhooks/social-media` (optional)
5. Save the API key (starts with `sk_...`)

### Step 2: Use in OmniBroker Code

```javascript
// In your OmniBroker backend when a listing is created:

async function createListing(listingData) {
  // Save listing to your database
  await db.listings.create(listingData);

  // Auto-post to social media
  await fetch('http://localhost:3000/api/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'sk_your_api_key_here'
    },
    body: JSON.stringify({
      filename: 'listing-123.jpg',
      filepath: `/path/to/omnibroker/uploads/${listingData.mainPhoto}`,
      filetype: 'image',
      caption: `New Listing! ${listingData.address}\n$${listingData.price}\n${listingData.bedrooms} bed, ${listingData.bathrooms} bath`,
      platforms: ['facebook', 'instagram'],
      scheduled_time: '2026-03-16 09:00:00', // Optional: Schedule for later
      webhook_url: 'https://omnibroker.com/api/webhooks/post-result' // Optional: Get notified
    })
  });

  return { success: true };
}
```

---

## API Endpoints

### Posts

#### Create Post
```http
POST /api/posts
X-API-Key: sk_...
```

**Request Body:**
```json
{
  "filename": "property-123.jpg",
  "filepath": "/path/to/file.jpg",
  "filetype": "image",
  "caption": "Check out this amazing property!",
  "platforms": ["facebook", "instagram"],
  "scheduled_time": "2026-03-16 14:00:00",
  "webhook_url": "https://your-app.com/webhook"
}
```

**Response:**
```json
{
  "success": true,
  "id": 42,
  "message": "Post created successfully",
  "webhook_url": "https://your-app.com/webhook"
}
```

#### Get All Posts
```http
GET /api/posts
```

**Query Parameters:**
- `status`: Filter by status (`pending`, `posted`, `failed`)
- `limit`: Max results (default: 100)

**Response:**
```json
{
  "posts": [
    {
      "id": 1,
      "filename": "property.jpg",
      "status": "posted",
      "platforms": "[\"facebook\",\"instagram\"]",
      "created_at": "2026-03-15 10:00:00"
    }
  ]
}
```

#### Get Single Post
```http
GET /api/posts/:id
```

#### Update Post
```http
PUT /api/posts/:id
```

**Request Body:**
```json
{
  "caption": "Updated caption",
  "scheduled_time": "2026-03-17 10:00:00",
  "status": "pending"
}
```

#### Delete Post
```http
DELETE /api/posts/:id
```

#### Post Immediately
```http
POST /api/posts/:id/post-now
```

Forces immediate posting, bypassing the schedule.

---

### API Keys Management

#### List All API Keys
```http
GET /api/keys
```

#### Create API Key
```http
POST /api/keys
```

**Request Body:**
```json
{
  "name": "OmniBroker Production",
  "account_id": 1,
  "webhook_url": "https://omnibroker.com/webhook"
}
```

**Response:**
```json
{
  "success": true,
  "id": 1,
  "api_key": "sk_1234567890abcdef...",
  "message": "API key created successfully. Save this key, it will not be shown again!"
}
```

#### Update API Key
```http
PUT /api/keys/:id
```

**Request Body:**
```json
{
  "name": "OmniBroker Staging",
  "webhook_url": "https://staging.omnibroker.com/webhook",
  "is_active": true
}
```

#### Delete API Key
```http
DELETE /api/keys/:id
```

---

### Social Media Accounts

#### List Accounts
```http
GET /api/accounts
```

**Response:**
```json
{
  "accounts": [
    {
      "id": 1,
      "name": "PK Property Facebook",
      "type": "default",
      "facebook_page_id": "123456789",
      "instagram_account_id": "987654321",
      "is_default": 1
    }
  ]
}
```

#### Create Account
```http
POST /api/accounts
```

**Request Body:**
```json
{
  "name": "Sun Production Social",
  "type": "business",
  "facebook_page_token": "EAAxxxxx...",
  "facebook_page_id": "123456789",
  "instagram_token": "IGQxxxxx...",
  "instagram_account_id": "987654321",
  "is_default": false
}
```

#### Update Account
```http
PUT /api/accounts/:id
```

#### Delete Account
```http
DELETE /api/accounts/:id
```

---

### Webhooks

When a post succeeds or fails, the system will send a POST request to your webhook URL.

**Webhook Payload (Success):**
```json
{
  "event": "post.success",
  "post_id": 42,
  "filename": "property-123.jpg",
  "platforms": ["facebook", "instagram"],
  "facebook_post_id": "123456789_987654321",
  "instagram_post_id": "17841234567890123",
  "posted_at": "2026-03-15T14:30:00.000Z"
}
```

**Webhook Payload (Failure):**
```json
{
  "event": "post.failed",
  "post_id": 42,
  "filename": "property-123.jpg",
  "platforms": ["facebook", "instagram"],
  "error": {
    "facebook": "Invalid access token",
    "instagram": null
  },
  "failed_at": "2026-03-15T14:30:00.000Z"
}
```

**Webhook Logs:**
```http
GET /api/webhook-logs?limit=50
```

---

## Real-World Examples

### Example 1: OmniBroker - Auto-post New Listing

```javascript
// omnibroker/src/services/listing.service.js

const SCHEDULER_API = 'http://localhost:3000/api';
const API_KEY = process.env.SOCIAL_MEDIA_API_KEY; // sk_...

async function publishListing(listing) {
  try {
    // Create the post
    const response = await fetch(`${SCHEDULER_API}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        filename: `listing-${listing.id}.jpg`,
        filepath: listing.photos[0].path,
        filetype: 'image',
        caption: `🏡 NEW LISTING!\n\n${listing.address}\n💰 $${listing.price.toLocaleString()}\n🛏️ ${listing.bedrooms} bed | 🛁 ${listing.bathrooms} bath\n📐 ${listing.sqft} sqft\n\nCall us today! 📞`,
        platforms: ['facebook', 'instagram'],
        scheduled_time: null, // Post immediately
        webhook_url: `${process.env.APP_URL}/api/webhooks/listing-posted`
      })
    });

    const result = await response.json();

    // Save social media post ID to listing
    await db.listings.update(listing.id, {
      social_media_post_id: result.id
    });

    return result;
  } catch (error) {
    console.error('Social media post failed:', error);
  }
}
```

### Example 2: Sun Production - Bulk Campaign

```javascript
// sun-production/campaigns/spring-promo.js

const SCHEDULER_API = 'http://localhost:3000/api';
const API_KEY = 'sk_sun_production_key_here';

async function launchSpringCampaign() {
  const posts = [
    { image: 'promo-1.jpg', time: '2026-03-16 09:00:00' },
    { image: 'promo-2.jpg', time: '2026-03-16 14:00:00' },
    { image: 'promo-3.jpg', time: '2026-03-17 09:00:00' }
  ];

  for (const post of posts) {
    await fetch(`${SCHEDULER_API}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        filename: post.image,
        filepath: `/campaigns/spring-2026/${post.image}`,
        filetype: 'image',
        caption: '🌸 Spring Sale! 50% off all services!',
        platforms: ['facebook', 'instagram'],
        scheduled_time: post.time
      })
    });
  }

  console.log('Campaign scheduled!');
}
```

### Example 3: Webhook Handler in OmniBroker

```javascript
// omnibroker/src/routes/webhooks.js

app.post('/api/webhooks/listing-posted', async (req, res) => {
  const { event, post_id, facebook_post_id, instagram_post_id } = req.body;

  if (event === 'post.success') {
    // Update listing with social media URLs
    await db.listings.update({
      facebook_url: `https://facebook.com/${facebook_post_id}`,
      instagram_url: `https://instagram.com/p/${instagram_post_id}`,
      posted_at: new Date()
    });

    // Notify admin
    await notifyAdmin(`Listing posted to social media successfully!`);
  } else if (event === 'post.failed') {
    // Alert admin about failure
    await sendErrorEmail(`Social media post failed: ${req.body.error}`);
  }

  res.json({ received: true });
});
```

---

## Multi-Account Setup

Support multiple Facebook/Instagram accounts for different businesses:

1. **Create accounts in dashboard:**
   - PK Property account
   - Sun Production account

2. **Create API keys linked to accounts:**
   - OmniBroker API key → PK Property account
   - Sun Production API key → Sun Production account

3. **Each app uses its own API key:**
   - Posts automatically go to the correct social media accounts
   - Completely isolated

---

## Testing

### Test API Key Creation
```bash
curl -X POST http://localhost:3000/api/keys \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Key",
    "webhook_url": "https://webhook.site/your-unique-url"
  }'
```

### Test Creating a Post
```bash
curl -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk_your_key_here" \
  -d '{
    "filename": "test.jpg",
    "filepath": "/path/to/test.jpg",
    "caption": "Test post from API",
    "platforms": ["facebook"]
  }'
```

---

## Error Handling

**401 Unauthorized:**
```json
{
  "error": "Missing API key",
  "message": "Please provide an API key in X-API-Key header or api_key query parameter"
}
```

**403 Forbidden:**
```json
{
  "error": "Invalid API key",
  "message": "The provided API key is invalid or inactive"
}
```

**400 Bad Request:**
```json
{
  "error": "Missing required fields: filename, filepath, platforms"
}
```

---

## Support

For questions or issues, check the main README.md or the dashboard at http://localhost:3000
