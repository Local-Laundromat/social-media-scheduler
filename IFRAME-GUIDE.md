# Iframe Embedding Guide for OmniBroker & Sun Production

## Quick Integration (5 minutes)

### Step 1: Add Iframe to Your App

**In OmniBroker's Settings Page:**

```html
<!-- Social Media Settings Tab -->
<div id="social-media-settings">
  <h2>Social Media Posting</h2>
  <p>Connect your Facebook and Instagram accounts to auto-post listings</p>

  <iframe
    src="http://localhost:3000/embed?user_id={{ current_user.id }}&app=omnibroker&name={{ current_user.name }}"
    width="100%"
    height="800px"
    frameborder="0"
    style="border: 1px solid #e5e7eb; border-radius: 8px;"
  ></iframe>
</div>
```

**In Sun Production's Settings Page:**

```html
<iframe
  src="http://localhost:3000/embed?user_id={{ user.id }}&app=sun-production&name={{ user.name }}"
  width="100%"
  height="800px"
  frameborder="0"
></iframe>
```

### Step 2: That's It!

Users can now:
- ✅ Connect their Facebook page
- ✅ Connect their Instagram account
- ✅ Import folders of images
- ✅ Schedule posts
- ✅ View post history

All inside your app's UI!

---

## URL Parameters

**Required:**
- `user_id` - Unique identifier from your app (e.g., `123`, `user_abc_456`)
- `app` - Your app name (e.g., `omnibroker`, `sun-production`)

**Optional:**
- `name` - User's name for display
- `email` - User's email
- `return_url` - Where to redirect after connection (for popup mode)

**Examples:**

```
http://localhost:3000/embed?user_id=123&app=omnibroker&name=John%20Doe

http://localhost:3000/embed?user_id=456&app=sun-production&email=jane@example.com
```

---

## Auto-Posting from Your App

Once a user connects their accounts via the iframe, you can auto-post on their behalf:

### Example: OmniBroker Auto-Post New Listing

```javascript
// omnibroker/services/listing.service.js

async function publishListing(listing, userId) {
  // Create post for this specific user
  await fetch('http://localhost:3000/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId, // The user who connected their social media
      filename: `listing-${listing.id}.jpg`,
      filepath: listing.mainPhoto.path,
      caption: `New Listing! ${listing.address}\n$${listing.price}`,
      platforms: ['facebook', 'instagram']
    })
  });
}
```

**The scheduler will:**
1. Look up the user by `user_id`
2. Use THEIR Facebook/Instagram tokens
3. Post to THEIR accounts
4. Return success/failure

---

## How It Works

### User Flow:

1. **User opens OmniBroker settings**
2. **Sees the iframe** with "Connect Facebook" button
3. **Clicks button** → Facebook OAuth popup
4. **Grants permissions** → Popup closes
5. **Connected!** ✓ Green checkmark shows
6. **Repeats for Instagram**
7. **Done!** Can now use folder import or OmniBroker auto-posts for them

### What Gets Stored:

```javascript
{
  external_user_id: "omnibroker_user_123",
  app_name: "omnibroker",
  name: "John Doe",
  facebook_page_token: "EAAxxxxx...",
  facebook_page_id: "123456789",
  facebook_connected: true,
  instagram_token: "IGQxxxxx...",
  instagram_account_id: "987654321",
  instagram_connected: true
}
```

---

## Deployment

### Development (Local)
```
http://localhost:3000/embed?user_id=123&app=omnibroker
```

### Production
```
https://social-scheduler.yourcompany.com/embed?user_id=123&app=omnibroker
```

Just deploy the scheduler to Railway/Render/etc and update the iframe `src`.

---

## Iframe Communication (Optional)

Get notified in your app when user connects accounts:

```javascript
// In OmniBroker's JavaScript
window.addEventListener('message', (event) => {
  if (event.data.type === 'facebook_connected') {
    showSuccessMessage('Facebook connected!');
    updateUI();
  }

  if (event.data.type === 'instagram_connected') {
    showSuccessMessage('Instagram connected!');
  }

  if (event.data.type === 'post_created') {
    console.log('Post created:', event.data.post_id);
  }
});
```

The iframe will send messages when important events happen.

---

## Multi-Tenant Isolation

**Each user's data is completely isolated:**

- User A (OmniBroker) → Posts go to User A's Facebook/Instagram
- User B (OmniBroker) → Posts go to User B's Facebook/Instagram
- User C (Sun Production) → Posts go to User C's Facebook/Instagram

**Users can only see/manage their own posts.**

---

## FAQ

**Q: Do I need to store social media tokens?**
A: No! The scheduler stores them securely. You just pass `user_id`.

**Q: What if user disconnects Facebook?**
A: They click "Disconnect" in the iframe. Future posts for them will fail gracefully.

**Q: Can users have different FB pages?**
A: Yes! Each user connects their own Facebook Business Page and Instagram Business Account.

**Q: How do I test this?**
A: Use the embed URL with `user_id=test_123` and connect your own FB/IG for testing.

**Q: What about Facebook app approval?**
A: You'll need to create a Facebook App and get it approved for `pages_manage_posts` and `instagram_content_publish` permissions. See SETUP-GUIDE.md.

**Q: Can I customize the iframe UI?**
A: Yes! Add `theme=light` or `theme=dark` parameter. Or fork and modify `/public/embed.html`.

---

## Next Steps

1. **Add iframe to your app** (copy code above)
2. **Test with your own account** (`user_id=test`)
3. **Get Facebook App approved** (for production)
4. **Deploy scheduler** (Railway/Render)
5. **Update iframe src** to production URL

Done! Your users can now self-service connect their social media! 🎉
