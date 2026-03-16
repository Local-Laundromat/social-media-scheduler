const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp-originalname
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept images and videos only
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images and videos are allowed!'));
    }
  }
});

/**
 * POST /api/upload - Upload a single file
 * Returns the public URL of the uploaded file
 */
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Get the base URL from environment or request
  const baseUrl = process.env.PUBLIC_FILE_URL || `${req.protocol}://${req.get('host')}`;
  const publicUrl = `${baseUrl}/uploads/${req.file.filename}`;

  res.json({
    success: true,
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
    url: publicUrl,
    path: req.file.path,
  });
});

/**
 * POST /api/upload/multiple - Upload multiple files
 */
router.post('/multiple', upload.array('files', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const baseUrl = process.env.PUBLIC_FILE_URL || `${req.protocol}://${req.get('host')}`;

  const files = req.files.map(file => ({
    filename: file.filename,
    originalName: file.originalname,
    size: file.size,
    mimetype: file.mimetype,
    url: `${baseUrl}/uploads/${file.filename}`,
    path: file.path,
  }));

  res.json({
    success: true,
    count: files.length,
    files,
  });
});

/**
 * DELETE /api/upload/:filename - Delete an uploaded file
 */
router.delete('/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(uploadsDir, filename);

  // Check if file exists
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Delete file
  fs.unlink(filepath, (err) => {
    if (err) {
      console.error('Error deleting file:', err);
      return res.status(500).json({ error: 'Failed to delete file' });
    }

    res.json({
      success: true,
      message: 'File deleted successfully',
      filename,
    });
  });
});

/**
 * GET /api/upload/list - List all uploaded files
 */
router.get('/list', (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read uploads directory' });
    }

    const baseUrl = process.env.PUBLIC_FILE_URL || `${req.protocol}://${req.get('host')}`;

    const fileList = files.map(filename => {
      const filepath = path.join(uploadsDir, filename);
      const stats = fs.statSync(filepath);

      return {
        filename,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        url: `${baseUrl}/uploads/${filename}`,
      };
    });

    res.json({
      count: fileList.length,
      files: fileList,
    });
  });
});

module.exports = router;
