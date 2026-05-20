# LangGraph Autonomous Post Generation - Implementation Guide

## 🎯 Overview

Your Quu Scheduler now has a **self-correcting AI agent** powered by LangGraph.js that autonomously generates high-quality social media posts with built-in quality control.

### How It Works

```
User Request → Writer Agent → Critic Agent → Quality Check
                    ↓              ↓              ↓
                 Draft 1 ─────→ Score: 6/10 ──→ RETRY
                    ↓              ↓              ↓
                 Draft 2 ─────→ Score: 7/10 ──→ RETRY
                    ↓              ↓              ↓
                 Draft 3 ─────→ Score: 9/10 ──→ ✅ PUBLISH
```

## 📁 Files Created

1. **`src/services/agentGraph.js`** - LangGraph workflow engine
2. **`src/routes/agentPost.js`** - API endpoints
3. **`src/server.js`** - Updated with agent routes

## 🚀 Quick Start

### 1. Prerequisites

✅ Already installed:
- `@langchain/langgraph@^1.3.2`
- `@langchain/openai@^1.4.6`
- `@langchain/core@^1.1.47`

### 2. Configure OpenAI API Key

Edit `.env`:
```bash
OPENAI_API_KEY=sk-your-actual-api-key-here
```

Get your API key from: https://platform.openai.com/api-keys

### 3. Start the Server

```bash
npm start
```

## 📡 API Endpoints

### Status Check

```bash
GET /api/agent/status
```

Response:
```json
{
  "available": true,
  "service": "LangGraph Autonomous Post Generator",
  "version": "1.0.0",
  "maxRetries": 3,
  "qualityThreshold": 8,
  "supportedPlatforms": ["facebook", "instagram", "tiktok", "linkedin"]
}
```

### Generate Post (Authenticated)

```bash
POST /api/agent/generate-post
Authorization: Bearer <supabase-jwt-token>
Content-Type: application/json

{
  "niche": "luxury real estate",
  "platform": "instagram",
  "scheduledTime": "2026-05-25T14:00:00Z",  // Optional
  "saveToQueue": true  // Optional, default true
}
```

Response:
```json
{
  "success": true,
  "message": "AI post generated and queued successfully",
  "post": {
    "id": 123,
    "caption": "Your professionally crafted caption here...",
    "platform": "instagram",
    "status": "pending",
    "scheduledAt": "2026-05-25T14:00:00Z",
    "qualityScore": 9,
    "attempts": 2,
    "qualityThresholdMet": true
  },
  "metadata": {
    "niche": "luxury real estate",
    "brandSettings": "Your Company Name",
    "feedback": ""
  }
}
```

### Generate Batch Posts

```bash
POST /api/agent/generate-batch
Authorization: Bearer <supabase-jwt-token>
Content-Type: application/json

{
  "niche": "fitness coaching",
  "platforms": ["facebook", "instagram", "linkedin"],
  "count": 7,  // Generate 7 posts
  "startDate": "2026-05-21T09:00:00Z",
  "frequency": "daily"  // "daily", "weekly", or "custom"
}
```

Response:
```json
{
  "success": true,
  "message": "Generated 21 posts successfully",
  "results": [
    {
      "success": true,
      "postId": 124,
      "platform": "facebook",
      "score": 8,
      "scheduledAt": "2026-05-21T09:00:00Z"
    }
    // ... 20 more posts
  ],
  "summary": {
    "total": 21,
    "successful": 21,
    "failed": 0
  }
}
```

### Demo Endpoint (No Auth - Testing Only)

```bash
POST /api/agent/demo
Content-Type: application/json

{
  "niche": "luxury real estate",
  "platform": "instagram"
}
```

⚠️ **REMOVE THIS ENDPOINT IN PRODUCTION** - It bypasses authentication!

## 🧠 How the Agent Works

### Writer Agent (Node 1)

- Uses GPT-4o-mini (cost-effective, fast)
- Platform-specific guidelines (Instagram vs Facebook vs TikTok)
- Reads brand settings from user profile
- Incorporates feedback from previous attempts
- Avoids generic AI hooks and filler text

### Critic Agent (Node 2)

Scores drafts 1-10 based on:
1. **Hook Strength** - First sentence impact
2. **Platform Optimization** - Format, length, style
3. **Engagement Potential** - Will it get comments/shares?
4. **Authenticity** - Sounds human, not robotic
5. **Call-to-Action** - Clear next step

**Penalties:**
- Generic AI phrases: -3 points
- Wrong length for platform: -2 points
- Weak/missing CTA: -1 point
- Too many emojis: -2 points
- Poor hashtag strategy: -1 point

### Quality Control Loop

```javascript
if (score >= 8) {
  ✅ Publish
} else if (retries < 3) {
  🔄 Retry with specific feedback
} else {
  ⚠️ Accept best draft
}
```

## 🛠️ Configuration

### Adjust Quality Standards

Edit `src/services/agentGraph.js`:

```javascript
const MAX_RETRIES = 3;  // Change to 2 for faster (but lower quality)
const QUALITY_THRESHOLD = 8;  // Change to 7 for easier passing
```

### Platform-Specific Guidelines

Modify platform guidelines in `draftNode()` function:

```javascript
const platformGuidelines = {
  instagram: 'Your custom Instagram guidelines here...',
  facebook: 'Your custom Facebook guidelines here...',
  // ...
};
```

### Model Configuration

Change AI model in `getModel()` function:

```javascript
return new ChatOpenAI({
  modelName: "gpt-4o",  // More powerful, slower, more expensive
  temperature: 0.7,  // Lower = more consistent, Higher = more creative
  openAIApiKey: apiKey
});
```

## 📊 Database Schema Updates

The agent automatically adds these fields to posts:

```sql
-- Posts table columns
ai_generated: boolean          -- Marks AI-generated content
ai_quality_score: integer      -- Final score (1-10)
ai_attempts: integer           -- Number of retry attempts
niche: text                    -- Content niche/category
```

Make sure your Supabase `posts` table has these columns!

## 🎨 Integration with Dashboard

### Add to Dashboard UI

Create a new button in `public/dashboard.html`:

```html
<button onclick="generateAIPost()" class="btn-primary">
  🤖 Generate AI Post
</button>

<script>
async function generateAIPost() {
  const token = localStorage.getItem('access_token');

  const response = await fetch('/api/agent/generate-post', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      niche: 'real estate',  // Get from user input
      platform: 'instagram',  // Get from dropdown
      saveToQueue: true
    })
  });

  const result = await response.json();

  if (result.success) {
    alert(`Post created with score ${result.post.qualityScore}/10!`);
    refreshPostList();
  } else {
    alert(`Error: ${result.error}`);
  }
}
</script>
```

## 🔐 Security Notes

1. **Authentication Required** - All production endpoints use Supabase JWT
2. **Remove Demo Endpoint** - Delete `/api/agent/demo` before deploying
3. **Rate Limiting** - Batch generation has 1-second delays between posts
4. **API Key Security** - Never expose `OPENAI_API_KEY` in client-side code

## 📈 Cost Estimation

Using GPT-4o-mini:
- **Input**: $0.15 per 1M tokens
- **Output**: $0.60 per 1M tokens

Average post generation (with 2 retries):
- ~1,500 tokens input
- ~500 tokens output
- **Cost**: ~$0.0005 per post (half a cent)

**Monthly estimate for 1,000 posts**: ~$0.50

## 🐛 Troubleshooting

### "crypto is not defined" Error

✅ Already fixed with polyfill:
```javascript
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('crypto').webcrypto;
}
```

### "Invalid authentication token"

- Make sure you're sending a valid Supabase JWT token
- Use the demo endpoint for testing without auth

### "OPENAI_API_KEY not configured"

- Check `.env` file has real API key
- Restart server after updating `.env`

### Posts stuck at low scores

- Lower `QUALITY_THRESHOLD` from 8 to 7
- Increase `MAX_RETRIES` from 3 to 5
- Check brand settings in user profile

## 🚀 Next Steps: Advanced Features

### 1. Add RAG for Brand Voice

Store successful captions in vector database for consistent brand voice:

```bash
npm install @langchain/community chromadb
```

See implementation plan in main docs.

### 2. Add Multi-Agent Comments System

Use LangGraph for autonomous comment monitoring and responses.

### 3. Add Content Calendar Agent

Auto-generate 30-day content calendars with strategic posting schedules.

## 📝 Example Use Cases

### Use Case 1: Weekly Batch Generation

```bash
curl -X POST http://localhost:3000/api/agent/generate-batch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "niche": "fitness coaching",
    "platforms": ["instagram", "facebook"],
    "count": 7,
    "startDate": "2026-05-21T09:00:00Z",
    "frequency": "daily"
  }'
```

Result: 14 posts (7 days × 2 platforms) automatically scheduled

### Use Case 2: Quick Single Post

```bash
curl -X POST http://localhost:3000/api/agent/generate-post \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "niche": "luxury real estate",
    "platform": "instagram",
    "saveToQueue": false
  }'
```

Result: Get caption immediately without saving to database

## 📚 Additional Resources

- [LangGraph.js Documentation](https://js.langchain.com/docs/langgraph)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Supabase Auth Guide](https://supabase.com/docs/guides/auth)

## ✨ Success Indicators

Your LangGraph agent is working correctly when:

1. ✅ Status endpoint returns `"available": true`
2. ✅ Posts get scores ≥ 8 within 2-3 attempts
3. ✅ Generated captions sound natural (not robotic)
4. ✅ Platform-specific formatting is correct
5. ✅ Database has `ai_generated` and `ai_quality_score` fields

---

**Built with LangGraph.js + GPT-4o-mini**

🤖 Autonomous. Self-Correcting. Production-Ready.
