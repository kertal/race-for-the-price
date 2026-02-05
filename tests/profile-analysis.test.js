/**
 * Tests for the profile analysis module.
 */

import { describe, it, expect } from 'vitest';
import { buildProfileComparison, PROFILE_METRICS } from '../cli/profile-analysis.js';

describe('buildProfileComparison', () => {
  it('returns empty comparisons when no metrics provided', () => {
    const result = buildProfileComparison(['racer1', 'racer2'], [null, null]);
    expect(result.comparisons).toEqual([]);
    expect(result.overallWinner).toBeNull();
  });

  it('compares network transfer size (lower is better)', () => {
    const metrics1 = { networkTransferSize: 1000, networkRequestCount: 5 };
    const metrics2 = { networkTransferSize: 2000, networkRequestCount: 10 };
    const result = buildProfileComparison(['fast', 'slow'], [metrics1, metrics2]);

    const transferComp = result.comparisons.find(c => c.key === 'networkTransferSize');
    expect(transferComp.winner).toBe('fast');
    expect(transferComp.values).toEqual([1000, 2000]);
    expect(transferComp.diffPercent).toBe(100); // 100% difference
  });

  it('compares script duration (lower is better)', () => {
    const metrics1 = { scriptDuration: 500 }; // 500ms
    const metrics2 = { scriptDuration: 250 }; // 250ms
    const result = buildProfileComparison(['slow', 'fast'], [metrics1, metrics2]);

    const scriptComp = result.comparisons.find(c => c.key === 'scriptDuration');
    expect(scriptComp.winner).toBe('fast');
  });

  it('handles tie when values are equal', () => {
    const metrics1 = { networkTransferSize: 1000 };
    const metrics2 = { networkTransferSize: 1000 };
    const result = buildProfileComparison(['a', 'b'], [metrics1, metrics2]);

    const comp = result.comparisons.find(c => c.key === 'networkTransferSize');
    expect(comp.winner).toBeNull();
  });

  it('calculates overall winner based on wins', () => {
    const metrics1 = {
      networkTransferSize: 500,
      networkRequestCount: 3,
      scriptDuration: 100
    };
    const metrics2 = {
      networkTransferSize: 1000,
      networkRequestCount: 10,
      scriptDuration: 200
    };
    const result = buildProfileComparison(['winner', 'loser'], [metrics1, metrics2]);

    expect(result.overallWinner).toBe('winner');
    expect(result.wins['winner']).toBe(3);
    expect(result.wins['loser']).toBe(0);
  });

  it('handles partial metrics from one racer', () => {
    const metrics1 = { networkTransferSize: 1000, scriptDuration: 100 };
    const metrics2 = { networkTransferSize: 2000 }; // missing scriptDuration
    const result = buildProfileComparison(['a', 'b'], [metrics1, metrics2]);

    const transferComp = result.comparisons.find(c => c.key === 'networkTransferSize');
    expect(transferComp).toBeDefined();
    expect(transferComp.winner).toBe('a');

    const scriptComp = result.comparisons.find(c => c.key === 'scriptDuration');
    // scriptDuration should be skipped since only one racer has it
    expect(scriptComp.values[1]).toBeNull();
  });

  it('groups comparisons by category', () => {
    const metrics = {
      networkTransferSize: 1000,
      networkRequestCount: 5,
      domContentLoaded: 100,
      scriptDuration: 50
    };
    const result = buildProfileComparison(['a', 'b'], [metrics, metrics]);

    expect(result.byCategory.network).toHaveLength(2);
    expect(result.byCategory.loading).toHaveLength(1);
    expect(result.byCategory.computation).toHaveLength(1);
  });
});

describe('PROFILE_METRICS', () => {
  it('defines all expected metrics', () => {
    const expectedKeys = [
      'networkTransferSize',
      'networkRequestCount',
      'domContentLoaded',
      'domComplete',
      'jsHeapUsedSize',
      'scriptDuration',
      'layoutDuration',
      'recalcStyleDuration',
      'taskDuration'
    ];

    for (const key of expectedKeys) {
      expect(PROFILE_METRICS[key]).toBeDefined();
      expect(PROFILE_METRICS[key].name).toBeDefined();
      expect(PROFILE_METRICS[key].format).toBeInstanceOf(Function);
      expect(PROFILE_METRICS[key].category).toBeDefined();
    }
  });

  it('formats bytes correctly', () => {
    const format = PROFILE_METRICS.networkTransferSize.format;
    expect(format(0)).toBe('0 B');
    expect(format(500)).toBe('500.0 B');
    expect(format(1024)).toBe('1.0 KB');
    expect(format(1536)).toBe('1.5 KB');
    expect(format(1048576)).toBe('1.0 MB');
  });

  it('formats milliseconds correctly', () => {
    const format = PROFILE_METRICS.scriptDuration.format;
    expect(format(0.5)).toContain('μs');
    expect(format(50)).toBe('50.0ms');
    expect(format(1500)).toBe('1.50s');
  });
});
