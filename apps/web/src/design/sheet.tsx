/* The shared bottom-sheet behaviour layer, ported from design/prototype/_prototype.js.
 *
 * Wave 1 landed the sheet without it: the panel appeared and dismissed, but it
 * did not slide in and could not be dragged away. Wave 2 needs the same
 * behaviour on the lineup workspace, so it lands here on its own rather than
 * inside a surface rebuild, for the reason the icon sprite was split out — a
 * visual regression should have one possible cause, not two.
 *
 * What changes in the port is the trigger, not the gesture. The prototype
 * watches the DOM with a MutationObserver because its panels are re-rendered
 * through innerHTML and no page calls it; React knows when a sheet opens and
 * what it is showing, so the observer becomes a mounting and the `aria-label`
 * sniff becomes a prop. The constants and the physics are unchanged.
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

const DISMISS_FRACTION = 0.28; // of sheet height
const FLING_VELOCITY = 0.55; // px/ms — a fast flick dismisses from anywhere
const VELOCITY_WINDOW = 120; // ms of samples the velocity is measured over
const VELOCITY_MIN_SPAN = 12; // ms — below this there is no velocity to read
const SETTLE_MS = 300; // transitionend does not fire under reduced motion

interface SheetProps {
  /* What the sheet is showing, not how it looks. The entry animation replays
   * when this changes and stays put when it does not, so an open filter panel
   * does not bounce on every filter tap (#22). Callers pass the same string
   * they give the panel's `aria-label`, which is the identity the prototype
   * had to read back out of the DOM. */
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/* Only ever rendered where the panel is overlaid. Docked into a column it is
 * not a sheet, so it neither slides nor drags — and the caller already decides
 * that, because it is the same decision that picks the layout. There is no
 * media query here on purpose: a second one would be a second answer. */
export function Sheet({ label, onClose, children }: SheetProps) {
  return (
    <SheetOverlay key={label} onClose={onClose}>
      {children}
    </SheetOverlay>
  );
}

function SheetOverlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  /* The gesture listeners are attached once and must not be torn down and
   * rebuilt every time the page re-renders mid-drag, so they read the current
   * close handler through a ref rather than closing over it. */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  /* Before paint, not after: an entry animation stamped in a passive effect
   * shows one frame of the sheet already at rest. */
  useLayoutEffect(() => {
    const panel = overlayRef.current?.querySelector<HTMLElement>(".cm-panel");
    const scrim = overlayRef.current?.querySelector<HTMLElement>(".cm-scrim");
    panel?.classList.add("is-entering");
    scrim?.classList.add("is-entering");
    /* Stripped once it has played. A finished animation still wins over the
     * inline transform a drag sets, so leaving it on makes the sheet ignore
     * the first grab after it opens. */
    const done = () => {
      panel?.classList.remove("is-entering");
      scrim?.classList.remove("is-entering");
    };
    panel?.addEventListener("animationend", done, { once: true });
    return () => panel?.removeEventListener("animationend", done);
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    const panel = overlay?.querySelector<HTMLElement>(".cm-panel");
    if (!overlay || !panel) return;
    const scrim = overlay.querySelector<HTMLElement>(".cm-scrim");

    let drag: { startY: number; moved: number; samples: { t: number; y: number }[] } | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const setOffset = (dy: number) => {
      panel.style.transform = dy ? `translateY(${dy}px)` : "";
      if (scrim) scrim.style.opacity = dy ? String(Math.max(0.15, 1 - dy / 420)) : "";
    };

    /* Dragging starts on the head only. The body scrolls, and a sheet that
     * dismisses when you try to scroll its contents is worse than one that
     * does not dismiss at all. */
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const head = target?.closest<HTMLElement>(".cm-panel-head");
      if (!head || !overlay.contains(head)) return;
      if (target?.closest("button, a, input")) return; // the close control still closes
      drag = { startY: event.clientY, moved: 0, samples: [{ t: performance.now(), y: event.clientY }] };
      panel.classList.remove("is-settling", "is-entering");
      head.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag) return;
      drag.moved = Math.max(0, event.clientY - drag.startY);
      /* Velocity over a window of samples, never a single pair. Touch
       * digitizers deliver coalesced moves that can share a millisecond, and
       * dividing by a near-zero interval makes a slow drag look like a fling —
       * which dismissed the sheet out from under a careful gesture. */
      const now = performance.now();
      drag.samples.push({ t: now, y: event.clientY });
      while (drag.samples.length > 2 && now - (drag.samples[0]?.t ?? now) > VELOCITY_WINDOW) drag.samples.shift();
      setOffset(drag.moved);
    };

    const velocity = (samples: { t: number; y: number }[]) => {
      const first = samples[0];
      const last = samples[samples.length - 1];
      if (!first || !last) return 0;
      const span = last.t - first.t;
      if (span < VELOCITY_MIN_SPAN) return 0; // too little elapsed time to judge; distance decides
      return (last.y - first.y) / span;
    };

    const release = () => {
      if (!drag) return;
      const { moved, samples } = drag;
      const dismiss = moved > panel.offsetHeight * DISMISS_FRACTION || velocity(samples) > FLING_VELOCITY;
      drag = null;

      panel.classList.add("is-settling");
      if (!dismiss) {
        setOffset(0);
        return;
      }

      /* The sheet slides out before the page drops it. Unmounting on pointerup
       * would make a dismissal that animates on the way in vanish on the way
       * out; the page still owns the decision, it just hears about it once the
       * gesture has finished resolving. */
      setOffset(panel.offsetHeight);
      if (scrim) scrim.style.opacity = "0";
      const finish = () => closeRef.current();
      panel.addEventListener("transitionend", finish, { once: true });
      settleTimer = setTimeout(finish, SETTLE_MS);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", release);
      clearTimeout(settleTimer);
    };
  }, []);

  return (
    <div data-overlay ref={overlayRef}>
      <button className="cm-scrim" type="button" aria-label="Close" onClick={onClose} />
      {children}
    </div>
  );
}
