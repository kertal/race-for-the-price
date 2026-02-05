/**
 * Profile analysis module for network and performance metric comparisons.
 * Captures and compares detailed performance metrics when --profile is enabled.
 *
 * Metrics are captured via Chrome DevTools Protocol during race execution.
 * All metrics follow "less is better" - lower values win.
 */

import { c } from './colors.js';

/**
 * Performance metric definitions.
 * Each metric has a name, description, unit, and extraction function.
 */
export const PROFILE_METRICS = {
  // Network metrics
  networkTransferSize: {
    name: 'Network Transfer',
    description: 'Total bytes transferred over network',
    unit: 'bytes',
    format: formatBytes,
    category: 'network'
  },
  networkRequestCount: {
    name: 'Network Requests',
    description: 'Total number of network requests',
    unit: 'requests',
    format: (v) => `${v} req`,
    category: 'network'
  },

  // Timing metrics (from Performance API)
  domContentLoaded: {
    name: 'DOM Content Loaded',
    description: 'Time until DOMContentLoaded event',
    unit: 'ms',
    format: formatMs,
    category: 'loading'
  },
  domComplete: {
    name: 'DOM Complete',
    description: 'Time until DOM is fully loaded',
    unit: 'ms',
    format: formatMs,
    category: 'loading'
  },

  // Runtime metrics (from CDP Performance.getMetrics)
  jsHeapUsedSize: {
    name: 'JS Heap Used',
    description: 'JavaScript heap memory used',
    unit: 'bytes',
    format: formatBytes,
    category: 'memory'
  },
  scriptDuration: {
    name: 'Script Execution',
    description: 'Total JavaScript execution time',
    unit: 'ms',
    format: formatMs,
    category: 'computation'
  },
  layoutDuration: {
    name: 'Layout Time',
    description: 'Time spent calculating layouts',
    unit: 'ms',
    format: formatMs,
    category: 'rendering'
  },
  recalcStyleDuration: {
    name: 'Style Recalculation',
    description: 'Time spent recalculating styles',
    unit: 'ms',
    format: formatMs,
    category: 'rendering'
  },
  taskDuration: {
    name: 'Task Duration',
    description: 'Total time spent on browser tasks',
    unit: 'ms',
    format: formatMs,
    category: 'computation'
  }
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatMs(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Build profile comparison from captured metrics.
 * @param {string[]} racerNames - Names of the two racers
 * @param {Object[]} profileData - Array of profile data for each racer
 * @returns {Object} Profile comparison results
 */
export function buildProfileComparison(racerNames, profileData) {
  const comparisons = [];
  const wins = { [racerNames[0]]: 0, [racerNames[1]]: 0 };

  for (const [key, metric] of Object.entries(PROFILE_METRICS)) {
    const vals = profileData.map(p => p?.[key] ?? null);

    // Skip if neither racer has data for this metric
    if (vals[0] === null && vals[1] === null) continue;

    const comp = {
      key,
      name: metric.name,
      category: metric.category,
      unit: metric.unit,
      values: vals,
      formatted: vals.map(v => v !== null ? metric.format(v) : '-'),
      winner: null,
      diff: null,
      diffPercent: null
    };

    // Determine winner (lower is better for all metrics)
    if (vals[0] !== null && vals[1] !== null && vals[0] !== vals[1]) {
      const winIdx = vals[0] <= vals[1] ? 0 : 1;
      const loseIdx = 1 - winIdx;
      comp.winner = racerNames[winIdx];
      comp.diff = vals[loseIdx] - vals[winIdx];
      comp.diffPercent = vals[winIdx] > 0
        ? (comp.diff / vals[winIdx] * 100)
        : 0;
      wins[racerNames[winIdx]]++;
    }

    comparisons.push(comp);
  }

  // Determine overall profile winner
  let overallWinner = null;
  if (wins[racerNames[0]] > wins[racerNames[1]]) {
    overallWinner = racerNames[0];
  } else if (wins[racerNames[1]] > wins[racerNames[0]]) {
    overallWinner = racerNames[1];
  } else if (comparisons.length > 0) {
    overallWinner = 'tie';
  }

  return {
    comparisons,
    wins,
    overallWinner,
    byCategory: groupByCategory(comparisons)
  };
}

function groupByCategory(comparisons) {
  const groups = {};
  for (const comp of comparisons) {
    if (!groups[comp.category]) {
      groups[comp.category] = [];
    }
    groups[comp.category].push(comp);
  }
  return groups;
}

/**
 * Print profile analysis to terminal.
 * @param {Object} profileComparison - Result from buildProfileComparison
 * @param {string[]} racers - Racer names
 */
export function printProfileAnalysis(profileComparison, racers) {
  const { comparisons, wins, overallWinner, byCategory } = profileComparison;
  const colors = [c.red, c.blue];
  const w = 54;

  const write = (s) => process.stderr.write(s);

  if (comparisons.length === 0) {
    write(`\n  ${c.dim}No profile metrics available.${c.reset}\n`);
    return;
  }

  write(`\n  ${c.bold}📊 Performance Profile Analysis${c.reset}\n`);
  write(`  ${c.dim}${'─'.repeat(w)}${c.reset}\n`);

  const categoryLabels = {
    network: '🌐 Network',
    loading: '⏱️  Loading',
    memory: '🧠 Memory',
    computation: '⚡ Computation',
    rendering: '🎨 Rendering'
  };

  for (const [category, comps] of Object.entries(byCategory)) {
    write(`  ${c.bold}${categoryLabels[category] || category}${c.reset}\n`);

    for (const comp of comps) {
      const maxVal = Math.max(...comp.values.filter(v => v !== null));

      write(`  ${c.dim}${comp.name}${c.reset}\n`);
      for (let i = 0; i < 2; i++) {
        const val = comp.values[i];
        const formatted = comp.formatted[i];
        const isWinner = comp.winner === racers[i];
        const medal = isWinner ? ' 🏆' : '';

        // Simple bar visualization
        const barWidth = 20;
        const filled = val !== null && maxVal > 0
          ? Math.round((val / maxVal) * barWidth)
          : 0;
        const bar = '▓'.repeat(filled) + '░'.repeat(barWidth - filled);

        write(`    ${colors[i]}${c.bold}${racers[i].padEnd(10)}${c.reset} ${colors[i]}${bar}${c.reset}  ${formatted}${medal}\n`);
      }

      if (comp.winner && comp.diffPercent !== null) {
        const winColor = comp.winner === racers[0] ? colors[0] : colors[1];
        write(`    ${winColor}${c.bold}${comp.winner}${c.reset} is ${c.bold}${comp.diffPercent.toFixed(1)}%${c.reset} better\n`);
      }
    }
    write('\n');
  }

  write(`  ${c.dim}${'─'.repeat(w)}${c.reset}\n`);
  write(`  ${c.bold}Profile Score: ${c.reset}`);
  write(`${colors[0]}${racers[0]}${c.reset} ${wins[racers[0]]} - ${wins[racers[1]]} ${colors[1]}${racers[1]}${c.reset}\n`);

  if (overallWinner === 'tie') {
    write(`  ${c.yellow}${c.bold}🤝 Profile Tie!${c.reset}\n`);
  } else if (overallWinner) {
    const winColor = overallWinner === racers[0] ? colors[0] : colors[1];
    write(`  📊 ${winColor}${c.bold}${overallWinner}${c.reset} has the better performance profile!\n`);
  }
}

/**
 * Build markdown section for profile analysis.
 * @param {Object} profileComparison - Result from buildProfileComparison
 * @param {string[]} racers - Racer names
 * @returns {string} Markdown content
 */
export function buildProfileMarkdown(profileComparison, racers) {
  const { comparisons, wins, overallWinner, byCategory } = profileComparison;
  const lines = [];

  if (comparisons.length === 0) return '';

  lines.push('### Performance Profile Analysis');
  lines.push('');
  lines.push('*Lower values are better for all metrics*');
  lines.push('');

  const categoryLabels = {
    network: 'Network',
    loading: 'Loading',
    memory: 'Memory',
    computation: 'Computation',
    rendering: 'Rendering'
  };

  for (const [category, comps] of Object.entries(byCategory)) {
    lines.push(`#### ${categoryLabels[category] || category}`);
    lines.push('');
    lines.push(`| Metric | ${racers[0]} | ${racers[1]} | Winner | Diff |`);
    lines.push('|---|---|---|---|---|');

    for (const comp of comps) {
      const winner = comp.winner || '-';
      const diff = comp.diffPercent !== null ? `${comp.diffPercent.toFixed(1)}%` : '-';
      lines.push(`| ${comp.name} | ${comp.formatted[0]} | ${comp.formatted[1]} | ${winner} | ${diff} |`);
    }
    lines.push('');
  }

  lines.push(`**Profile Score:** ${racers[0]} ${wins[racers[0]]} - ${wins[racers[1]]} ${racers[1]}`);
  if (overallWinner && overallWinner !== 'tie') {
    lines.push(`**Profile Winner:** ${overallWinner}`);
  } else if (overallWinner === 'tie') {
    lines.push('**Profile Result:** Tie');
  }
  lines.push('');

  return lines.join('\n');
}
