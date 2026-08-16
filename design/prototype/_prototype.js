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
