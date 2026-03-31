# Facebook New Pages Experience (NPE) Setup Guide

## What Changed

Facebook migrated to the **New Pages Experience (NPE)** which completely changed how permissions work:

### Old System (Deprecated)
- `pages_show_list` - ❌ No longer exists
- `manage_pages` - ❌ No longer exists
- `publish_pages` - ❌ No longer exists

### New System (NPE - Current)
**Granular Permissions:**
- `pages_manage_metadata` - Manage page info
- `pages_read_user_content` - Read page content
- `pages_manage_posts` - Create and manage posts
- `pages_manage_engagement` - Manage comments, reactions
- `pages_read_engagement` - Read engagement metrics
- `read_insights` - Read analytics

**Critical Permission:**
- `business_management` - **REQUIRED** for pages in Business Portfolio

**Instagram Permissions:**
- `instagram_basic` - Basic Instagram access
- `instagram_content_publish` - Post to Instagram
- `instagram_manage_comments` - Manage Instagram comments
- `instagram_manage_insights` - Read Instagram analytics

---

## Current Status

✅ **Updated Code** - The auth routes now request the correct NPE permissions
✅ **Facebook App Created** - "Quu scheduler" (App ID: 1496549762091861)
✅ **OAuth Flow Working** - Basic authentication works

⚠️ **In Development Mode** - Your app can only access:
- Your own Facebook account (the developer)
- Test users you create
- Your own Pages **IF** they're connected to a Business Portfolio

---

## What You Need To Do

### Step 1: Connect Your Facebook Page to a Business Portfolio

**Why?** The `business_management` permission only works for Pages connected to a Meta Business Portfolio.

1. Go to: https://business.facebook.com
2. Create a Business Portfolio (if you don't have one)
3. Add your Facebook Page(s) to the Business Portfolio
4. This gives full API access to those pages

**Without this:** The `/me/accounts` API endpoint will return an empty list even if you have Pages.

### Step 2: Test the Updated Permissions

1. **Restart your server** (the code has been updated with new permissions)
   ```bash
   # Stop the server (Ctrl+C)
   npm start
   ```

2. **Go to test page:**
   http://localhost:3000/test-facebook.html

3. **Click "Connect Facebook Page"**
   - You should see a permission dialog asking for the new granular permissions
   - Accept all permissions
   - The app should now find your Pages (if they're in a Business Portfolio)

### Step 3: Handle Permission Errors (If They Occur)

If you get "Invalid Scopes" errors, it means:
- Your app needs to be configured for the specific permissions in Facebook Developer Console
- Some permissions require App Review (but NOT in Development Mode for your own account)

**Solution for Development Mode:**
1. Go to: https://developers.facebook.com/apps/1496549762091861
2. Look for "App Review" or "Permissions and Features"
3. In Development Mode, you should be able to use these permissions for your own Pages without review
4. Make sure your app has these products added:
   - Facebook Login
   - Instagram Basic Display (for Instagram)
   - Business Integration (for business_management)

---

## Key Requirements for Facebook Pages API Access

### For the Developer (You) in Development Mode:

1. ✅ **You must be the Page admin** - You need "Facebook Access" (full or partial control)
   - NOT just "Task Access" (that's for Business Suite only, not API)

2. ✅ **Page must be in Business Portfolio** - Required for `business_management` permission

3. ✅ **App must have the right products** - Facebook Login + Business Integration

4. ✅ **Login with developer account** - The account that created the Facebook app

### For Production (Later):

- **App Review Required** - You'll need to submit your app for review to use these permissions with other users' Pages
- **Privacy Policy** - Required URL for App Review
- **Use Case Documentation** - Explain why you need each permission

---

## Testing Checklist

- [ ] Business Portfolio created at business.facebook.com
- [ ] Facebook Page(s) added to Business Portfolio
- [ ] Page role is "Facebook Access" (not just "Task Access")
- [ ] Server restarted with updated permissions
- [ ] Tested OAuth flow at http://localhost:3000/test-facebook.html
- [ ] Successfully connected Facebook Page
- [ ] Successfully connected Instagram Business Account

---

## Troubleshooting

### "No Facebook Pages Found"
**Cause:** Pages not in Business Portfolio OR you only have "Task Access"
**Fix:**
1. Add Pages to Business Portfolio
2. Make sure you have "Facebook Access" role (not Task Access)
3. Login with the Facebook account that created the app

### "Invalid Scopes: business_management"
**Cause:** App doesn't have Business Integration product
**Fix:**
1. Go to Facebook App Dashboard
2. Add "Business Integration" product
3. In Development Mode, no review needed for your own Pages

### "Invalid Scopes: pages_manage_posts"
**Cause:** App doesn't have required products configured
**Fix:**
1. Make sure "Facebook Login" product is added
2. Check that app type is "Business" (not Consumer)

### "/me/accounts returns empty list"
**Cause:** Pages not in Business Portfolio OR missing business_management permission
**Fix:**
1. Connect Pages to Business Portfolio at business.facebook.com
2. Make sure `business_management` is in the OAuth scope

---

## Important Notes

### Development Mode vs Production

**Development Mode (Now):**
- Works with your own Pages automatically
- No App Review needed
- Only you (the developer) can connect Pages
- Perfect for testing

**Production Mode (Later):**
- Requires App Review for each permission
- Need Privacy Policy URL
- Need to document use case
- Any user can connect their Pages after approval

### Facebook Access vs Task Access

**Facebook Access:**
- Full API access ✅
- Can use Graph API endpoints ✅
- Can post via API ✅

**Task Access:**
- Only works in Business Suite/Creator Studio ❌
- Cannot use Graph API ❌
- Not compatible with your scheduler app ❌

Make sure anyone who needs to connect Pages has "Facebook Access" role, not Task Access.

---

## Updated Permissions Being Requested

### For Facebook OAuth:
```javascript
email,
pages_manage_metadata,      // Manage page info
pages_read_user_content,    // Read page content
pages_manage_posts,         // Create/manage posts
pages_manage_engagement,    // Manage comments/reactions
pages_read_engagement,      // Read engagement data
business_management         // Access Business Portfolio pages
```

### For Instagram OAuth:
```javascript
email,
pages_manage_metadata,      // Required for IG (via FB Page)
pages_read_user_content,    // Required for IG
pages_manage_posts,         // Required for IG
instagram_basic,            // Basic IG access
instagram_content_publish,  // Post to IG
instagram_manage_comments,  // Manage IG comments
instagram_manage_insights,  // Read IG analytics
business_management         // Access Business Portfolio
```

---

## Next Steps

1. **Set up Business Portfolio** - This is the critical missing piece
2. **Test with new permissions** - Should now see your Pages
3. **Verify Instagram connection** - Instagram Business must be linked to a Facebook Page
4. **Test posting** - Make a test post to verify everything works

Once this works in Development Mode, you're ready to build out the full scheduling features. When you want other users to connect their Pages, you'll need to go through App Review.

---

## Resources

- Facebook Business Manager: https://business.facebook.com
- Your Facebook App: https://developers.facebook.com/apps/1496549762091861
- Permissions Reference: https://developers.facebook.com/docs/permissions/
- Graph API Explorer: https://developers.facebook.com/tools/explorer/

---

**You're almost there!** The OAuth flow works, you just need to connect your Pages to a Business Portfolio and you'll be able to schedule posts! 🚀
