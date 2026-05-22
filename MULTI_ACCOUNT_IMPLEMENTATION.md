# Multi-Account Implementation Plan

## Overview
Implement global account switcher that filters all dashboard data by selected social media account.

## Database Changes ✅
- [x] Created migration `add-account-identifiers.sql`
- [x] Added account ID columns to `posts` table
- [x] Added account ID columns to `comment_replies` table
- [x] Added indexes for efficient filtering

## Phase 1: Frontend UI ✅
- [x] Global account switcher in topbar
- [x] Dropdown populated with all connected accounts
- [x] Account selection stored in `currentGlobalAccount`
- [x] Tab refresh on account change

## Phase 2: Backend & Frontend Integration (In Progress)

### A. Posts Tab
**Backend (`src/routes/api.js`):**
- [ ] Update GET `/api/posts` to accept `platform` and `accountId` query params
- [ ] Filter posts by account ID columns (facebook_page_id, instagram_account_id, etc.)

**Frontend (`public/js/dashboard.js`):**
- [ ] Update `loadPosts()` to include currentGlobalAccount in API call
- [ ] Pass platform and accountId as query parameters

### B. Comments Tab
**Backend (`src/routes/comments.js`):**
- [ ] Update GET `/api/comments` to accept `platform` and `accountId` params
- [ ] Filter by facebook_page_id or instagram_account_id

**Frontend (`public/js/comments.js`):**
- [ ] Update `loadComments()` to use currentGlobalAccount
- [ ] Pass filters to API

### C. Reviews Tab
**Backend (`src/routes/reviews.js`):**
- [x] Already supports accountId parameter (implemented earlier)

**Frontend (`public/js/reviews.js`):**
- [ ] Update to use `currentGlobalAccount` instead of separate selector
- [ ] Remove redundant reviewAccountSelector

### D. Analytics Tab
**Backend (`public/js/dashboard.js`):**
- [ ] Update `loadAnalytics()` to filter by account
- [ ] Calculate stats for selected account only

### E. Calendar Tab
**Frontend (`public/js/dashboard.js`):**
- [ ] Update `loadCalendar()` to filter posts by account
- [ ] Show only posts for selected account

### F. Post Creation
**Backend:**
- [ ] Update `createPost()` to store account IDs when creating posts
- [ ] Store facebook_page_id, instagram_account_id, etc. based on selected platforms

### G. Scheduler Integration
**Backend (`src/services/scheduler.js`):**
- [ ] When posting, use correct account IDs from post record
- [ ] Ensure posts go to the right accounts

## Implementation Priority
1. Posts Tab filtering (most critical)
2. Post Creation (store account IDs)
3. Comments Tab filtering
4. Reviews Tab (use global switcher)
5. Analytics filtering
6. Calendar filtering

## Testing Checklist
- [ ] Create posts with specific account IDs
- [ ] Switch accounts and verify posts filter correctly
- [ ] Verify comments filter by account
- [ ] Verify reviews filter by account
- [ ] Verify analytics show correct data
- [ ] Verify calendar shows correct posts
- [ ] Test "All Accounts" option
- [ ] Test with single account (switcher hidden)
- [ ] Test mobile responsiveness

## Notes
- All existing posts will have NULL account IDs (show in "All Accounts" view)
- New posts will have account IDs stored
- Frontend gracefully handles missing account IDs
- Backward compatible with existing data
