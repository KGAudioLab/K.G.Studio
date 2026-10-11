import { expect, it } from 'vitest';
import { limiterHistoryPath, reductionHistoryPath } from './limiterHistoryPath';

it('interpolates each trace at the window boundary rather than dropping to its baseline', () => {
  const history = [
    { time: 0, peakDb: -100, reductionDb: 0 },
    { time: 0.1, peakDb: 0, reductionDb: -30 },
    { time: 8.05, peakDb: -20, reductionDb: -15 },
  ];
  expect(limiterHistoryPath(history, { fps: 10, historySeconds: 8, minDb: -100, maxDb: 0 }))
    .toMatch(/^M0\.00,110 L0\.00,55\.00/);
  expect(reductionHistoryPath(history, 8, 30)).toMatch(/^M0\.00,0 L0\.00,55\.00/);
});

it('leaves the unrecorded area empty while history initially fills', () => {
  expect(reductionHistoryPath([{ time: 1, peakDb: -20, reductionDb: -15 }], 8, 30))
    .toMatch(/^M600\.00,0 L600\.00,55\.00/);
});
