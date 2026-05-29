import fs from 'node:fs';
import path from 'node:path';
import { plainToInstance } from 'class-transformer';
import { describe, expect, it } from 'vitest';
import { KGProject } from '../../core/KGProject';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import {
  DEFAULT_MIDI_CHORD_DETECTION_OPTIONS,
  buildMidiChordWindowsForRegion,
  detectChordsFromMidi,
} from '../../util/midiChordDetection';

const FIXTURE_PATH = path.resolve(process.cwd(), 'public/test-data/chord-progression-01.json');
const TARGET_REGION_ID = 'KGMidiRegion_1779769428819_b7o8981rl';

function loadFixtureProject(): KGProject {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8')) as Record<string, unknown>;
  const deserializedResult = plainToInstance(KGProject, fixture);
  const project = Array.isArray(deserializedResult) ? deserializedResult[0] ?? null : deserializedResult;
  if (!project) {
    throw new Error('Failed to deserialize MIDI chord detection fixture');
  }
  return project;
}

function getFixtureRegion(project: KGProject): KGMidiRegion {
  for (const track of project.getTracks()) {
    if (!(track instanceof KGMidiTrack)) {
      continue;
    }

    const region = track.getRegions().find((candidate): candidate is KGMidiRegion => (
      candidate instanceof KGMidiRegion && candidate.getId() === TARGET_REGION_ID
    ));
    if (region) {
      return region;
    }
  }

  throw new Error(`Fixture region ${TARGET_REGION_ID} not found`);
}

describe('midi chord detection fixture', () => {
  it('detects the expected bar-locked progression with triads only', () => {
    const project = loadFixtureProject();
    const region = getFixtureRegion(project);
    const windows = buildMidiChordWindowsForRegion(project, region);
    const results = detectChordsFromMidi({
      project,
      region,
      windows,
      options: DEFAULT_MIDI_CHORD_DETECTION_OPTIONS,
    });

    expect(results.map(result => result.symbol)).toEqual([
      'Am',
      'F',
      'Dm',
      'E',
      'Am',
      'C',
      'Dm',
      'E',
    ]);
  });

  it('detects the expected bar-locked progression with sevenths enabled', () => {
    const project = loadFixtureProject();
    const region = getFixtureRegion(project);
    const windows = buildMidiChordWindowsForRegion(project, region);
    const results = detectChordsFromMidi({
      project,
      region,
      windows,
      options: {
        ...DEFAULT_MIDI_CHORD_DETECTION_OPTIONS,
        enableSevenths: true,
      },
    });

    expect(results.map(result => result.symbol)).toEqual([
      'Am',
      'F',
      'Dm',
      'E7',
      'Am',
      'C',
      'Dm',
      'E7',
    ]);
  });
});
