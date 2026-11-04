import { GENERIC_BASENAMES } from './constants.js';
import { basename, normalizePath, tokenize, unique } from './text.js';

const FILE_PATTERN = /(?:[\w.-]+\/)+[\w.-]+\.(?:js|jsx|ts|tsx|py|go|java|kt|rb|php|cs|json|yml|yaml|tf)(?::\d+)?/gi;
const EXCEPTION_PATTERN = /\b([A-Z][A-Za-z0-9]*(?:Exception|Error))\b/g;
const STATUS_PATTERN = /\b(?:HTTP|status|code)\s*[:#]?\s*([45]\d{2})\b/gi;

export function extractSignals({ summary = '', text = '' }) {
  const source = `${summary}\n${text}`;
  const files = unique(
    Array.from(source.matchAll(FILE_PATTERN), (match) => match[0].replace(/:\d+$/, '')),
  );
  const exceptions = unique(Array.from(source.matchAll(EXCEPTION_PATTERN), (match) => match[1]));
  const statusCodes = unique(Array.from(source.matchAll(STATUS_PATTERN), (match) => match[1]));
  const keywords = searchTerms({ summary, text, files, exceptions });
  return { files, exceptions, statusCodes, keywords };
}

export function searchTerms({ summary = '', text = '', files = [], exceptions = [] }) {
  const counts = new Map();
  const add = (token, weight) => {
    if (!token || token.length < 4) return;
    counts.set(token, (counts.get(token) || 0) + weight);
  };
  tokenize(summary).forEach((token) => add(token, 3));
  tokenize(text).forEach((token) => add(token, 1));
  exceptions.forEach((name) => add(name.toLowerCase(), 4));
  files.forEach((file) => add(basename(file).replace(/\.[a-z0-9]+$/i, ''), 4));
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([token]) => token)
    .slice(0, 4);
}

export function overlappingFiles(left = [], right = []) {
  const targets = right.map(normalizePath).filter(Boolean);
  const found = [];
  for (const file of left) {
    const path = normalizePath(file);
    if (!path) continue;
    const fileBase = basename(path);
    const hit = targets.some((target) => {
      if (target === path) return true;
      const targetBase = basename(target);
      return fileBase === targetBase && fileBase.length > 8 && !GENERIC_BASENAMES.has(fileBase);
    });
    if (hit) found.push(file);
  }
  return unique(found);
}
