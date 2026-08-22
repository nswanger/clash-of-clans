/* The Clan Muster mark (#24), ported from design/prototype/app-chrome.html,
 * which lifted it from identity.html unchanged so the two cannot drift.
 *
 * ONE MARK WITH A CONTAINER VARIANT, NOT TWO MARKS. A dragon's head cabossed —
 * facing the viewer, no neck — wherever there is room; the same head knocked out
 * of a shield at 16-32px. The badge is generated from the head by transform
 * rather than redrawn, so refining either cannot leave them disagreeing.
 *
 * Where identity is permitted: the app mark in the top bar at 24px, once per
 * screen; the favicon; and empty states, muted to a neutral rather than gold,
 * because an empty state is not an achievement. Forbidden: on rows, as a
 * watermark, as any repeating texture, and — most importantly — carrying a state
 * colour. The moment the mark goes green or red it becomes a sixth semantic
 * mark, and #19 fixed the set at five. Identity never states an evaluation.
 *
 * #24's placement rule read "the top bar, beside the product name". #58 amended
 * it: the only bar in this app names the PAGE, so the mark stands alone in
 * `cm-topbar`'s first slot. The rule that was load-bearing — once per screen,
 * top bar, never on rows or as texture — is unchanged.
 */

/* `--mark-bg` is what the cuts are knocked out to, so it must be the colour
 * actually behind the mark rather than a fixed white: the shield sits on
 * `--cm-bg` in the topbar, and since wave 4 the head sits on `--cm-surface` in
 * the stand-down state. A wrong value shows as three pale slivers on the head,
 * which is why `background` is a prop rather than a constant — the caller is the
 * only thing that knows what is actually behind it. */
export function Mark({ variant, className, fill, background = "var(--cm-bg)" }: {
  variant: "shield" | "head";
  className: string;
  fill: string;
  background?: string;
}) {
  return (
    <svg className={className} aria-hidden="true" style={{ ["--mark-bg" as string]: background, fill }}>
      <use href={`#cm-mark-${variant}`} />
    </svg>
  );
}

/* Mounted once at the app root beside `IconSprite`, and zero-sized for the same
 * reason: a <symbol> renders nothing on its own, but the <svg> carrying it is
 * still a box. */
export function MarkSprite() {
  return (
    <svg aria-hidden="true" width={0} height={0} style={{ position: "absolute" }} data-cm-mark-sprite="">
      <path id="cm-head-cabossed" d="M24 13 L18 6 L16 13 L4 2 L10 17 L5 23 L12 29 L15 38 L24 46 L33 38 L36 29 L43 23 L38 17 L44 2 L32 13 L30 6 Z" />
      <g id="cm-head-cabossed-cuts">
        <path d="M11 21 L20 25 L12 25.5 Z" />
        <path d="M37 21 L28 25 L36 25.5 Z" />
        <path d="M20 34 L28 34 L24 39 Z" />
      </g>
      <symbol id="cm-mark-head" viewBox="0 0 48 48">
        <use href="#cm-head-cabossed" />
        <use href="#cm-head-cabossed-cuts" fill="var(--mark-bg, #fff)" />
      </symbol>
      <symbol id="cm-mark-shield" viewBox="0 0 48 48">
        <path d="M24 2 L44 8 L44 24 C44 37 35 43.5 24 47 C13 43.5 4 37 4 24 L4 8 Z" />
        <g transform="translate(10.5 9.5) scale(0.56)">
          <use href="#cm-head-cabossed" fill="var(--mark-bg, #fff)" />
        </g>
      </symbol>
    </svg>
  );
}
