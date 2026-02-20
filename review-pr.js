#!/usr/bin/env node

/**
 * GitHub PR Reviewing Agent
 *
 * Uses Claude to review pull requests on GitHub. Fetches the PR diff,
 * analyzes it for issues, and posts review comments.
 *
 * Usage:
 *   node review-pr.js <owner/repo> <pr-number>
 *   node review-pr.js --help
 *
 * Environment:
 *   ANTHROPIC_API_KEY  — Required. Your Anthropic API key.
 *   GITHUB_TOKEN       — Required. A GitHub token with repo access.
 *
 * Examples:
 *   node review-pr.js octocat/hello-world 42
 *   node review-pr.js octocat/hello-world 42 --approve
 *   node review-pr.js octocat/hello-world 42 --event COMMENT
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const HELP = `
Usage: node review-pr.js <owner/repo> <pr-number> [options]

Options:
  --model <model>     Claude model to use (default: claude-sonnet-4-6)
  --approve           Submit an APPROVE review instead of COMMENT
  --request-changes   Submit a REQUEST_CHANGES review instead of COMMENT
  --event <event>     Explicit review event: APPROVE | REQUEST_CHANGES | COMMENT
  --dry-run           Print the review to stdout instead of posting it
  --system <prompt>   Override the default system prompt
  --help              Show this help message
`;

function parseArgs(argv) {
  const args = argv.slice(2);

  if (args.includes("--help") || args.length < 2) {
    console.log(HELP.trim());
    process.exit(0);
  }

  const opts = {
    repo: args[0],
    pr: parseInt(args[1], 10),
    model: "claude-sonnet-4-6",
    event: "COMMENT",
    dryRun: false,
    systemPrompt: null,
  };

  for (let i = 2; i < args.length; i++) {
    switch (args[i]) {
      case "--model":
        opts.model = args[++i];
        break;
      case "--approve":
        opts.event = "APPROVE";
        break;
      case "--request-changes":
        opts.event = "REQUEST_CHANGES";
        break;
      case "--event":
        opts.event = args[++i];
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--system":
        opts.systemPrompt = args[++i];
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  if (isNaN(opts.pr)) {
    console.error("PR number must be an integer.");
    process.exit(1);
  }

  if (!opts.repo.includes("/")) {
    console.error("Repository must be in owner/repo format.");
    process.exit(1);
  }

  return opts;
}

// ---------------------------------------------------------------------------
// GitHub helpers (uses fetch — no extra dependency needed)
// ---------------------------------------------------------------------------

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN environment variable is required.");
    process.exit(1);
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "review-pr-agent",
  };
}

async function githubGet(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: githubHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub GET ${path} failed (${res.status}): ${body}`);
  }
  return res.json();
}

async function githubGetRaw(path, accept) {
  const headers = { ...githubHeaders(), Accept: accept };
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub GET ${path} failed (${res.status}): ${body}`,
    );
  }
  return res.text();
}

async function githubPost(path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method: "POST",
    headers: { ...githubHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub POST ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Fetch PR data
// ---------------------------------------------------------------------------

async function fetchPRData(repo, prNumber) {
  console.log(`Fetching PR #${prNumber} from ${repo}...`);

  const [pr, diff, files] = await Promise.all([
    githubGet(`/repos/${repo}/pulls/${prNumber}`),
    githubGetRaw(
      `/repos/${repo}/pulls/${prNumber}`,
      "application/vnd.github.v3.diff",
    ),
    githubGet(`/repos/${repo}/pulls/${prNumber}/files`),
  ]);

  return { pr, diff, files };
}

// ---------------------------------------------------------------------------
// Build the prompt for Claude
// ---------------------------------------------------------------------------

const DEFAULT_SYSTEM = `You are an expert code reviewer. You review GitHub pull requests thoroughly and provide actionable, constructive feedback.

Your review should cover:
- Correctness: bugs, logic errors, edge cases
- Security: injection, XSS, auth issues, exposed secrets
- Performance: unnecessary allocations, O(n²) patterns, missing caching
- Maintainability: naming, structure, complexity, missing tests
- Style: consistency with the surrounding codebase

Guidelines:
- Be specific — reference file names and line numbers when possible.
- Be constructive — suggest fixes, not just problems.
- Prioritize: focus on issues that matter. Don't nitpick formatting if there are real bugs.
- If the PR looks good, say so. Not every PR has problems.
- Keep inline comments concise and to the point.`;

function buildUserPrompt(pr, diff, files) {
  const fileList = files
    .map(
      (f) =>
        `  ${f.status.padEnd(10)} ${f.filename} (+${f.additions} -${f.deletions})`,
    )
    .join("\n");

  return `## Pull Request: ${pr.title}

**Author:** ${pr.user.login}
**Branch:** ${pr.head.ref} → ${pr.base.ref}
**Description:**
${pr.body || "(no description)"}

### Changed files
${fileList}

### Diff
\`\`\`diff
${diff}
\`\`\`

Please review this pull request. Provide:
1. A summary of what the PR does.
2. An overall assessment (looks good / needs changes / has concerns).
3. Specific inline comments for any issues you find — include the file path and line number.

Format your inline comments as a JSON array at the end of your response inside a fenced code block tagged \`json\`, like this:

\`\`\`json
[
  {
    "path": "src/example.js",
    "line": 42,
    "body": "This could throw if x is null. Consider adding a null check."
  }
]
\`\`\`

If there are no inline comments, use an empty array: \`\`\`json\n[]\n\`\`\``;
}

// ---------------------------------------------------------------------------
// Parse Claude's response into a review body + inline comments
// ---------------------------------------------------------------------------

const InlineComment = z.object({
  path: z.string(),
  line: z.number().int().positive(),
  body: z.string(),
});

function parseReviewResponse(text, changedFiles) {
  // Extract the JSON block for inline comments
  const jsonMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
  let comments = [];

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) {
        // Validate each comment against the schema and filter to changed files
        const validPaths = new Set(changedFiles.map((f) => f.filename));
        for (const item of parsed) {
          const result = InlineComment.safeParse(item);
          if (result.success && validPaths.has(result.data.path)) {
            comments.push(result.data);
          }
        }
      }
    } catch {
      // If JSON parsing fails, that's fine — we still have the body text
    }
  }

  // The review body is everything before the JSON block (or the full text)
  let body = jsonMatch ? text.slice(0, jsonMatch.index).trim() : text.trim();

  return { body, comments };
}

// ---------------------------------------------------------------------------
// Post the review to GitHub
// ---------------------------------------------------------------------------

async function postReview(repo, prNumber, body, comments, event) {
  const payload = {
    body,
    event, // APPROVE | REQUEST_CHANGES | COMMENT
    comments: comments.map((c) => ({
      path: c.path,
      line: c.line,
      body: c.body,
    })),
  };

  console.log(`Posting review with ${comments.length} inline comment(s)...`);
  const result = await githubPost(
    `/repos/${repo}/pulls/${prNumber}/reviews`,
    payload,
  );
  console.log(`Review posted: ${result.html_url}`);
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv);

  // Fetch PR data from GitHub
  const { pr, diff, files } = await fetchPRData(opts.repo, opts.pr);

  console.log(`PR: "${pr.title}" by ${pr.user.login}`);
  console.log(`Files changed: ${files.length}`);
  console.log(`Diff size: ${diff.length} characters`);

  // Call Claude
  const client = new Anthropic();
  const systemPrompt = opts.systemPrompt || DEFAULT_SYSTEM;
  const userPrompt = buildUserPrompt(pr, diff, files);

  console.log("Sending to Claude for review...");

  const stream = client.messages.stream({
    model: opts.model,
    max_tokens: 8192,
    system: systemPrompt,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: userPrompt }],
  });

  // Stream thinking/text to stderr for visibility
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      process.stderr.write(event.delta.text);
    }
  }
  process.stderr.write("\n");

  const finalMessage = await stream.finalMessage();
  const responseText = finalMessage.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  // Parse the review
  const { body, comments } = parseReviewResponse(responseText, files);

  if (opts.dryRun) {
    console.log("\n--- REVIEW BODY ---");
    console.log(body);
    console.log(`\n--- INLINE COMMENTS (${comments.length}) ---`);
    for (const c of comments) {
      console.log(`  ${c.path}:${c.line} — ${c.body}`);
    }
    console.log(`\n--- EVENT: ${opts.event} ---`);
    return;
  }

  // Post to GitHub
  await postReview(opts.repo, opts.pr, body, comments, opts.event);

  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
