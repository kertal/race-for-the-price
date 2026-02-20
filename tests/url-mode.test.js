import { describe, it, expect } from 'vitest';
import { isUrl, deriveRacerName, buildDefaultRaceScript } from '../cli/config.js';

describe('isUrl', () => {
  it('recognizes https URLs', () => {
    expect(isUrl('https://react.dev')).toBe(true);
    expect(isUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('recognizes http URLs', () => {
    expect(isUrl('http://localhost:3000')).toBe(true);
    expect(isUrl('http://example.com')).toBe(true);
  });

  it('is case insensitive for protocol', () => {
    expect(isUrl('HTTPS://example.com')).toBe(true);
    expect(isUrl('Http://example.com')).toBe(true);
  });

  it('rejects non-URL strings', () => {
    expect(isUrl('./races/my-race')).toBe(false);
    expect(isUrl('/absolute/path')).toBe(false);
    expect(isUrl('relative/path')).toBe(false);
    expect(isUrl('example.com')).toBe(false);
    expect(isUrl('ftp://files.example.com')).toBe(false);
    expect(isUrl('--parallel')).toBe(false);
  });
});

describe('deriveRacerName', () => {
  it('extracts hostname from URL', () => {
    expect(deriveRacerName('https://react.dev')).toBe('react.dev');
    expect(deriveRacerName('https://angular.dev')).toBe('angular.dev');
  });

  it('strips www prefix', () => {
    expect(deriveRacerName('https://www.example.com')).toBe('example.com');
    expect(deriveRacerName('https://www.google.com/search')).toBe('google.com');
  });

  it('handles URLs with ports', () => {
    expect(deriveRacerName('http://localhost:3000')).toBe('localhost');
  });

  it('handles URLs with paths', () => {
    expect(deriveRacerName('https://docs.python.org/3/library')).toBe('docs.python.org');
  });

  it('handles invalid URLs with fallback', () => {
    const name = deriveRacerName('not-a-url');
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });
});

describe('buildDefaultRaceScript', () => {
  it('generates a script that navigates to the URL', () => {
    const script = buildDefaultRaceScript('https://react.dev');
    expect(script).toContain("page.goto(\"https://react.dev\"");
    expect(script).toContain("waitUntil: 'load'");
  });

  it('includes raceStart and raceEnd calls', () => {
    const script = buildDefaultRaceScript('https://example.com');
    expect(script).toContain("page.raceStart('Page Load')");
    expect(script).toContain("page.raceEnd('Page Load')");
  });

  it('properly escapes URLs with special characters', () => {
    const script = buildDefaultRaceScript('https://example.com/path?q=1&b=2');
    expect(script).toContain('https://example.com/path?q=1&b=2');
  });

  it('generates different scripts for different URLs', () => {
    const script1 = buildDefaultRaceScript('https://a.com');
    const script2 = buildDefaultRaceScript('https://b.com');
    expect(script1).not.toBe(script2);
  });
});
