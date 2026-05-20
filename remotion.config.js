/**
 * Remotion configuration for Quu Video Generator
 * This file configures video rendering settings
 */

module.exports = {
  // Video codec settings
  codec: 'h264',

  // Concurrency for rendering (adjust based on your CPU)
  concurrency: 2,

  // Enable pixel format for better compatibility
  pixelFormat: 'yuv420p',

  // Output quality (0-51, lower is better quality but larger file)
  crf: 20,

  // Browser executable for Puppeteer (optional, auto-detected)
  // browserExecutable: null,

  // Disable keyboard shortcuts in Remotion Studio
  keyboardShortcutsEnabled: true,
};
