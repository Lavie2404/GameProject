// Generates public/theme.css (run: node src-web/gen-theme.mjs > public/theme.css)
// — a global override stylesheet that reskins
// App.tsx's dark-fantasy Tailwind palette to the paper/ink palette from
// prototypes/ui-mockup/index.html, WITHOUT touching App.tsx's 36k lines.
//
// Mechanism: Tailwind CDN bakes arbitrary-value classes like `bg-[#0a0f0a]`
// literally into the DOM `class` attribute — CSS attribute selectors match
// that raw string regardless of how Tailwind compiles its own rules, so
// `!important` overrides always win over Tailwind's generated (non-!important)
// rules.
//
// IMPORTANT: selectors use `[class~="token"]` (exact whitespace-delimited
// token match), NOT `[class*="token"]` (substring match). A substring match
// on e.g. `bg-[#cda45e]` also matches inside `hover:bg-[#cda45e]/10` — which
// broke a real button (permanently ink-on-ink, not just on :hover) during
// verification. Exact-token matching requires enumerating every opacity
// suffix (`/10`, `/40`, ...) actually used in the source as its own token,
// since `bg-[#cda45e]` and `bg-[#cda45e]/10` are different complete tokens.

const OPACITY_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 98, 99];

// [old hex, target hex/rgb-triplet for opaque use, [r,g,b] for alpha-blended bg use, label]
const COLOR_MAP = [
  ['#0a0f0a', '#F5EFE0', [245, 239, 224], 'nền app tối nhất -> giấy'],
  ['#101a10', '#EDE5D0', [237, 229, 208], 'nền panel -> giấy đậm'],
  ['#1b2a1b', '#EDE5D0', [237, 229, 208], 'nền panel -> giấy đậm'],
  ['#162216', '#F5EFE0', [245, 239, 224], 'nền thẻ/card -> giấy'],
  ['#cda45e', '#1A1512', [26, 21, 18], 'vàng chủ đạo -> mực'],
  ['#e8d3a1', '#1A1512', [26, 21, 18], 'chữ tiêu đề sáng -> mực'],
  ['#8ba888', 'rgba(26,21,18,.6)', [26, 21, 18], 'chữ phụ -> mực nhạt (ink-60)'],
  ['#a3b8a3', 'rgba(26,21,18,.38)', [26, 21, 18], 'chữ phụ nhạt hơn -> mực rất nhạt (ink-38)'],
  ['#8b1515', '#8a3324', [138, 51, 36], 'đỏ cảnh báo -> đỏ mực'],
  ['#a01818', '#8a3324', [138, 51, 36], 'đỏ cảnh báo -> đỏ mực'],
  ['#8b0000', '#8a3324', [138, 51, 36], 'đỏ cảnh báo -> đỏ mực'],
  ['#ff4d4d', '#8a3324', [138, 51, 36], 'đỏ cảnh báo -> đỏ mực'],
  ['#0a0505', '#F5EFE0', [245, 239, 224], 'nền tối (wrapper toàn màn hình) -> giấy'],
  ['#050805', '#F5EFE0', [245, 239, 224], 'nền tối nhất (gradient stop) -> giấy'],
  ['#0d160d', '#EDE5D0', [237, 229, 208], 'nền tối vừa (gradient via-stop) -> giấy đậm'],
  ['#080d08', '#EDE5D0', [237, 229, 208], 'nền hộp trạng thái (status box) -> giấy đậm'],
  ['#4a6b4a', 'rgba(26,21,18,.38)', [26, 21, 18], 'viền track toggle (tắt) -> mực rất nhạt (ink-38)'],
  // 2 màu "feature-toggle accent" trước cố tình bỏ qua — đổi theo yêu cầu
  // user 2026-08-15 (chấp nhận đánh đổi: dùng chung với chỉ báo lượt đánh
  // trong combat, teal/indigo -> mực khiến lượt người chơi bớt nổi bật,
  // nhưng vẫn phân biệt được với đỏ mực của lượt địch).
  ['#5eead4', '#1A1512', [26, 21, 18], 'toggle teal (Miễn trừ nút thắt, bật) -> mực'],
  ['#a5b4fc', '#1A1512', [26, 21, 18], 'toggle indigo (Ký Sinh Tâm Linh, bật) -> mực'],
  // Nút CTA "Phân Tích & Tiếp Tục" (Thiết Lập Đồng Nhân) — theo yêu cầu user
  // 2026-08-15: đổi thành nút "đảo màu" nổi bật (nền mực đen) thay vì xanh rêu
  // sót lại từ theme cũ. #233523 chỉ khớp token trần `bg-[#233523]` (không có
  // tiền tố hover:) DUY NHẤT ở nút này trong toàn bộ App.tsx (verify bằng
  // grep) — 8 chỗ khác đều là `hover:bg-[#233523]`, token khác, generator
  // không match tới nên không bị ảnh hưởng. #324a32 chỉ dùng ở đúng 1 chỗ
  // (hover của nút này). Viền/chữ của nút này (border-[#cda45e]/text-[#e8d3a1])
  // vẫn bị rule chung phía trên đổi thành mực — cần rule ngoại lệ riêng bên
  // dưới đảo ngược lại thành màu giấy, nếu không sẽ bị mực-trên-mực.
  ['#233523', '#1A1512', [26, 21, 18], 'nền nút CTA "Phân Tích & Tiếp Tục" -> mực đen (nút đảo màu)'],
  ['#324a32', '#1A1512', [26, 21, 18], 'hover nền nút CTA "Phân Tích & Tiếp Tục" -> mực đen'],
  // #fef3c7 (kem rất nhạt) chưa từng có trong COLOR_MAP — dùng làm text-color
  // (không chỉ trong drop-shadow) ở 4 chỗ: 2 tiêu đề hover, hover của span tên
  // riêng ĐÃ nhận diện, và base (không hover) của span tên riêng CHƯA nhận
  // diện (App.tsx parseAndRenderText nhánh "CẤP 2"). Trước 2026-08-15, chỗ
  // base đó đọc được là NHỜ drop-shadow-[...rgba(0,0,0,0.8)] đen bao quanh
  // tạo viền tương phản giả — sau khi rule triệt tiêu filter (55dafaf) gỡ
  // đúng cái viền giả đó, chữ kem nhạt lộ ra gần như chìm vào nền giấy sáng
  // (kem trên kem) -> đúng cảm giác "nhòe" user báo cáo. Map như family
  // e8d3a1/cda45e (chữ tiêu đề sáng -> mực) để tự đọc được không cần dựa
  // vào shadow nữa.
  ['#fef3c7', '#1A1512', [26, 21, 18], 'chữ tiêu đề kem rất nhạt (tên riêng chưa nhận diện, hover tiêu đề) -> mực'],
];

const SIDE_BORDER_PROPS = {
  't': ['border-top-color'], 'b': ['border-bottom-color'],
  'l': ['border-left-color'], 'r': ['border-right-color'],
  'x': ['border-left-color', 'border-right-color'],
  'y': ['border-top-color', 'border-bottom-color'],
};

const alpha2 = (n) => (n === 100 ? '1' : n === 0 ? '0' : `.${n < 10 ? '0' + n : n}`);
const rgba = ([r, g, b], step) => `rgba(${r},${g},${b},${alpha2(step)})`;

import { readFileSync } from 'node:fs';

// ---- PERF (2026-09-10): two changes to how rules are EMITTED. Neither
// changes a single rendered pixel; both exist to stop this stylesheet from
// dominating style recalculation.
//
// (1) Escaped CLASS selectors instead of `[class~="..."]` attribute
//     selectors. A browser buckets style rules by the rightmost simple
//     selector's id / class / tag key and skips whole buckets via a bloom
//     filter. `[class~="x"]` carries none of those keys, so every such rule
//     lands in the UNIVERSAL bucket and must be match-tested against EVERY
//     element on EVERY style recalculation. `.bg-\[\#162216\]\/90` and
//     `[class~="bg-[#162216]/90"]` have IDENTICAL specificity (0,1,0) and
//     identical semantics ("has this whitespace-delimited class token"), so
//     this is a 1:1 swap — cascade, !important behaviour and rendered result
//     are unchanged; only the matching cost differs.
//
// (2) Prune tokens the source never uses. The COLOR_MAP x OPACITY_STEPS x
//     property-variant enumeration emitted 15,811 rules, of which only 243
//     could ever match anything in App.tsx — the other 15,543 (98.5%) were
//     dead weight that still cost a match attempt per element per recalc.
//     Recalc runs on every React re-render, which is why every button felt
//     delayed regardless of what that button's handler actually did.
//
// The `[class*=]` substring selectors in the hand-written header above are
// deliberately left alone: they genuinely need substring matching (they look
// INSIDE a longer arbitrary value such as shadow-[0_4px_15px_rgba(0,0,0,0.3)]),
// and there are ~10 of them, not 15,811.
const SRC = ['App.tsx', 'gameConfig.js', 'index.html']
  .map(f => { try { return readFileSync(new URL('../' + f, import.meta.url), 'utf8'); } catch { return ''; } })
  .join('\n');

// A class token that appears nowhere in the source can never match: drop its
// rules. Deliberately a SUBSTRING test rather than a whole-token one — it
// errs toward KEEPING a rule, so nothing actually reachable can be pruned.
// (Verified 2026-09-10: App.tsx never builds a color class name by string
// interpolation — every `[${...}]` in the file is Vietnamese prose, not a
// class — so a static scan sees every token that can reach the DOM.)
const used = (tok) => SRC.includes(tok);

// Same escaping Tailwind itself emits for arbitrary-value classes:
// backslash-escape every character outside [A-Za-z0-9_-].
const esc = (tok) => tok.replace(/[^a-zA-Z0-9_-]/g, (ch) => '\\' + ch);
const cls = (tok) => `.${esc(tok)}`;

let out = `/* AUTO-GENERATED by gen-theme.mjs — do not hand-edit, regenerate instead.
 * Reskins App.tsx (dark-fantasy Tailwind palette) to the paper/ink palette
 * from prototypes/ui-mockup/index.html, approved 2026-08-14 (see
 * production/session-state/active.md). Overrides Tailwind CDN's arbitrary-
 * value utility classes via exact-token escaped class selectors (see the
 * PERF note in gen-theme.mjs for why '.foo\/90' and not '[class~="foo/90"]'
 * — same specificity, far cheaper for the browser to match) + !important
 * — App.tsx's source
 * is untouched. What was deliberately left unchanged: rarity-tier colors,
 * social icons, feature-toggle accent colors, combat VFX (.vfx-* classes).
 */

:root {
  --paper: #F5EFE0;
  --paper-deep: #EDE5D0;
  --ink: #1A1512;
  --ink-60: rgba(26, 21, 18, .60);
  --ink-38: rgba(26, 21, 18, .38);
  --ink-15: rgba(26, 21, 18, .15);
  --danger-ink: #8a3324;
}

/* ---- serif type everywhere, overriding both Tailwind font classes and
   inline style={{fontFamily:...}} (an !important external rule beats a
   plain inline style per the CSS cascade) ---- */
#root, #root * {
  font-family: "Palatino Linotype", "Noto Serif", "Times New Roman", serif !important;
}

/* ---- narrative paragraph text (App.tsx formatStoryText, both the
   array-content and legacy-string code paths — tagged with the
   .narrative-text class added 2026-08-15 specifically so this rule has
   something to hook) reported as reading "nhòe" (blurry/soft) next to the
   Gợi ý hành động suggestion box. Verified via computed-style comparison:
   NO filter/text-shadow/transform difference between the two — the only
   difference was font-weight 400 (narrative, regular) vs 700 (suggestion
   box, bold); thin serif strokes carrying Vietnamese diacritics read as
   soft/indistinct at regular weight over a long paragraph.
   IMPORTANT: the suggestion box's mainAction span ALSO requests
   fontFamily: "Noto Serif Vietnamese" inline, but that's a plain
   (non-!important) inline style, so the #root, #root * rule above (also
   !important) wins there too — computed-style check confirmed the
   suggestion box ACTUALLY renders in the Palatino Linotype stack, not
   Noto Serif Vietnamese. First attempt at this fix mistakenly gave
   narrative-text a literal "Noto Serif Vietnamese" family override,
   which made it diverge from the suggestion box instead of matching it
   (both need the SAME actually-resolved family). Fix: don't touch
   font-family at all here — let it keep inheriting the same Palatino
   stack every other paper/ink-themed element already gets — only bump
   weight to 700, so it's byte-for-byte the same family + weight the
   suggestion box already computes to.
   Needs #root prefix (specificity 1,1,0) to outrank the #root, #root *
   rule above (1,0,0) for font-weight — a bare .narrative-text class
   alone (0,1,0) would lose despite !important, since specificity is
   compared before source order for same-importance rules. ---- */
#root .narrative-text {
  font-weight: 700 !important;
}

/* ---- drop the 3 dark-fantasy background photos, flat paper instead ---- */
[style*="kimlove136-gif/anh-nen-game"] {
  background-image: none !important;
  background-color: var(--paper) !important;
}

/* ---- neutralize the gold/teal/indigo glow shadows AND the generic
   dark-elevation shadows (paper/ink has no glow, and flat "no shadow" is
   the established look for cards/panels here — see .glowing-card and the
   vignette-neutralize block below). Added 2026-08-15: rgba(0,0,0,..) and
   rgba(10,20,10,..) (~48 combined occurrences) are used throughout the
   dark-fantasy source purely for depth/elevation against a DARK
   background — invisible/blended there, but on the new light paper
   background they render as a visible dark halo (confirmed: a dialogue
   bubble's shadow-[0_4px_15px_rgba(0,0,0,0.3)], reported as "text has a
   shadow" — it's a box-shadow on the bubble, not an actual text-shadow,
   but reads the same way visually).
   Left as a substring match deliberately: it's inside a much longer
   shadow-[...] arbitrary value (not a standalone token), and "no shadow"
   is correct whether or not a hover: prefix is present, so the earlier
   hover-false-positive bug doesn't apply here. ---- */
[class*="rgba(205,164,94"], [class*="rgba(94,234,212"], [class*="rgba(165,180,252"],
[class*="rgba(0,0,0,"], [class*="rgba(10,20,10,"] {
  box-shadow: none !important;
}

/* ---- same glow, different CSS property: Tailwind's drop-shadow-[...]
   compiles to filter: drop-shadow(...), NOT box-shadow — completely
   untouched by the block above. Confirmed 2026-08-15: named-entity
   highlights in narrative text (formatStoryText's *Tên Riêng* spans, see
   App.tsx parseAndRenderText) use drop-shadow-[0_0_8px_rgba(205,164,94,0.3)]
   /rgba(94,234,212,0.2)/rgba(165,180,252,0.2) per entity type, plus a
   rgba(254,243,199,0.6) hover glow and a rgba(232,211,161,..) glow
   elsewhere — reported as "narrative text still has a shadow" after the
   box-shadow fix, since underlined/highlighted names are exactly where
   these live. Scoped to the drop-shadow- token combined with each glow
   color (compound attribute selector — both must match) rather than
   reusing the box-shadow selector list as-is, so it does NOT touch
   drop-shadow using rarity-tier colors (orange/red — deliberately kept,
   see file header) or any unrelated filter usage that happens to share
   an element with an unrelated rgba(0,0,0,..) shadow. ---- */
[class*="drop-shadow-"][class*="rgba(205,164,94"],
[class*="drop-shadow-"][class*="rgba(94,234,212"],
[class*="drop-shadow-"][class*="rgba(165,180,252"],
[class*="drop-shadow-"][class*="rgba(232,211,161"],
[class*="drop-shadow-"][class*="rgba(254,243,199"],
[class*="drop-shadow-"][class*="rgba(0,0,0,"] {
  filter: none !important;
}

/* ---- .glowing-card: hand-written CSS class (App.tsx has its own <style>
   block, not a Tailwind utility) for the adventure-mode selection cards —
   same dark-gradient-card role as the bg-[#162216] family above, just not
   expressible as a class-attribute selector. Found via verification pass
   on the character-creation screen. ---- */
.glowing-card {
  background: var(--paper) !important;
  box-shadow: none !important;
}

/* ---- neutralize decorative radial/linear-gradient vignette backgrounds.
   Tailwind arbitrary values like bg-[radial-gradient(circle_at_center,rgba(
   ...)_0%,rgba(...)_100%)] embed a whole gradient function in one class —
   the hex/rgba selectors below can't match this syntax, and there's no
   hover: variant of these in the source (checked), so a substring match is
   safe here. Found via verification: a full-viewport z-[-2] vignette was
   the actual source of a leftover dark background outside the reskinned
   panel. Paper/ink has no glow/vignette — goes fully transparent (not
   opaque paper; some sit as overlays ON TOP of content). ---- */
[class*="bg-[radial-gradient("], [class*="bg-[linear-gradient("] {
  background-image: none !important;
  background-color: transparent !important;
}

/* ---- nút CTA "Phân Tích & Tiếp Tục" (Thiết Lập Đồng Nhân): nền của nó
   (token bg-[#233523], xem COLOR_MAP) đổi thành mực đen để làm nút "đảo
   màu" nổi bật — nhưng viền/chữ (border-[#cda45e], text-[#e8d3a1]) vẫn bị
   rule chung ở dưới đổi thành mực do dùng chung token với hàng trăm chỗ
   khác trên nền giấy. Combined-attribute-selector (đặc thù cao hơn 1
   attribute selector đơn) để chỉ đảo ngược viền/chữ riêng nút này, không
   đụng tới #cda45e/#e8d3a1 ở nơi khác. ---- */
.bg-\\[\\#233523\\].border-\\[\\#cda45e\\] { border-color: var(--paper) !important; }
.bg-\\[\\#233523\\].text-\\[\\#e8d3a1\\] { color: var(--paper) !important; }

/* ---- nút "đảo màu" khi hover: chữ phải là giấy, không phải mực ----
   Nguyên bản (dark-fantasy) đây là nút nền VÀNG + chữ ĐEN: 'hover:bg-[#cda45e]
   hover:text-black'. Theme giấy-mực đổi vàng (#cda45e) -> mực, mà 'text-black'
   cũng -> mực, nên khi hover nút thành MỰC TRÊN MỰC và chữ biến mất hoàn toàn
   (user báo 2026-09-11: "nút thử lại khi hover vào thành màu đen không thấy
   chữ"). Cùng lỗi với ngoại lệ #233523 ngay phía trên: nền đã đảo sang tối thì
   chữ phải đảo sang sáng theo.
   Dùng selector ghép (2 class + 1 pseudo = 0,3,0) để thắng rule
   .hover\\:text-black:hover (0,2,0), và chỉ chạm đúng những nút mang CẢ HAI
   token — 'hover:text-black' ở nơi khác (nền vẫn sáng) giữ nguyên chữ mực. */
.hover\\:bg-\\[\\#cda45e\\].hover\\:text-black:hover { color: var(--paper) !important; }

`;

// ---- standard Tailwind named-palette utilities (bg-black, text-white,
// bg-gray-800, ...) — not bracket-arbitrary-value classes, so not caught
// above. `black`/`white` get the paper/ink swap; opacity-suffixed variants
// (bg-black/60, a translucent scrim OR a solid-ish component field
// depending on where it's used — see comment below) get a proportional
// paper-deep tint at the SAME alpha rather than going flat opaque or flat
// transparent, since either flat choice broke one of the two use cases
// during verification.
const NAMED_MAP = [
  ['black', 'var(--paper)', 'var(--ink)', 'đen (scrim/nền tối) -> giấy / mực'],
  ['white', 'var(--paper)', 'var(--ink)', 'trắng (chữ/viền trên nền tối) -> giấy / mực'],
  ['gray-900', 'var(--paper-deep)', 'var(--ink)', 'xám rất đậm -> giấy đậm / mực'],
  ['gray-800', 'var(--paper-deep)', 'var(--ink)', 'xám đậm -> giấy đậm / mực'],
  ['gray-700', 'var(--paper-deep)', 'var(--ink)', 'xám đậm vừa -> giấy đậm / mực'],
  ['gray-600', 'var(--paper-deep)', 'var(--ink-60)', 'xám vừa -> giấy đậm / mực nhạt'],
  ['gray-500', 'var(--paper-deep)', 'var(--ink-60)', 'xám nhạt -> giấy đậm / mực nhạt'],
];

// ---- hover: variants (added 2026-08-15, following a confirmed bug: a
// button's base bg-[#1b2a1b] gets reskinned to paper-deep, but its SEPARATE
// hover:bg-[#1b2a1b] token was never targeted at all — Tailwind CDN's own
// (non-!important) hover rule then shows through the ORIGINAL unskinned dark
// color on actual mouse-hover, while text-[#e8d3a1]'s unconditional
// (non-hover-gated) !important ink rule stays black regardless of hover
// state — black text on unskinned dark green = unreadable. This was a
// systemic gap, not one button: `hover:` is a COMPLETE separate class token
// from the bare one (`hover:bg-[#1b2a1b]` vs `bg-[#1b2a1b]`), and every rule
// above/below only ever targets the bare token.
// Fix: emit a mirrored rule for the literal `hover:${tok}` token, gated by
// an ACTUAL `:hover` pseudo-class in the selector — this is safe (only
// overrides while truly hovering) and is NOT the substring-match bug the
// file-top comment warns about (that was `[class*=]` matching `hover:bg-X`
// as a SUBSTRING of `bg-X` and applying permanently; this is `[class~=]`
// exact-matching the distinct `hover:bg-X` token, active only on `:hover`).
function hoverSel(tok) { return `${cls(`hover:${tok}`)}:hover`; }

for (const [name, bgVal, fgVal, label] of NAMED_MAP) {
  let s = '';
  if (used(`bg-${name}`)) s += `${cls(`bg-${name}`)} { background-color: ${bgVal} !important; }\n`;
  if (used(`text-${name}`)) s += `${cls(`text-${name}`)} { color: ${fgVal} !important; }\n`;
  if (used(`border-${name}`)) s += `${cls(`border-${name}`)} { border-color: ${fgVal} !important; }\n`;
  if (used(`placeholder-${name}`)) s += `${cls(`placeholder-${name}`)}::placeholder { color: ${fgVal} !important; }\n`;
  if (used(`ring-${name}`)) s += `${cls(`ring-${name}`)} { --tw-ring-color: ${fgVal} !important; }\n`;
  if (used(`hover:bg-${name}`)) s += `${hoverSel(`bg-${name}`)} { background-color: ${bgVal} !important; }\n`;
  if (used(`hover:text-${name}`)) s += `${hoverSel(`text-${name}`)} { color: ${fgVal} !important; }\n`;
  if (used(`hover:border-${name}`)) s += `${hoverSel(`border-${name}`)} { border-color: ${fgVal} !important; }\n`;
  if (s) out += `/* Tailwind ${name} -> bg:${bgVal} text/border:${fgVal}  (${label}) */\n` + s;
}
out += `\n/* bg-black/NN, bg-white/NN -> paper-deep tint at the same alpha (scrim AND component-field use cases both need this — see NAMED_MAP comment) */\n`;
for (const step of OPACITY_STEPS) {
  // Each half of the comma-separated selector list is kept only when its own
  // token is reachable — an unmatchable half would otherwise drag the whole
  // rule back into dead weight.
  const bases = [`bg-black/${step}`, `bg-white/${step}`].filter(used).map(cls);
  if (bases.length) out += `${bases.join(', ')} { background-color: ${rgba([237, 229, 208], step)} !important; }\n`;
  const hovers = [`bg-black/${step}`, `bg-white/${step}`].filter(t => used(`hover:${t}`)).map(hoverSel);
  if (hovers.length) out += `${hovers.join(', ')} { background-color: ${rgba([237, 229, 208], step)} !important; }\n`;
}
out += `\n`;

// ---- the 16 mapped hex-bracket colors, base token + every opacity step.
// bg- gets a proportional alpha blend (same reasoning as bg-black/white
// above — some of these are full-cover overlays, going flat opaque would
// hide content beneath, as happened during verification). text-/border-/
// etc. go flat opaque at every opacity step — losing the subtlety of e.g.
// "40% vs 60% opacity border" is a minor cosmetic gap, not a correctness
// bug.
//
// GRADIENT STOPS (from-/via-/to-) belong with bg-, NOT with text-/border-,
// and were on the wrong side of that line until 2026-09-10. A gradient stop
// paints a band ACROSS an element, so dropping its alpha does the same damage
// dropping a background's alpha does. Reported case: the "Bắt Đầu Cuộc Phiêu
// Lưu" button (App.tsx InitializationOverlay) sweeps a shine over itself with
// `bg-gradient-to-r from-transparent via-[#cda45e]/20 to-transparent`, shown
// on :hover. At 20% gold that is a faint gleam; flattened to opaque ink it
// became a solid black band straight through the middle of the button and the
// label stopped being readable on hover. Gradient stops now take the same
// alpha-blended value bg- takes.
function emitTokenRules(tok, bgv, flatVal) {
  let s = '';
  if (used(`bg-${tok}`)) s += `${cls(`bg-${tok}`)} { background-color: ${bgv} !important; }\n`;
  if (used(`text-${tok}`)) s += `${cls(`text-${tok}`)} { color: ${flatVal} !important; }\n`;
  if (used(`border-${tok}`)) s += `${cls(`border-${tok}`)} { border-color: ${flatVal} !important; }\n`;
  for (const [side, props] of Object.entries(SIDE_BORDER_PROPS)) {
    if (used(`border-${side}-${tok}`)) s += `${cls(`border-${side}-${tok}`)} { ${props.map(p => `${p}: ${flatVal} !important;`).join(' ')} }\n`;
  }
  if (used(`ring-${tok}`)) s += `${cls(`ring-${tok}`)} { --tw-ring-color: ${flatVal} !important; }\n`;
  if (used(`from-${tok}`)) s += `${cls(`from-${tok}`)} { --tw-gradient-from: ${bgv} !important; }\n`;
  // via- is special: Tailwind CDN's arbitrary-value JIT does NOT reference
  // --tw-gradient-via when building the final --tw-gradient-stops list for
  // a bracket via-[#hex]/NN token — it bakes the ORIGINAL resolved color in
  // as a literal directly inside --tw-gradient-stops, bypassing the
  // variable entirely. Confirmed via live computed-style inspection
  // (2026-08-15): overriding --tw-gradient-via alone left the actual
  // rendered gradient's middle stop showing the unskinned dark color even
  // though --tw-gradient-via itself correctly read as the overridden paper
  // tone — from-/to- don't have this problem (their var() references DO
  // get used in --tw-gradient-stops). Fix: override --tw-gradient-stops
  // directly, chaining through --tw-gradient-from/--tw-gradient-to (which
  // ARE correctly override-able) so it still composes with whatever those
  // resolve to.
  if (used(`via-${tok}`)) s += `${cls(`via-${tok}`)} { --tw-gradient-via: ${bgv} !important; --tw-gradient-stops: var(--tw-gradient-from, transparent), ${bgv}, var(--tw-gradient-to, transparent) !important; }\n`;
  if (used(`to-${tok}`)) s += `${cls(`to-${tok}`)} { --tw-gradient-to: ${bgv} !important; }\n`;
  if (used(`decoration-${tok}`)) s += `${cls(`decoration-${tok}`)} { text-decoration-color: ${flatVal} !important; }\n`;
  if (used(`accent-${tok}`)) s += `${cls(`accent-${tok}`)} { accent-color: ${flatVal} !important; }\n`;
  if (used(`placeholder-${tok}`)) s += `${cls(`placeholder-${tok}`)}::placeholder { color: ${flatVal} !important; }\n`;
  // hover: mirror — same properties/values, gated by a real :hover so it
  // only overrides while actually hovering (see hoverSel() comment above).
  if (used(`hover:bg-${tok}`)) s += `${hoverSel(`bg-${tok}`)} { background-color: ${bgv} !important; }\n`;
  if (used(`hover:text-${tok}`)) s += `${hoverSel(`text-${tok}`)} { color: ${flatVal} !important; }\n`;
  if (used(`hover:border-${tok}`)) s += `${hoverSel(`border-${tok}`)} { border-color: ${flatVal} !important; }\n`;
  for (const [side, props] of Object.entries(SIDE_BORDER_PROPS)) {
    if (used(`hover:border-${side}-${tok}`)) s += `${hoverSel(`border-${side}-${tok}`)} { ${props.map(p => `${p}: ${flatVal} !important;`).join(' ')} }\n`;
  }
  if (used(`hover:ring-${tok}`)) s += `${hoverSel(`ring-${tok}`)} { --tw-ring-color: ${flatVal} !important; }\n`;
  if (used(`hover:from-${tok}`)) s += `${hoverSel(`from-${tok}`)} { --tw-gradient-from: ${bgv} !important; }\n`;
  if (used(`hover:via-${tok}`)) s += `${hoverSel(`via-${tok}`)} { --tw-gradient-via: ${bgv} !important; --tw-gradient-stops: var(--tw-gradient-from, transparent), ${bgv}, var(--tw-gradient-to, transparent) !important; }\n`;
  if (used(`hover:to-${tok}`)) s += `${hoverSel(`to-${tok}`)} { --tw-gradient-to: ${bgv} !important; }\n`;
  if (used(`hover:decoration-${tok}`)) s += `${hoverSel(`decoration-${tok}`)} { text-decoration-color: ${flatVal} !important; }\n`;
  if (used(`hover:accent-${tok}`)) s += `${hoverSel(`accent-${tok}`)} { accent-color: ${flatVal} !important; }\n`;
  return s;
}

for (const [oldHex, flatVal, rgbTriplet, label] of COLOR_MAP) {
  const base = `[#${oldHex.slice(1)}]`;
  let block = '';
  // bare 100%-opacity token (no numeric suffix). For bg-, always use a
  // SOLID color even when flatVal is itself an rgba(...) form (the
  // ink-60/ink-38 muted-text entries) — a translucent ink-60 used as a flat
  // background blends with whatever's underneath into a washed-out gray
  // (found on a toggle-switch knob: bg-[#8ba888], no opacity suffix, meant
  // to read as a solid ink dot, not a faded smudge). text-/border- keep the
  // muted rgba form, which IS the intended look there.
  const bgFlatVal = flatVal.startsWith('rgba') ? '#1A1512' : flatVal;
  block += emitTokenRules(base, bgFlatVal, flatVal);
  // every opacity-suffixed token actually reachable in Tailwind's syntax
  for (const step of OPACITY_STEPS) {
    block += emitTokenRules(`${base}/${step}`, rgba(rgbTriplet, step), flatVal);
  }
  // Header comment only when this color contributed at least one live rule —
  // most COLOR_MAP entries now emit a handful of rules instead of ~950.
  if (block) out += `/* ${oldHex} -> ${flatVal}  (${label}) */\n` + block + `\n`;
}

// ---- correction: hover:bg-[#233523] must NOT inherit #233523's own bare-
// token mapping (ink/mực đen). #233523 has exactly 2 distinct roles in the
// source (verified 2026-08-15 via grep): (1) the BARE token `bg-[#233523]`
// — used ONLY once, as the base background of the "Phân Tích & Tiếp Tục"
// combat CTA button, intentionally an inverted ink button (see the
// combined-selector exception above that flips ITS border/text to paper);
// (2) `hover:bg-[#233523]` — used ~8 OTHER places as the generic
// hover-highlight of buttons whose base is `bg-[#1b2a1b]` (paper-deep) or
// `bg-transparent`, i.e. it plays the exact same role as #1b2a1b's own
// hover state everywhere else, NOT the CTA's role. Those buttons' text
// stays ink (never flipped to paper), so if the automatic hover-mirror
// above (which — correctly for role (1) — copies the bare token's ink
// mapping onto the hover: token too) is left as the final word, all 8
// generic buttons get an ink hover background under ink text on hover =
// unreadable, same defect class as the original hover: gap this whole
// hover-mirroring feature exists to fix. Since this block runs AFTER the
// COLOR_MAP loop, same-specificity + !important ties resolve by source
// order — this wins and correctly overrides ONLY the hover: token role
// back to the paper-deep family (matching #1b2a1b's own hover treatment).
let fix233523 = '';
if (used('hover:bg-[#233523]')) fix233523 += `${hoverSel('bg-[#233523]')} { background-color: #EDE5D0 !important; }\n`;
for (const step of OPACITY_STEPS) {
  if (used(`hover:bg-[#233523]/${step}`)) fix233523 += `${hoverSel(`bg-[#233523]/${step}`)} { background-color: ${rgba([237, 229, 208], step)} !important; }\n`;
}
if (fix233523) out += `/* hover:bg-[#233523] correction — see comment above: hover role only, paper-deep family (like #1b2a1b), NOT the bare token's ink/CTA role */\n` + fix233523;

console.log(out);
