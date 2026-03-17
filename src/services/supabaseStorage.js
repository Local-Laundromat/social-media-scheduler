/**
 * Supabase Storage Service
 * Handles file uploads to Supabase Storage bucket
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const BUCKET_NAME = 'quu-media';

/**
 * Upload a file to Supabase Storage
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - File name
 * @param {string} mimeType - MIME type
 * @returns {Promise<{success, url, error}>}
 */
async function uploadFile(fileBuffer, fileName, mimeType) {
  try {
    // Generate unique filename
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}-${fileName}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(uniqueFileName, fileBuffer, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Supabase storage upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(uniqueFileName);

    console.log(`✅ Uploaded to Supabase Storage: ${uniqueFileName}`);

    return {
      success: true,
      url: publicUrl,
      filename: uniqueFileName,
      path: publicUrl
    };

  } catch (error) {
    console.error('Upload error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete a file from Supabase Storage
 * @param {string} fileName - File name to delete
 * @returns {Promise<{success, error}>}
 */
async function deleteFile(fileName) {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([fileName]);

    if (error) {
      console.error('Supabase storage delete error:', error);
      return {
        success: false,
        error: error.message
      };
    }

    console.log(`🗑️  Deleted from Supabase Storage: ${fileName}`);

    return {
      success: true
    };

  } catch (error) {
    console.error('Delete error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get public URL for a file
 * @param {string} fileName - File name
 * @returns {string} Public URL
 */
function getPublicUrl(fileName) {
  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(fileName);

  return data.publicUrl;
}

/**
 * List all files in the bucket
 * @param {string} folder - Optional folder path
 * @returns {Promise<Array>} List of files
 */
async function listFiles(folder = '') {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folder, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) {
      console.error('List files error:', error);
      return [];
    }

    return data;

  } catch (error) {
    console.error('List files error:', error);
    return [];
  }
}

/**
 * Check if Supabase Storage is configured
 * @returns {boolean}
 */
function isConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

module.exports = {
  uploadFile,
  deleteFile,
  getPublicUrl,
  listFiles,
  isConfigured,
  supabase,
  BUCKET_NAME
};
