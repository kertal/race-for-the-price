import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatTimestamp, buildResultsPaths, waitForEnter } from '../race.js';
import { EventEmitter } from 'events';

describe('formatTimestamp', () => {
  it('formats date as YYYY-MM-DD_HH-MM-SS', () => {
    const date = new Date('2024-03-15T09:05:07');
    expect(formatTimestamp(date)).toBe('2024-03-15_09-05-07');
  });

  it('pads single-digit values with zeros', () => {
    const date = new Date('2024-01-02T03:04:05');
    expect(formatTimestamp(date)).toBe('2024-01-02_03-04-05');
  });

  it('handles end of year dates', () => {
    const date = new Date('2024-12-31T23:59:59');
    expect(formatTimestamp(date)).toBe('2024-12-31_23-59-59');
  });
});

describe('buildResultsPaths', () => {
  it('returns relative paths from cwd', () => {
    const { relResults, relHtml } = buildResultsPaths('/project/races/test/results-2024', '/project');
    expect(relResults).toBe('races/test/results-2024');
    expect(relHtml).toBe('races/test/results-2024/index.html');
  });

  it('always points to top-level index.html', () => {
    const { relHtml } = buildResultsPaths('/project/results', '/project');
    expect(relHtml).toBe('results/index.html');
  });

  it('handles same directory as cwd', () => {
    const { relResults, relHtml } = buildResultsPaths('/project/results', '/project/results');
    expect(relResults).toBe('');
    expect(relHtml).toBe('index.html');
  });
});

describe('waitForEnter', () => {
  let origStdin;
  let mockStdin;

  beforeEach(() => {
    origStdin = {
      isTTY: process.stdin.isTTY,
      readableEnded: process.stdin.readableEnded,
    };
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: origStdin.isTTY, writable: true, configurable: true });
    Object.defineProperty(process.stdin, 'readableEnded', { value: origStdin.readableEnded, writable: true, configurable: true });
  });

  it('resolves immediately in non-TTY environments', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => {});
    await waitForEnter('test prompt ');
    expect(stderrSpy).toHaveBeenCalledWith('test prompt (skipped — non-interactive)\n');
    stderrSpy.mockRestore();
  });

  it('resolves immediately when stdin has already ended', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true, configurable: true });
    Object.defineProperty(process.stdin, 'readableEnded', { value: true, writable: true, configurable: true });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => {});
    await waitForEnter('test prompt ');
    expect(stderrSpy).toHaveBeenCalledWith('test prompt (skipped — non-interactive)\n');
    stderrSpy.mockRestore();
  });
});
