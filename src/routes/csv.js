const express = require('express');
const router = express.Router();
const multer = require('multer');
const Papa = require('papaparse');
const fs = require('fs');
const path = require('path');
const { authenticateSupabase } = require('../middleware/auth');

// Configure multer for CSV upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/csv');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `csv-${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

/**
 * Parse and validate CSV file for bulk post import
 * Expected CSV format:
 * filename, caption, platforms, scheduled_time
 *
 * Example:
 * image1.jpg, "Check out our new product!", "facebook,instagram", "2024-03-20 10:00"
 * video1.mp4, "Behind the scenes", "facebook,instagram,tiktok", "2024-03-21 14:30"
 */
router.post('/upload', authenticateSupabase, upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    const userId = req.userId;
    const csvPath = req.file.path;

    // Read and parse CSV file
    const csvContent = fs.readFileSync(csvPath, 'utf8');

    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        // Clean up CSV file after parsing
        fs.unlinkSync(csvPath);

        const posts = [];
        const errors = [];

        results.data.forEach((row, index) => {
          const rowNum = index + 2; // +2 because: 1 for header, 1 for 0-index

          // Validate required fields
          if (!row.filename || !row.filename.trim()) {
            errors.push(`Row ${rowNum}: Missing filename`);
            return;
          }

          if (!row.platforms || !row.platforms.trim()) {
            errors.push(`Row ${rowNum}: Missing platforms`);
            return;
          }

          // Parse platforms (comma-separated)
          const platforms = row.platforms
            .split(',')
            .map((p) => p.trim().toLowerCase())
            .filter((p) => ['facebook', 'instagram', 'tiktok'].includes(p));

          if (platforms.length === 0) {
            errors.push(`Row ${rowNum}: Invalid platforms. Use: facebook, instagram, tiktok`);
            return;
          }

          // Validate scheduled time if provided
          let scheduledTime = null;
          if (row.scheduled_time && row.scheduled_time.trim()) {
            scheduledTime = new Date(row.scheduled_time.trim());
            if (isNaN(scheduledTime.getTime())) {
              errors.push(`Row ${rowNum}: Invalid scheduled_time format. Use: YYYY-MM-DD HH:MM`);
              return;
            }
          }

          posts.push({
            filename: row.filename.trim(),
            caption: row.caption ? row.caption.trim() : '',
            platforms: platforms.join(','),
            scheduledTime: scheduledTime ? scheduledTime.toISOString() : null,
          });
        });

        if (errors.length > 0) {
          return res.status(400).json({
            error: 'CSV validation failed',
            errors,
            validPosts: posts.length,
          });
        }

        res.json({
          success: true,
          message: `Successfully parsed ${posts.length} posts from CSV`,
          posts,
        });
      },
      error: (error) => {
        // Clean up CSV file on error
        fs.unlinkSync(csvPath);
        res.status(400).json({
          error: 'Failed to parse CSV file',
          details: error.message,
        });
      },
    });
  } catch (error) {
    console.error('CSV upload error:', error);
    res.status(500).json({ error: 'Failed to process CSV file' });
  }
});

/**
 * Download CSV template
 */
router.get('/template', (req, res) => {
  const csvTemplate = `filename,caption,platforms,scheduled_time
image1.jpg,"Check out our new product! #NewArrival","facebook,instagram","2024-03-20 10:00"
video1.mp4,"Behind the scenes footage","facebook,instagram,tiktok","2024-03-21 14:30"
image2.png,"Weekend vibes! 🌴","instagram","2024-03-22 09:00"
`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=quu-import-template.csv');
  res.send(csvTemplate);
});

module.exports = router;
