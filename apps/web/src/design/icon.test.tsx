import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, ICON_NAMES, IconSprite } from "./icon.js";

describe("IconSprite", () => {
  it("defines every icon the set names, so no Icon can reference a missing symbol", () => {
    const { container } = render(<IconSprite />);
    const defined = [...container.querySelectorAll("symbol")].map((symbol) => symbol.id);
    expect(defined).toEqual(ICON_NAMES.map((name) => `i-${name}`));
  });

  it("occupies no layout and is hidden from assistive technology", () => {
    const { container } = render(<IconSprite />);
    const sprite = container.querySelector("svg");
    expect(sprite).toHaveAttribute("aria-hidden", "true");
    expect(sprite).toHaveAttribute("width", "0");
    expect(sprite).toHaveAttribute("height", "0");
    expect(sprite?.textContent).toBe("");
  });
});

describe("Icon", () => {
  it("references the sprite rather than assigning a character", () => {
    const { container } = render(<Icon name="star" />);
    const use = container.querySelector("use");
    expect(use).toHaveAttribute("href", "#i-star");
    // #40: a glyph assigned through textContent is the latent break this replaces.
    expect(container.textContent).toBe("");
  });

  it("is decorative, so the accessible name stays on whatever contains it", () => {
    const { container } = render(
      <button type="button" aria-label="Close">
        <Icon name="close" />
      </button>,
    );
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("carries the component class and its one variant", () => {
    const { container: plain } = render(<Icon name="chevron" />);
    expect(plain.querySelector("svg")).toHaveAttribute("class", "cm-icon");

    const { container: large } = render(<Icon name="chevron" large />);
    expect(large.querySelector("svg")).toHaveAttribute("class", "cm-icon is-lg");
  });
});
