# Team Collaboration Feature

## ✅ What's Complete (Backend)

### Database Schema
- ✅ `teams` table with invite codes
- ✅ `team_id` added to `users` table
- ✅ `team_id` added to `posts` table
- ✅ `role` field in users (owner/member)
- ✅ Both SQLite and Supabase updated

### API Endpoints
- ✅ **POST /api/auth/signup** - Create team or join with invite code
  - Send `teamName` to create new team
  - Send `inviteCode` to join existing team
  - Returns team info and invite code

- ✅ **POST /api/auth/login** - Returns user + team info
- ✅ **GET /api/auth/verify** - Returns user + team info

### How It Works
1. **Creating a Team:**
   - User signs up with `teamName`
   - System creates team with unique invite code
   - User becomes team owner
   - Gets invite code to share with team

2. **Joining a Team:**
   - User signs up with `inviteCode`
   - System adds user to existing team
   - User becomes team member

---

## 🚧 What's Remaining (Frontend UI)

### 1. Update Signup Page
Need to add team selection UI to `public/dashboard.html` signup form:

```html
<!-- Add to signup form -->
<div class="team-selection">
  <label>
    <input type="radio" name="teamMode" value="create" checked>
    Create New Team
  </label>
  <label>
    <input type="radio" name="teamMode" value="join">
    Join Existing Team
  </label>
</div>

<div id="createTeam">
  <input type="text" name="teamName" placeholder="Team Name">
</div>

<div id="joinTeam" style="display:none">
  <input type="text" name="inviteCode" placeholder="Enter Invite Code">
</div>
```

### 2. Update Dashboard to Show Team Info
Add team invite code display in dashboard settings:

```javascript
// Show invite code for team owners
if (user.role === 'owner') {
  document.getElementById('invite-code').textContent = team.invite_code;
  document.getElementById('invite-section').style.display = 'block';
}
```

### 3. Filter Posts by Team
Update API calls to filter posts by team_id:
- Modify `GET /api/posts` to filter by user's team_id
- Ensure all created posts include team_id

---

## 📝 API Usage Examples

### Create Team (Signup)
```javascript
POST /api/auth/signup
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "teamName": "Marketing Team"
}

Response:
{
  "success": true,
  "token": "...",
  "user": { ... },
  "team": {
    "id": 1,
    "name": "Marketing Team",
    "invite_code": "A1B2C3D4E5F6"
  }
}
```

### Join Team (Signup)
```javascript
POST /api/auth/signup
{
  "email": "member@example.com",
  "password": "password123",
  "name": "Jane Doe",
  "inviteCode": "A1B2C3D4E5F6"
}

Response:
{
  "success": true,
  "token": "...",
  "user": { "role": "member", ... },
  "team": {
    "id": 1,
    "name": "Marketing Team",
    "invite_code": "A1B2C3D4E5F6"
  }
}
```

---

## 🎯 Next Steps

1. **Update signup UI** - Add team creation/join form
2. **Update dashboard UI** - Show team name and invite code
3. **Filter posts by team** - Ensure only team posts are visible
4. **Test the flow:**
   - Create team → Get invite code
   - Join team with invite code
   - Verify both users see same posts

---

## 🔐 Security Notes

- Team invite codes are unique and random
- Users can only see posts from their team
- Team owners can share invite codes with members
- No way to switch teams after signup (for now)
