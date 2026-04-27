/**
 * cache-bust-convention.test.js — Cache-bust version parameter enforcement.
 *
 * ── Purpose ──────────────────────────────────────────────────────────────────
 * Enforce that every importScripts() call in worker files that loads
 * shared-calc.js (or any calc-related file) includes a ?v=N version parameter.
 *
 * This test was introduced after the Option B cache-coherency bug: noise-worker.js
 * used `importScripts('shared-calc.js')` without a version parameter.  When the
 * file was updated, the browser served the old cached engine to the worker while
 * the main thread loaded the updated one — producing a 7-12 dB receiver-vs-heatmap
 * mismatch.  The fix was to add `?v=3` to all importScripts calls.  This test
 * ensures the convention is maintained for all future changes.
 *
 * ── What is checked ──────────────────────────────────────────────────────────
 * 1. Worker importScripts: every call loading shared-calc or calc must have ?v=N
 * 2. index.html local script tags: every <script src="..."> with a relative path
 *    (not a CDN URL) should have ?v=N to allow cache busting on update
 *
 * ── Infrastructure notes (from Step 0 inspection) ────────────────────────────
 * - noise-worker.js line 15: importScripts('shared-calc.js?v=3') ✓
 * - cortn-worker.js line 28: importScripts('shared-calc.js?v=3') ✓
 * - index.html line 7817:    <script src="shared-calc.js?v=3"> ✓
 * - Other local scripts in index.html:
 *   library-loader.js?v=1 ✓, supabase-config.js?v=1 ✓, supabase-admin.js?v=1 ✓,
 *   js/sources-library.js?v=4 ✓ — all currently have ?v=N.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── §3.1 — Worker importScripts check ─────────────────────────────────────────

const WORKER_FILES = ['noise-worker.js', 'cortn-worker.js'];

describe('Cache-bust convention — worker importScripts', () => {

  for (const workerFile of WORKER_FILES) {
    it(`${workerFile}: all importScripts loading shared-calc/calc have ?v=N`, () => {
      const content = readFileSync(join(__dirname, workerFile), 'utf8');
      const calls   = content.match(/importScripts\([^)]+\)/g) || [];

      // Find all importScripts calls that reference shared-calc or calc files
      const calcCalls = calls.filter(call => /shared-calc|calc/.test(call));

      // Must find at least one such call (sanity — file should load shared-calc)
      expect(calcCalls.length).toBeGreaterThan(0);

      for (const call of calcCalls) {
        const hasVersion = /\?v=\d+/.test(call);
        expect(hasVersion,
          `importScripts in ${workerFile} loads ${call} without ?v=N version parameter`
        ).toBe(true);
      }
    });
  }

  it('noise-worker.js importScripts version is numeric (not empty v=)', () => {
    const content = readFileSync(join(__dirname, 'noise-worker.js'), 'utf8');
    const matches = content.match(/importScripts\([^)]+\?v=(\d+)[^)]*\)/g) || [];
    expect(matches.length).toBeGreaterThan(0);
    // Extract the version number and confirm it is a positive integer
    for (const m of matches) {
      const vMatch = m.match(/\?v=(\d+)/);
      expect(vMatch).not.toBeNull();
      const version = parseInt(vMatch[1], 10);
      expect(version).toBeGreaterThan(0);
    }
  });

  it('cortn-worker.js importScripts version is numeric (not empty v=)', () => {
    const content = readFileSync(join(__dirname, 'cortn-worker.js'), 'utf8');
    const matches = content.match(/importScripts\([^)]+\?v=(\d+)[^)]*\)/g) || [];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      const vMatch = m.match(/\?v=(\d+)/);
      expect(vMatch).not.toBeNull();
      const version = parseInt(vMatch[1], 10);
      expect(version).toBeGreaterThan(0);
    }
  });

  // ── Discriminating power verification ──────────────────────────────────────
  // Simulate what would happen with a missing ?v=N parameter.
  // We test against a modified string in the test — NOT the source file.
  it('DISCRIMINATING: importScripts call without ?v=N correctly fails assertion', () => {
    // Simulate a worker file content with a missing version parameter
    const badContent = `importScripts('shared-calc.js')`;
    const calls      = badContent.match(/importScripts\([^)]+\)/g) || [];
    const calcCalls  = calls.filter(call => /shared-calc|calc/.test(call));

    let violationsFound = 0;
    for (const call of calcCalls) {
      if (!/\?v=\d+/.test(call)) {
        violationsFound++;
      }
    }
    // The bad content (no ?v=N) should produce a violation
    expect(violationsFound).toBeGreaterThan(0);
    // This confirms: the real test above would FAIL if a worker file's
    // importScripts call was missing the ?v=N parameter.
  });
});

// ── §3.2 — index.html local script tag check ──────────────────────────────────

describe('Cache-bust convention — index.html local script tags', () => {

  it('all local <script src="..."> tags (non-CDN) have ?v=N version parameter', () => {
    const content = readFileSync(join(__dirname, 'index.html'), 'utf8');

    // Find all <script src="..."> occurrences
    const scriptTagPattern = /<script\s[^>]*src="([^"]+)"[^>]*>/g;
    let match;
    const localScripts = [];

    while ((match = scriptTagPattern.exec(content)) !== null) {
      const src = match[1];
      // Skip CDN URLs (absolute URLs with https:// or //)
      if (/^https?:\/\//.test(src) || /^\/\//.test(src)) continue;
      localScripts.push(src);
    }

    // Should find at least one local script (sanity check)
    expect(localScripts.length).toBeGreaterThan(0);

    // Check each local script has a ?v=N parameter
    const missing = localScripts.filter(src => !/\?v=\d+/.test(src));
    expect(missing, `Local script tags missing ?v=N: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('shared-calc.js script tag in index.html has ?v=N', () => {
    const content = readFileSync(join(__dirname, 'index.html'), 'utf8');
    const sharedCalcTag = content.match(/<script\s[^>]*src="shared-calc\.js[^"]*"[^>]*>/);
    expect(sharedCalcTag).not.toBeNull();
    expect(/\?v=\d+/.test(sharedCalcTag[0])).toBe(true);
  });
});
