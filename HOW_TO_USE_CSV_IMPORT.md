# How to Use CSV Import for Bulk Post Scheduling

## Quick Start Guide

### Step 1: Prepare Your Media Files
Before creating your CSV, make sure all your media files (images/videos) are in your configured Media Folder:
- Default location: `/Users/aminatamansaray/Downloads/PK Property/Combined Social Media Posts`
- Or check your `.env` file for `MEDIA_FOLDER` setting

### Step 2: Download the CSV Template
1. Go to your Dashboard
2. Click the "Bulk Upload" tab
3. Select "Import from CSV/Spreadsheet" from the dropdown
4. Click "Download CSV Template"

### Step 3: Fill Out Your CSV

Open the template in Excel, Google Sheets, or any spreadsheet software.

**Column Guide:**

| Column | Required | Description | Example |
|--------|----------|-------------|---------|
| `filename` | ✅ Yes | Name of file in Media Folder | `property-kitchen.jpg` |
| `caption` | ❌ No | Post caption (can include hashtags) | `Beautiful home! #RealEstate` |
| `platforms` | ✅ Yes | Comma-separated: facebook,instagram,tiktok | `facebook,instagram` |
| `scheduled_time` | ❌ No | When to post (YYYY-MM-DD HH:MM) | `2024-03-25 09:00` |

**Example CSV Content:**
```csv
filename,caption,platforms,scheduled_time
kitchen.jpg,"Modern kitchen! #Design","facebook,instagram","2024-03-25 09:00"
exterior.jpg,"New listing! 🏡","facebook,instagram,tiktok","2024-03-26 14:30"
bathroom.jpg,"Luxury bathroom ✨","instagram","2024-03-27 10:00"
```

### Step 4: Upload Your CSV
1. Save your CSV file
2. In the dashboard, click the upload area
3. Select your CSV file
4. The system will validate all rows

### Step 5: Review and Confirm
- ✅ Green success message: All posts validated successfully
- ⚠️ Yellow warnings: Some rows have errors (see details)
- Review the post preview
- Click "Create All Posts" to schedule them

### Step 6: View Your Posts
- Posts will appear in the "My Posts" tab
- Check the "Calendar" tab to see your schedule
- Scheduled posts will be automatically published at the specified times

## Common Use Cases

### 1. Weekly Content Calendar
Plan a week's worth of posts:
```csv
filename,caption,platforms,scheduled_time
monday-post.jpg,"Start your week right! #MondayMotivation","facebook,instagram","2024-03-25 08:00"
wednesday-post.jpg,"Mid-week update! #WednesdayWisdom","facebook,instagram","2024-03-27 12:00"
friday-post.jpg,"Weekend is almost here! #FridayFeeling","facebook,instagram","2024-03-29 15:00"
```

### 2. Property Showcase
Multiple listings to post:
```csv
filename,caption,platforms,scheduled_time
123-main-st.jpg,"$450,000 | 3 bed 2 bath | 123 Main St","facebook,instagram,tiktok","2024-03-25 10:00"
456-oak-ave.jpg,"$575,000 | 4 bed 3 bath | 456 Oak Ave","facebook,instagram,tiktok","2024-03-26 10:00"
789-elm-rd.jpg,"$325,000 | 2 bed 2 bath | 789 Elm Rd","facebook,instagram,tiktok","2024-03-27 10:00"
```

### 3. Event Promotion
Build excitement for an upcoming event:
```csv
filename,caption,platforms,scheduled_time
save-the-date.jpg,"Save the date! Open house March 30th","facebook,instagram","2024-03-20 09:00"
1-week-reminder.jpg,"One week until our open house! 🏡","facebook,instagram,tiktok","2024-03-23 12:00"
3-day-reminder.jpg,"3 days left! See you Saturday!","facebook,instagram,tiktok","2024-03-27 16:00"
final-reminder.jpg,"Tomorrow is the day! Open house 10am-4pm","facebook,instagram,tiktok","2024-03-29 18:00"
```

## Tips for Success

### ✅ Best Practices
- **Name files clearly**: Use descriptive filenames (e.g., `property-123-kitchen.jpg` instead of `IMG_001.jpg`)
- **Test with small batches**: Start with 3-5 posts to verify everything works
- **Double-check dates**: Make sure scheduled times are in the future
- **Use proper time zones**: Times are in your local timezone
- **Include hashtags**: Add relevant hashtags to increase reach
- **Vary platforms**: Don't post everything everywhere - target your audience

### ❌ Common Mistakes to Avoid
- ❌ Uploading files instead of just the filename
- ❌ Using files that don't exist in your Media Folder
- ❌ Forgetting quotes around captions with commas
- ❌ Wrong date format (use YYYY-MM-DD HH:MM)
- ❌ Invalid platform names (only facebook, instagram, tiktok)
- ❌ Scheduling posts in the past

## Troubleshooting

### "Missing filename" Error
**Problem**: The filename column is empty
**Solution**: Fill in the filename for every row

### "Invalid platforms" Error
**Problem**: Platform names are misspelled or invalid
**Solution**: Use only: `facebook`, `instagram`, or `tiktok` (lowercase, comma-separated)

### "Invalid scheduled_time format" Error
**Problem**: Date is not in the correct format
**Solution**: Use format: `2024-03-25 09:00` (YYYY-MM-DD HH:MM)

### Posts Not Creating
**Problem**: Files don't exist in Media Folder
**Solution**: Verify all files are in your configured Media Folder with exact filenames

### CSV Won't Upload
**Problem**: File is too large or wrong format
**Solution**:
- Make sure file extension is `.csv`
- Keep CSV under 1000 rows for best performance
- Save as CSV (not Excel .xlsx)

## Advanced Tips

### 1. Using Excel/Google Sheets Formulas
Generate scheduled times automatically:
```excel
=TEXT(TODAY()+ROW()-1,"yyyy-mm-dd")&" 09:00"
```

### 2. Bulk Caption Generation
Use AI to generate captions, then export to CSV:
1. Create post in dashboard
2. Use "Generate with AI" feature
3. Copy caption to your spreadsheet
4. Repeat for all posts

### 3. Reposting Successful Content
1. Export your analytics
2. Identify top-performing posts
3. Create CSV with same content, new dates
4. Repost to different platforms or times

## Sample Files

Check the project folder for:
- ✅ `test-import.csv` - Working example with 5 posts
- ✅ CSV template (download from dashboard)

## Need Help?

**Common Questions:**
- Q: Can I use videos?
  A: Yes! Just include the video filename (e.g., `property-tour.mp4`)

- Q: What if I don't have a scheduled time?
  A: Leave it blank and posts will be created as drafts

- Q: Can I edit posts after import?
  A: Yes! Go to Calendar or My Posts to edit individual posts

- Q: Is there a limit?
  A: No hard limit, but we recommend batches of 50 or less for best performance

---

**Ready to try it?** 🚀

1. Open http://localhost:3000/dashboard
2. Go to Bulk Upload tab
3. Select "Import from CSV/Spreadsheet"
4. Upload `test-import.csv` to see it in action!
