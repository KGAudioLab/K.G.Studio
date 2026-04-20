import React from 'react';

type MetronomeIconProps = React.SVGProps<SVGSVGElement>;

/**
 * MetronomeIcon – metronome silhouette in a Font Awesome-like solid style
 * - Uses currentColor
 * - Scales with font size (1em)
 */
const MetronomeIcon: React.FC<MetronomeIconProps> = (props) => (
  <svg
    viewBox="0 0 512 512"
    width="1em"
    height="1em"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    {/*
      Trapezoidal body with hollow interior, pendulum arm, and weight.
      fillRule=evenodd: regions covered by an odd number of sub-paths are filled.
        - Outer trapezoid: 1 crossing → filled (solid walls)
        - Inner hole:      2 crossings → transparent
        - Pendulum:        3 crossings → filled (visible inside hole)
        - Weight:          3 crossings → filled (visible inside hole, no overlap with pendulum)
    */}
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="
        M 208 80 L 304 80 L 432 464 L 80 464 Z
        M 226 112 L 286 112 L 396 432 L 116 432 Z
        M 250 112 L 262 112 L 244 330 L 232 330 Z
        M 222 330 L 264 330 L 260 362 L 226 362 Z
      "
    />
  </svg>
);

export default MetronomeIcon;
