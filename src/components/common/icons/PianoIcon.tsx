import React from 'react';

type PianoIconProps = React.SVGProps<SVGSVGElement>;

/**
 * PianoIcon – keyboard-style icon in a Font Awesome-like solid style
 * - Uses currentColor
 * - Scales with font size (1em)
 * - viewBox matches FA dimensions
 */
const PianoIcon: React.FC<PianoIconProps> = (props) => (
  <svg
    viewBox="0 0 576 512"
    width="1em"
    height="1em"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    {/*
      Build a frame with even-odd fill, then add inner black keys as filled bars.
      Outer frame: 48,64 → 528x320
      Inner hole:  96,112 → 384x224
      Top slot:    112,128 → 352x32
      Black keys:  four bars centered
    */}
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="
        M48 64h480v320H48V64z
        M96 112h384v224H96V112z
        M112 128h352v32H112v-32z
        M176 160h24v136h-24V160z
        M240 160h24v136h-24V160z
        M304 160h24v136h-24V160z
        M368 160h24v136h-24V160z
      "
    />
  </svg>
);

export default PianoIcon;


