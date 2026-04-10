import { describe, it, expect } from 'vitest';
import { isValidProjectName, sanitizeProjectName } from './projectNameUtil';

describe('isValidProjectName', () => {
  it('accepts simple alphanumeric names', () => {
    expect(isValidProjectName('MyProject')).toBe(true);
    expect(isValidProjectName('project123')).toBe(true);
  });

  it('accepts names with allowed special characters', () => {
    expect(isValidProjectName('My Song')).toBe(true);
    expect(isValidProjectName('song-v2')).toBe(true);
    expect(isValidProjectName('song_final')).toBe(true);
    expect(isValidProjectName('song.backup')).toBe(true);
    expect(isValidProjectName('Song (v2)')).toBe(true);
  });

  it('rejects empty or whitespace-only names', () => {
    expect(isValidProjectName('')).toBe(false);
    expect(isValidProjectName('   ')).toBe(false);
  });

  it('rejects names starting with a dot', () => {
    expect(isValidProjectName('.hidden')).toBe(false);
  });

  it('rejects names with disallowed characters', () => {
    expect(isValidProjectName('my/song')).toBe(false);
    expect(isValidProjectName('my\\song')).toBe(false);
    expect(isValidProjectName('my:song')).toBe(false);
    expect(isValidProjectName('my*song')).toBe(false);
    expect(isValidProjectName('my?song')).toBe(false);
    expect(isValidProjectName('my"song')).toBe(false);
    expect(isValidProjectName('my<song')).toBe(false);
    expect(isValidProjectName('my>song')).toBe(false);
    expect(isValidProjectName('my|song')).toBe(false);
  });

  it('accepts accented characters', () => {
    expect(isValidProjectName('Café Waltz')).toBe(true);
    expect(isValidProjectName('Ñoño')).toBe(true);
  });
});

describe('sanitizeProjectName', () => {
  it('returns valid names unchanged', () => {
    expect(sanitizeProjectName('My Song')).toBe('My Song');
    expect(sanitizeProjectName('project-123')).toBe('project-123');
  });

  it('replaces disallowed characters with underscores', () => {
    expect(sanitizeProjectName('my/song')).toBe('my_song');
    expect(sanitizeProjectName('my:song')).toBe('my_song');
    expect(sanitizeProjectName('a*b?c')).toBe('a_b_c');
  });

  it('collapses consecutive underscores', () => {
    expect(sanitizeProjectName('a///b')).toBe('a_b');
    expect(sanitizeProjectName('a__b')).toBe('a_b');
  });

  it('collapses consecutive spaces', () => {
    expect(sanitizeProjectName('a   b')).toBe('a b');
  });

  it('trims leading/trailing whitespace, underscores, and dots', () => {
    expect(sanitizeProjectName('  My Song  ')).toBe('My Song');
    expect(sanitizeProjectName('__song__')).toBe('song');
    expect(sanitizeProjectName('.hidden')).toBe('hidden');
    expect(sanitizeProjectName('...dots...')).toBe('dots');
  });

  it('returns fallback for names that become empty after sanitization', () => {
    expect(sanitizeProjectName('///')).toBe('Untitled Project');
    expect(sanitizeProjectName('...')).toBe('Untitled Project');
    expect(sanitizeProjectName('___')).toBe('Untitled Project');
  });
});
