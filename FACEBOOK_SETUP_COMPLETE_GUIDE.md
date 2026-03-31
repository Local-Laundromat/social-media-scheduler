# Complete Facebook App Setup Guide

## Current Situation

You've created a Facebook app "Quu scheduler" (App ID: 1496549762091861) but hit a permissions error because the Pages and Instagram permissions need special setup.

---

## The Problem

Facebook changed how Pages and Instagram permissions work. They now require you to:
1. Use the **Facebook Login** use case (✅ Done)
2. Request specific **Pages** and **Instagram** permissions through a different process

---

## Solution: Step-by-Step

### Step 1: Switch Your App to "Business" Type

Your app is currently set to use Facebook Login for authentication. To access Pages and Instagram, you need to ensure it's properly configured:

1. Go to: https://developers.facebook.com/apps/1496549762091861/dashboard
2. Check if your app type is "Business" (it should be)

### Step 2: Add the Required Test Users

In Development Mode, permissions work automatically for:
- The app developer (you)
- Test users you add

To test, you need to **log in with YOUR Facebook account** (the one that created the app).

### Step 3: Test with Minimal Permissions First

I've temporarily changed your code to use just `public_profile,email` which always work. Let's test that the OAuth flow works at all:

1. **Restart your server** (the code has been updated)
2. Go to: http://localhost:3000/test-facebook.html
3. Click "Connect Facebook Page"
4. You should now see a Facebook login screen
5. Log in and click "Continue"

This will verify that:
- Your App ID and Secret are correct
- OAuth redirect URIs are configured properly
- The basic flow works

### Step 4: Request Pages Permissions (The Right Way)

Once basic OAuth works, we need to add Pages permissions. Here's how:

#### Option A: Use Facebook's Business Integration

1. Go to: https://developers.facebook.com/apps/1496549762091861
2. Look for **"Add Products"** or **"Products"** in the left sidebar
3. Find and add **"Facebook Login for Business"** or **"Business Integration"**
4. This will give you access to Pages permissions automatically in Development Mode

#### Option B: Use the Pages API Directly

1. In your app dashboard, look for **"Pages API"** or similar
2. Some permissions are auto-granted in Development Mode when you're the developer

### Step 5: Update the Code with Correct Permissions

Once you have access to Pages permissions, I'll update the code to use:

```javascript
scope=email,pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish
```

But Facebook might have renamed these. The current standard permissions are:
- `pages_show_list` → Might now be `pages_read_user_content`
- `pages_manage_posts` → Might now be `pages_manage_posts` (same)
- `instagram_basic` → Might now be `instagram_basic` (same)
- `instagram_content_publish` → Might now be `instagram_content_publish` (same)

---

## Current Test (Simplified)

**Right now:**
1. Go to: http://localhost:3000/test-facebook.html
2. Click "Connect Facebook Page"
3. It should work with just email/profile permissions
4. This proves OAuth is configured correctly

**Next step:**
Once this works, we'll figure out the exact new permission names Facebook wants and add them.

---

## Why This Is Confusing

Facebook keeps changing how Pages/Instagram permissions work:
- 2020: They were simple scope parameters
- 2023: They moved to "Business Integration"
- 2024: They changed the permission names again
- 2025+: Current system (what we're dealing with)

The key is: **In Development Mode, you (the developer) should be able to test everything**. The permissions will work for your own Facebook account without App Review.

---

## Next Steps

1. **Test basic OAuth** with the simplified permissions (http://localhost:3000/test-facebook.html)
2. **Let me know if it works** - if you see a Facebook login screen and can log in
3. Then we'll figure out the current way to add Pages permissions

The error you saw was actually helpful - it told us exactly which permissions Facebook didn't recognize. We just need to find the updated way to request them.

---

## For Reference

**Your Facebook App:**
- Name: Quu scheduler
- App ID: 1496549762091861
- Type: Business
- Use Case: Facebook Login (Authenticate and request data from users)
- Redirect URIs: Configured ✅
- App Secret: Configured ✅

**What's Working:**
- App created ✅
- OAuth configured ✅
- Redirect URIs added ✅

**What's NOT Working:**
- Pages/Instagram permissions (need different setup)

Let's fix this one step at a time!
