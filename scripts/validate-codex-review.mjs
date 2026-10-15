import { readFileSync } from 'node:fs';

const file = process.argv[2];
const expectedSha = process.env.EXPECTED_SHA ?? '';
if (!file || !expectedSha) throw new Error('Review file and EXPECTED_SHA are required.');
let review;
try { review = JSON.parse(readFileSync(file, 'utf8')); } catch { throw new Error('Codex output is not valid JSON.'); }
const decisions = new Set(['APPROVED', 'CHANGES_REQUIRED', 'NEEDS_DECISION']);
const severities = new Set(['Critical', 'High', 'Medium', 'Low']);
const categories = new Set(['methodology', 'grain', 'joins', 'data_quality', 'mmm', 'causal_lift', 'event_study', 'security', 'freshness', 'other']);
if (!review || typeof review !== 'object' || !decisions.has(review.decision) || typeof review.summary !== 'string' || !Array.isArray(review.findings) || !Array.isArray(review.methodology_notes) || review.reviewed_sha !== expectedSha || review.iteration !== 0) {
  throw new Error('Codex output failed the top-level review contract.');
}
if (review.findings.length > 30 || review.methodology_notes.length > 20) throw new Error('Codex output exceeds bounded review limits.');
for (const finding of review.findings) {
  if (!finding || typeof finding !== 'object' || !severities.has(finding.severity) || !categories.has(finding.category) || typeof finding.title !== 'string' || typeof finding.evidence !== 'string' || typeof finding.expected_behavior !== 'string' || typeof finding.recommendation !== 'string') throw new Error('Codex output contains an invalid finding.');
  if (finding.file !== null && typeof finding.file !== 'string') throw new Error('Finding file must be a string or null.');
  if (finding.line !== null && (!Number.isInteger(finding.line) || finding.line < 1)) throw new Error('Finding line must be a positive integer or null.');
}
process.stdout.write(JSON.stringify({ decision: review.decision, summary: review.summary, findingCount: review.findings.length }));
