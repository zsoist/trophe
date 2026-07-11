#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const scoringKey = /"(?:min|max|.*tolerance.*|pass_criteria|expectedFallbackToAI|expected|expect_[^"]+|primaryFood|items|totalKcal|totalProtein|totalFat|totalCarbs|fallbackFlag|confidenceMax|kcalReasonable)"\s*:/;

export function diffHasUnjustifiedScoringChange(diff) {
  const hunks = diff.includes('@@') ? diff.split(/^@@.*$/m).slice(1) : [diff];
  return hunks.some((hunk) => {
    const changedScoring = hunk.split('\n').some((line) =>
      /^[+-](?![+-])/.test(line) && scoringKey.test(line),
    );
    const hasJustification = hunk.split('\n').some((line) =>
      /^\+(?!\+)/.test(line)
      && /"tolerance_justification"\s*:\s*"[^"\s][^"]*"/i.test(line),
    );
    return changedScoring && !hasJustification;
  });
}

function main() {
  const base = process.env.GOLDEN_GUARD_BASE
    ?? (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'HEAD^');
  const commits = git(['rev-list', '--reverse', `${base}..HEAD`]).split('\n').filter(Boolean);
  const violations = [];

  for (const commit of commits) {
    const files = git([
      'diff-tree', '-M', '--no-commit-id', '--name-only', '--diff-filter=AMRD', '-r', commit,
    ]).split('\n').filter((file) => /golden.*\.json$/i.test(file));

    for (const file of files) {
      const diff = git(['show', '-M', '--format=', '--unified=3', commit, '--', file]);
      if (diffHasUnjustifiedScoringChange(diff)) {
        violations.push(`${commit.slice(0, 8)} ${file}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('Golden tolerance/criteria changed without an added tolerance_justification in the same commit:');
    for (const violation of violations) console.error(`- ${violation}`);
    process.exit(1);
  }

  console.log(`Golden tolerance justification guard passed across ${commits.length} commit(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
