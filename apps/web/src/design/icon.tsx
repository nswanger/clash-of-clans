/* The Clan Muster icon set (#40), ported from design/prototype/_prototype.js.
 *
 * Eight icons, drawn on a 24 grid, shipped as one inline <symbol> sprite. No
 * icon library and no icon font: eight is small enough that a library would be
 * almost entirely unused weight, and a font adds a network request plus screen
 * readers announcing private-use codepoints.
 *
 * These were Unicode glyphs until #40 measured the font. Google serves Archivo
 * with U+2191 and U+2193 but not U+2192 — up and down arrows, no right arrow —
 * and nothing from Misc Symbols, Braille or Dingbats, so six of the eight were
 * rendering in whatever the platform happened to substitute, and U+2605 renders
 * as a colour emoji on some platforms inside a data column. Hence: an icon is
 * an element now, never a character assigned through textContent.
 *
 * The rule for what becomes one is role, not coverage: if it sits in running
 * text it stays a character, and if it is an affordance it becomes an icon.
 * That keeps the middle dot in `cm-sep` as punctuation while `x` and `>` become
 * icons even though Archivo has them, so one alignment model governs.
 */

export const ICON_NAMES = [
  "close",
  "chevron",
  "more",
  "reorder",
  "grip",
  "check",
  "arrow-right",
  "star",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/* Decorative by default, and there is no prop to make it otherwise: the
 * accessible name belongs on the button that contains the icon, never on the
 * icon itself (#23). A labelled variant can be added when a surface produces a
 * real need for one. */
export function Icon({ name, large = false }: { name: IconName; large?: boolean }) {
  return (
    <svg className={large ? "cm-icon is-lg" : "cm-icon"} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/* Mounted once at the app root. Zero-sized and absolutely positioned so it
 * occupies no layout: a <symbol> renders nothing on its own, but the <svg>
 * carrying it is still a box. */
export function IconSprite() {
  return (
    <svg aria-hidden="true" width={0} height={0} style={{ position: "absolute" }} data-cm-sprite="">
      <symbol id="i-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 6 18 18M18 6 6 18" />
      </symbol>
      <symbol id="i-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5 16 12 9 19" />
      </symbol>
      <symbol id="i-more" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="5" cy="12" r="1.9" />
        <circle cx="12" cy="12" r="1.9" />
        <circle cx="19" cy="12" r="1.9" />
      </symbol>
      <symbol id="i-reorder" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 20V4M4 8l4-4 4 4M16 4v16M12 16l4 4 4-4" />
      </symbol>
      <symbol id="i-grip" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="9" cy="6" r="1.7" />
        <circle cx="15" cy="6" r="1.7" />
        <circle cx="9" cy="12" r="1.7" />
        <circle cx="15" cy="12" r="1.7" />
        <circle cx="9" cy="18" r="1.7" />
        <circle cx="15" cy="18" r="1.7" />
      </symbol>
      <symbol id="i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5 10 17.5 19 6.5" />
      </symbol>
      <symbol id="i-arrow-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12h15M13 6l6 6-6 6" />
      </symbol>
      <symbol id="i-star" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 1.5 14.47 8.6 21.99 8.76 15.99 13.3 18.17 20.49 12 16.2 5.83 20.49 8.01 13.3 2.01 8.76 9.53 8.6Z" />
      </symbol>
    </svg>
  );
}
