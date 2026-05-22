/**
 * Media Validation for Multi-Platform Posting
 * Checks if a single file meets requirements for selected platforms
 */

const PLATFORM_SPECS = {
  facebook: {
    image: {
      formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      maxSize: 4 * 1024 * 1024, // 4MB
      recommendedAspect: [16/9, 1/1, 4/5], // Multiple accepted
      minWidth: 600,
      minHeight: 315
    },
    video: {
      formats: ['mp4', 'mov', 'avi'],
      maxSize: 4 * 1024 * 1024 * 1024, // 4GB
      recommendedAspect: [16/9, 1/1, 9/16],
      minDuration: 1, // seconds
      maxDuration: 240 * 60 // 240 minutes
    }
  },
  instagram: {
    image: {
      formats: ['jpg', 'jpeg', 'png'],
      maxSize: 8 * 1024 * 1024, // 8MB
      recommendedAspect: [1/1, 4/5], // Square or portrait
      minWidth: 320,
      minHeight: 320,
      maxWidth: 1080,
      maxHeight: 1350
    },
    video: {
      formats: ['mp4', 'mov'],
      maxSize: 100 * 1024 * 1024, // 100MB (feed), 650MB (reels)
      recommendedAspect: [9/16, 4/5, 1/1], // Vertical preferred
      minDuration: 3,
      maxDuration: 60 // 60 seconds for feed, 90 for reels
    }
  },
  tiktok: {
    video: {
      formats: ['mp4', 'mov', 'mpeg', 'avi', 'webm'],
      maxSize: 287 * 1024 * 1024, // 287MB
      recommendedAspect: [9/16], // MUST be vertical
      minDuration: 3,
      maxDuration: 10 * 60, // 10 minutes
      requiredWidth: 1080, // TikTok is strict
      requiredHeight: 1920
    }
  },
  pinterest: {
    image: {
      formats: ['jpg', 'jpeg', 'png'],
      maxSize: 32 * 1024 * 1024, // 32MB
      recommendedAspect: [2/3, 1/1], // Vertical preferred
      minWidth: 600,
      minHeight: 900
    },
    video: {
      formats: ['mp4', 'mov', 'm4v'],
      maxSize: 2 * 1024 * 1024 * 1024, // 2GB
      recommendedAspect: [1/1, 9/16, 2/3],
      minDuration: 4,
      maxDuration: 15 * 60 // 15 minutes
    }
  },
  youtube: {
    video: {
      formats: ['mp4', 'mov', 'avi', 'flv', 'wmv', 'webm'],
      maxSize: 256 * 1024 * 1024 * 1024, // 256GB
      recommendedAspect: [16/9], // Landscape
      minDuration: 1,
      maxDuration: 12 * 60 * 60 // 12 hours
    }
  }
};

/**
 * Validate if file meets requirements for selected platforms
 * @param {Object} file - File metadata from upload
 * @param {Array} platforms - Array of platform names ['facebook', 'tiktok']
 * @returns {Object} { valid: boolean, warnings: [], errors: [] }
 */
function validateMultiPlatformMedia(file, platforms) {
  const { mimetype, size, width, height, duration } = file;
  const isVideo = mimetype.startsWith('video/');
  const isImage = mimetype.startsWith('image/');

  const warnings = [];
  const errors = [];
  const recommendations = [];

  // Get aspect ratio
  const aspectRatio = width && height ? width / height : null;

  platforms.forEach(platform => {
    const spec = PLATFORM_SPECS[platform.toLowerCase()];
    if (!spec) return;

    const mediaSpec = isVideo ? spec.video : spec.image;
    if (!mediaSpec) {
      errors.push(`${platform} does not support ${isVideo ? 'videos' : 'images'}`);
      return;
    }

    // Check file size
    if (size > mediaSpec.maxSize) {
      errors.push(
        `${platform}: File too large (${(size / 1024 / 1024).toFixed(1)}MB). ` +
        `Max: ${(mediaSpec.maxSize / 1024 / 1024).toFixed(0)}MB`
      );
    }

    // Check aspect ratio
    if (aspectRatio && mediaSpec.recommendedAspect) {
      const matchesAspect = mediaSpec.recommendedAspect.some(recommended => {
        return Math.abs(aspectRatio - recommended) < 0.1; // 10% tolerance
      });

      if (!matchesAspect) {
        const recommendedRatios = mediaSpec.recommendedAspect
          .map(r => r === 16/9 ? '16:9' : r === 9/16 ? '9:16' : r === 1 ? '1:1' : r === 4/5 ? '4:5' : r === 2/3 ? '2:3' : r.toFixed(2))
          .join(' or ');

        warnings.push(
          `${platform}: Aspect ratio ${aspectRatio.toFixed(2)} may not look optimal. ` +
          `Recommended: ${recommendedRatios}`
        );
      }
    }

    // TikTok strict requirements
    if (platform.toLowerCase() === 'tiktok' && isVideo) {
      if (width !== mediaSpec.requiredWidth || height !== mediaSpec.requiredHeight) {
        warnings.push(
          `TikTok works best with 1080×1920 (9:16 vertical). ` +
          `Your video is ${width}×${height}. May have black bars.`
        );
      }
    }

    // Check duration for videos
    if (isVideo && duration) {
      if (duration < mediaSpec.minDuration) {
        errors.push(`${platform}: Video too short (${duration}s). Min: ${mediaSpec.minDuration}s`);
      }
      if (duration > mediaSpec.maxDuration) {
        errors.push(`${platform}: Video too long (${duration}s). Max: ${mediaSpec.maxDuration}s`);
      }
    }

    // Check dimensions
    if (width && height) {
      if (mediaSpec.minWidth && width < mediaSpec.minWidth) {
        errors.push(`${platform}: Width too small (${width}px). Min: ${mediaSpec.minWidth}px`);
      }
      if (mediaSpec.minHeight && height < mediaSpec.minHeight) {
        errors.push(`${platform}: Height too small (${height}px). Min: ${mediaSpec.minHeight}px`);
      }
      if (mediaSpec.maxWidth && width > mediaSpec.maxWidth) {
        warnings.push(`${platform}: Width ${width}px exceeds ${mediaSpec.maxWidth}px (will be resized)`);
      }
      if (mediaSpec.maxHeight && height > mediaSpec.maxHeight) {
        warnings.push(`${platform}: Height ${height}px exceeds ${mediaSpec.maxHeight}px (will be resized)`);
      }
    }
  });

  // Cross-platform recommendations
  if (platforms.length > 1) {
    if (platforms.includes('tiktok') && platforms.includes('youtube')) {
      recommendations.push(
        '💡 Tip: TikTok requires vertical (9:16), YouTube prefers horizontal (16:9). ' +
        'Consider posting separate videos for best results.'
      );
    }

    if (platforms.includes('tiktok') && platforms.includes('facebook')) {
      recommendations.push(
        '💡 Using vertical video for TikTok will work on Facebook but may have black bars. ' +
        'This is normal for multi-platform posting.'
      );
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    recommendations,
    summary: errors.length === 0
      ? `✓ File compatible with ${platforms.join(', ')}`
      : `✗ File has ${errors.length} blocking issue(s)`
  };
}

/**
 * Get optimal aspect ratio recommendation for platform mix
 * @param {Array} platforms - Array of platform names
 * @returns {Object} { ratio: string, description: string }
 */
function getOptimalAspectRatio(platforms) {
  if (platforms.length === 1) {
    const platform = platforms[0].toLowerCase();
    const recommendations = {
      facebook: { ratio: '16:9', description: 'Landscape for best engagement' },
      instagram: { ratio: '4:5', description: 'Vertical portrait for feed' },
      tiktok: { ratio: '9:16', description: 'Full-screen vertical required' },
      pinterest: { ratio: '2:3', description: 'Vertical pin format' },
      youtube: { ratio: '16:9', description: 'Standard YouTube landscape' }
    };
    return recommendations[platform] || { ratio: '1:1', description: 'Square format (safe default)' };
  }

  // Multi-platform recommendations
  const hasVertical = platforms.some(p => ['tiktok', 'pinterest', 'instagram'].includes(p.toLowerCase()));
  const hasHorizontal = platforms.some(p => ['youtube', 'facebook'].includes(p.toLowerCase()));

  if (hasVertical && hasHorizontal) {
    return {
      ratio: '1:1',
      description: 'Square (1:1) works on all platforms but not optimal for any. Consider posting separately.'
    };
  }

  if (hasVertical) {
    return {
      ratio: '9:16',
      description: 'Vertical format for TikTok, Instagram, Pinterest'
    };
  }

  return {
    ratio: '16:9',
    description: 'Landscape format for YouTube, Facebook'
  };
}

module.exports = {
  validateMultiPlatformMedia,
  getOptimalAspectRatio,
  PLATFORM_SPECS
};
