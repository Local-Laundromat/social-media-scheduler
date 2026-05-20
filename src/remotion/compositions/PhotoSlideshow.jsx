import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

/**
 * Photo Slideshow Composition
 * Creates a dynamic slideshow from an array of image URLs
 *
 * Props:
 * - photos: Array of { url: string, caption?: string }
 * - fps: Frames per second (default: 30)
 * - durationInSeconds: Total video duration
 * - transitionFrames: Number of frames for transition effect
 * - backgroundColor: Background color
 * - textColor: Text color for captions
 */

const PhotoSlide = ({ photo, progress, transitionFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Spring animation for entrance
  const entranceProgress = spring({
    frame: frame - progress * fps,
    fps,
    config: {
      damping: 100,
      stiffness: 200,
      mass: 0.5,
    },
  });

  // Fade and scale effect
  const opacity = interpolate(
    entranceProgress,
    [0, 1],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  const scale = interpolate(
    entranceProgress,
    [0, 1],
    [1.1, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  return (
    <AbsoluteFill
      style={{
        opacity,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
      }}
    >
      <Img
        src={photo.url}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale})`,
        }}
      />
      {photo.caption && (
        <div
          style={{
            position: 'absolute',
            bottom: '10%',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '20px 40px',
            borderRadius: '10px',
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            textAlign: 'center',
            maxWidth: '80%',
          }}
        >
          {photo.caption}
        </div>
      )}
    </AbsoluteFill>
  );
};

export const PhotoSlideshow = ({
  photos = [],
  backgroundColor = '#000000',
  textColor = '#ffffff',
  transitionFrames = 15,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  if (!photos || photos.length === 0) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor,
          justifyContent: 'center',
          alignItems: 'center',
          color: textColor,
          fontSize: 40,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        No photos provided
      </AbsoluteFill>
    );
  }

  // Calculate how long each photo should be displayed
  const framesPerPhoto = Math.floor(durationInFrames / photos.length);

  // Determine which photo to show
  const currentPhotoIndex = Math.min(
    Math.floor(frame / framesPerPhoto),
    photos.length - 1
  );

  const currentPhoto = photos[currentPhotoIndex];
  const progressInCurrentPhoto = frame - currentPhotoIndex * framesPerPhoto;

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      <PhotoSlide
        photo={currentPhoto}
        progress={progressInCurrentPhoto / fps}
        transitionFrames={transitionFrames}
      />
    </AbsoluteFill>
  );
};
