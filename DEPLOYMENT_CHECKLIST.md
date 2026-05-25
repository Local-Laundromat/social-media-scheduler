# Deployment Checklist for quu.social

## When deploying new code to production:

### 1. **Pull Latest Code**
```bash
cd /path/to/production
git pull origin main
```

### 2. **Install Dependencies** (if package.json changed)
```bash
npm install
```

### 3. **Restart Server**
```bash
# If using PM2
pm2 restart social-media-scheduler

# If using systemd
sudo systemctl restart social-media-scheduler

# If running directly
pkill -f "node src/server.js"
npm start
```

### 4. **Verify Deployment**
```bash
# Check if server is running
curl -I https://quu.social

# Check if latest brands.js version is deployed
curl -s https://quu.social/js/brands.js | head -5
```

### 5. **Browser Cache Clear**
Tell users to hard refresh: **Ctrl+Shift+R** (Windows/Linux) or **Cmd+Shift+R** (Mac)

---

## Common Production Issues:

### Issue: "Site works locally but not on quu.social"

**Possible causes:**
1. **Code not pulled** - Run `git pull origin main` on production server
2. **Server not restarted** - Restart Node.js process
3. **Browser cache** - Hard refresh (Ctrl+Shift+R)
4. **Environment variables missing** - Check `.env` file

### Quick fix:
```bash
cd /path/to/production
git pull origin main
pm2 restart social-media-scheduler
# Then hard refresh browser
```
