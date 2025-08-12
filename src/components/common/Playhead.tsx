import React from 'react';
import { KGCore } from '../../core/KGCore';
import { useProjectStore } from '../../stores/projectStore';

interface PlayheadProps {
  /** Context where the playhead is being rendered */
  context: 'main-grid' | 'piano-roll';
  /** For piano roll context, the region start beat offset */
  regionStartBeat?: number;
}

const Playhead: React.FC<PlayheadProps> = ({ context, regionStartBeat = 0 }) => {
  const { timeSignature, playheadPosition } = useProjectStore();

  // Calculate the pixel position based on context
  const getPixelPosition = (): number => {
    if (context === 'main-grid') {
      // In main grid, convert beats to bars, then bars to pixels
      const beatsPerBar = timeSignature.numerator;
      const barPosition = playheadPosition / beatsPerBar;
      
      // Get bar width from CSS variable
      const barWidth = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--track-grid-bar-width')
      ) || 40;
      
      return barPosition * barWidth;
    } else {
      // In piano roll, use beat-based positioning
      // Get beat width from CSS variable
      const beatWidth = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')
      ) || 40;
      
      return playheadPosition * beatWidth;
    }
  };

  const pixelPosition = getPixelPosition();

  // Don't render if position is negative (before region start in piano roll)
  if (pixelPosition < 0) {
    return null;
  }

  const playheadStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${pixelPosition}px`,
    top: 0,
    bottom: 0,
    width: '2px',
    backgroundColor: '#4ECDC4', // Blue-green color similar to the reference image
    zIndex: 1000,
    pointerEvents: 'none', // Allow clicks to pass through
    boxShadow: '0 0 4px rgba(78, 205, 196, 0.5)', // Subtle glow effect
  };

  // Triangle indicator style (only for main-grid context)
  const triangleStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${pixelPosition - 5}px`, // Center the triangle on the playhead line
    top: '-2px', // Position slightly above the top
    width: 0,
    height: 0,
    borderLeft: '6px solid transparent',
    borderRight: '6px solid transparent',
    borderTop: '8px solid #4ECDC4',
    zIndex: 1001,
    pointerEvents: 'none',
  };

  return (
    <>
      <div className="playhead" style={playheadStyle} />
      {context === 'main-grid' && (
        <div className="playhead-triangle" style={triangleStyle} />
      )}
    </>
  );
};

export default Playhead; 