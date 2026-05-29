import * as Tone from 'tone';

export function createStereoTrackPanner(pan: number = 0): Tone.Panner {
  return new Tone.Panner({
    pan,
    channelCount: 2,
  });
}
