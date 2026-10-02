import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "./sheet.js";

/* jsdom lays nothing out, so every panel is 0px tall and the dismiss threshold
 * would be crossed by a one-pixel twitch. Height is the thing the gesture is
 * measured against, so the test states it. */
function panelOf(container: HTMLElement, height = 500) {
  const panel = container.querySelector<HTMLElement>(".cm-panel");
  if (!panel) throw new Error("panel missing");
  Object.defineProperty(panel, "offsetHeight", { configurable: true, value: height });
  return panel;
}

function Panel({ label }: { label: string }) {
  return (
    <div className="cm-panel" role="dialog" aria-modal="true" aria-label={label}>
      <div className="cm-panel-head">
        <h2>{label}</h2>
        <button type="button" aria-label="Close">x</button>
      </div>
      <div className="cm-panel-body">body</div>
    </div>
  );
}

const drag = (from: HTMLElement, ...ys: number[]) => {
  fireEvent.pointerDown(from, { clientY: ys[0] });
  for (const y of ys.slice(1)) fireEvent.pointerMove(document, { clientY: y });
  fireEvent.pointerUp(document, { clientY: ys[ys.length - 1] });
};

describe("Sheet", () => {
  it("dismisses through the scrim", () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(<Sheet label="Nick" onClose={onClose}><Panel label="Nick" /></Sheet>);
    fireEvent.click(getByLabelText("Close", { selector: ".cm-scrim" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("animates in when it opens", () => {
    const { container } = render(<Sheet label="Nick" onClose={vi.fn()}><Panel label="Nick" /></Sheet>);
    expect(container.querySelector(".cm-panel")).toHaveClass("is-entering");
    expect(container.querySelector(".cm-scrim")).toHaveClass("is-entering");
  });

  it("stops animating once the entry has played, so the first grab is not ignored", () => {
    const { container } = render(<Sheet label="Nick" onClose={vi.fn()}><Panel label="Nick" /></Sheet>);
    fireEvent.animationEnd(panelOf(container));
    expect(container.querySelector(".cm-panel")).not.toHaveClass("is-entering");
    expect(container.querySelector(".cm-scrim")).not.toHaveClass("is-entering");
  });

  it("does not replay the entry when the same sheet re-renders", () => {
    /* #22: panels re-render on every control inside them. An open filter panel
     * that bounced on each filter tap is the bug this guards. */
    const { container, rerender } = render(
      <Sheet label="Filters" onClose={vi.fn()}><Panel label="Filters" /><p>one</p></Sheet>,
    );
    fireEvent.animationEnd(panelOf(container));
    rerender(<Sheet label="Filters" onClose={vi.fn()}><Panel label="Filters" /><p>two</p></Sheet>);
    expect(container.querySelector(".cm-panel")).not.toHaveClass("is-entering");
  });

  it("replays the entry when the sheet shows something different", () => {
    const { container, rerender } = render(<Sheet label="Nick" onClose={vi.fn()}><Panel label="Nick" /></Sheet>);
    fireEvent.animationEnd(panelOf(container));
    rerender(<Sheet label="Filters" onClose={vi.fn()}><Panel label="Filters" /></Sheet>);
    expect(container.querySelector(".cm-panel")).toHaveClass("is-entering");
  });

  it("dismisses on a drag past the threshold", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { container } = render(<Sheet label="Nick" onClose={onClose}><Panel label="Nick" /></Sheet>);
    const panel = panelOf(container, 500);
    drag(panel.querySelector<HTMLElement>(".cm-panel-head")!, 100, 200, 300); // 200px of 500
    expect(onClose).not.toHaveBeenCalled(); // it slides out first
    vi.advanceTimersByTime(300);
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("springs back from a drag short of the threshold", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { container } = render(<Sheet label="Nick" onClose={onClose}><Panel label="Nick" /></Sheet>);
    const panel = panelOf(container, 500);
    drag(panel.querySelector<HTMLElement>(".cm-panel-head")!, 100, 120); // 20px of 500
    vi.advanceTimersByTime(300);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe("");
    vi.useRealTimers();
  });

  it("leaves the body alone, so scrolling the contents is not a dismissal", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { container } = render(<Sheet label="Nick" onClose={onClose}><Panel label="Nick" /></Sheet>);
    const panel = panelOf(container, 500);
    drag(panel.querySelector<HTMLElement>(".cm-panel-body")!, 100, 400);
    vi.advanceTimersByTime(300);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe("");
    vi.useRealTimers();
  });

  it("leaves the close control clickable rather than treating it as a grab", () => {
    const onClose = vi.fn();
    const { container, getAllByLabelText } = render(<Sheet label="Nick" onClose={onClose}><Panel label="Nick" /></Sheet>);
    const panel = panelOf(container, 500);
    const close = getAllByLabelText("Close").find((node) => node.closest(".cm-panel-head"))!;
    drag(close, 100, 300);
    expect(panel.style.transform).toBe("");
  });

  describe("with a keyboard open", () => {
    /* jsdom has no visual viewport, so the test supplies one: an 844px phone
     * whose keyboard covers the bottom 336px. */
    function stubViewport(height: number) {
      const viewport = Object.assign(new EventTarget(), { height, offsetTop: 0 });
      vi.stubGlobal("visualViewport", viewport);
      vi.stubGlobal("innerHeight", 844);
      return viewport;
    }
    afterEach(() => { vi.unstubAllGlobals(); });

    function SearchPanel() {
      return (
        <div className="cm-panel" role="dialog" aria-modal="true" aria-label="Bench">
          <div className="cm-panel-head"><h2>Bench</h2></div>
          <div className="cm-panel-body"><input type="search" aria-label="Find a member" /></div>
        </div>
      );
    }

    it("lifts the sheet above the keyboard while its search has focus", () => {
      const viewport = stubViewport(508);
      const { getByRole } = render(<Sheet label="Bench" onClose={vi.fn()}><SearchPanel /></Sheet>);
      const overlay = getByRole("dialog").parentElement!;
      getByRole("searchbox").focus();
      viewport.dispatchEvent(new Event("resize"));
      expect(overlay.style.getPropertyValue("--cm-keyboard-inset")).toBe("336px");
      expect(overlay.style.getPropertyValue("--cm-visible-height")).toBe("508px");
    });

    it("drops back to the bottom when the search lets go of focus", () => {
      const viewport = stubViewport(508);
      const { getByRole } = render(<Sheet label="Bench" onClose={vi.fn()}><SearchPanel /></Sheet>);
      const overlay = getByRole("dialog").parentElement!;
      const search = getByRole("searchbox");
      search.focus();
      viewport.dispatchEvent(new Event("resize"));
      search.blur();
      expect(overlay.style.getPropertyValue("--cm-keyboard-inset")).toBe("");
    });

    it("ignores a pinch-zoom, which shrinks the viewport with no field focused", () => {
      const viewport = stubViewport(400);
      const { getByRole } = render(<Sheet label="Bench" onClose={vi.fn()}><SearchPanel /></Sheet>);
      viewport.dispatchEvent(new Event("resize"));
      expect(getByRole("dialog").parentElement!.style.getPropertyValue("--cm-keyboard-inset")).toBe("");
    });
  });
});
