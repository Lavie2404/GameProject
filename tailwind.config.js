/** @type {import('tailwindcss').Config} */
// Build-time Tailwind (v3, same generation as the Play CDN this replaced).
//
// 2026-09-11: index.html used to load Tailwind from cdn.tailwindcss.com. That
// script attaches a MutationObserver to the whole document and, after EVERY
// DOM change (i.e. every React commit, every click), rescans all class
// attributes, regenerates the stylesheet and rewrites its <style> element —
// which invalidates computed styles for the entire page and forces a full
// style-recalc + layout of the story log (thousands of text nodes). Profiled
// as "Forced reflow while executing JavaScript took ~4100ms" on plain button
// clicks. Generating the CSS once at build time removes that observer.
//
// `content` must list every file that contains className strings: the
// scanner extracts complete tokens from source text, so class names must
// appear whole (they do — App.tsx never concatenates partial utilities).
export default {
  content: [
    './index.html',
    './App.tsx',
    './gameConfig.js',
    './src-web/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
