/* Clan Muster prototype behaviour layer.
 *
 * The counterpart to _prototype.css: behaviour that belongs to a shared
 * component rather than to a page. Both prototypes render their overlay panels
 * as `[data-overlay] > .scrim + .panel`, so the bottom-sheet gesture can live
 * here once instead of being written twice and drifting.
 *
 * Loads before the page script and needs no wiring — it watches the DOM for
 * overlays appearing rather than being called.
 */
(function () {
  "use strict";

  /* ---- icon sprite ---------------------------------------------------------
   * Injected here rather than pasted into each page, for the same reason the
   * CSS is shared: if an icon could not be defined once, that would be a
   * finding about the system rather than a formatting preference.
   *
   * These were Unicode glyphs until #40 measured the font. Google serves
   * Archivo with U+2191 and U+2193 but not U+2192 — up and down arrows, no
   * right arrow — and nothing from Misc Symbols, Braille, or Dingbats. Six of
   * the eight were rendering in whatever the platform happened to substitute,
   * and U+2605 renders as a COLOUR EMOJI on some platforms, in a data column.
   *
   * Drawn on a 24 grid, sized in em, coloured by currentColor — so an icon
   * still inherits size and colour from its type context, which is the one
   * good property the text glyphs had.
   */
  const SPRITE = `
  <symbol id="i-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M6 6 18 18M18 6 6 18"/></symbol>
  <symbol id="i-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 5 16 12 9 19"/></symbol>
  <symbol id="i-more" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></symbol>
  <symbol id="i-reorder" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 20V4M4 8l4-4 4 4M16 4v16M12 16l4 4 4-4"/></symbol>
  <symbol id="i-grip" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/>
    <circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/>
    <circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 12.5 10 17.5 19 6.5"/></symbol>
  <symbol id="i-arrow-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 12h15M13 6l6 6-6 6"/></symbol>
  <symbol id="i-star" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1.5 14.47 8.6 21.99 8.76 15.99 13.3 18.17 20.49 12 16.2 5.83 20.49 8.01 13.3 2.01 8.76 9.53 8.6Z"/></symbol>`;

  const sprite = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  sprite.setAttribute("aria-hidden", "true");
  sprite.setAttribute("width", "0");
  sprite.setAttribute("height", "0");
  sprite.style.position = "absolute";
  sprite.innerHTML = SPRITE;
  document.body.prepend(sprite);

  const isSheet = () => !window.matchMedia("(min-width: 720px)").matches;
  const overlay = () => document.querySelector("[data-overlay]");

  /* ---- entry animation ---------------------------------------------------
   * Panels are re-rendered by innerHTML, so a naive "animate on insert" would
   * re-play the slide every time something inside the sheet changes state — an
   * open filter panel would bounce on every filter tap. The sheet is only new
   * if it is showing something different, which its aria-label reports.
   */
  let lastLabel = null;

  new MutationObserver(() => {
    const node = overlay();
    if (!node) { lastLabel = null; return; }
    const panel = node.querySelector(".panel");
    if (!panel) return;
    const label = panel.getAttribute("aria-label");
    if (label === lastLabel) return;
    lastLabel = label;
    if (!isSheet()) return;
    panel.classList.add("is-entering");
    node.querySelector(".scrim")?.classList.add("is-entering");
  }).observe(document.body, { childList: true, subtree: true });

  /* ---- drag to dismiss ---------------------------------------------------
   * Dragging starts on the head only. The body scrolls, and a sheet that
   * dismisses when you try to scroll its contents is worse than one that does
   * not dismiss at all.
   */
  const DISMISS_FRACTION = 0.28;  // of sheet height
  const FLING_VELOCITY = 0.55;    // px/ms — a fast flick dismisses from anywhere
  const VELOCITY_WINDOW = 120;    // ms of samples the velocity is measured over
  const VELOCITY_MIN_SPAN = 12;   // ms — below this there is no velocity to read

  let drag = null;

  function setOffset(panel, scrim, dy) {
    panel.style.transform = dy ? `translateY(${dy}px)` : "";
    if (scrim) scrim.style.opacity = dy ? String(Math.max(0.15, 1 - dy / 420)) : "";
  }

  document.addEventListener("pointerdown", (event) => {
    if (!isSheet()) return;
    const node = overlay();
    if (!node) return;
    const head = event.target.closest(".panel-head");
    if (!head || !node.contains(head)) return;
    if (event.target.closest("button, a, input")) return;  // the close control still closes

    const panel = node.querySelector(".panel");
    drag = { panel, scrim: node.querySelector(".scrim"), startY: event.clientY, moved: 0,
             samples: [{ t: performance.now(), y: event.clientY }] };
    panel.classList.remove("is-settling", "is-entering");
    head.setPointerCapture?.(event.pointerId);
  });

  document.addEventListener("pointermove", (event) => {
    if (!drag) return;
    drag.moved = Math.max(0, event.clientY - drag.startY);
    // Velocity over a window of samples, never a single pair. Touch digitizers
    // deliver coalesced moves that can share a millisecond, and dividing by a
    // near-zero interval makes a slow drag look like a fling — which dismissed
    // the sheet out from under a careful gesture.
    const now = performance.now();
    drag.samples.push({ t: now, y: event.clientY });
    while (drag.samples.length > 2 && now - drag.samples[0].t > VELOCITY_WINDOW) drag.samples.shift();
    setOffset(drag.panel, drag.scrim, drag.moved);
  });

  function velocity() {
    const s = drag.samples;
    const span = s[s.length - 1].t - s[0].t;
    if (span < VELOCITY_MIN_SPAN) return 0;   // too little elapsed time to judge; distance decides
    return (s[s.length - 1].y - s[0].y) / span;
  }

  function release() {
    if (!drag) return;
    const { panel, scrim, moved } = drag;
    const dismiss = moved > panel.offsetHeight * DISMISS_FRACTION || velocity() > FLING_VELOCITY;
    drag = null;

    panel.classList.add("is-settling");
    if (!dismiss) { setOffset(panel, scrim, 0); return; }

    // Hand the dismissal back to the page's own close path rather than removing
    // the node here — the page owns the state that decides what renders next.
    setOffset(panel, scrim, panel.offsetHeight);
    if (scrim) scrim.style.opacity = "0";
    const finish = () => document.querySelector("[data-overlay] [data-close]")?.click();
    panel.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 300);  // transitionend does not fire under reduced motion
  }

  document.addEventListener("pointerup", release);
  document.addEventListener("pointercancel", release);
})();
