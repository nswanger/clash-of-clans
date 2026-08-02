import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export interface FilterMenuOption {
  value: string;
  label: string;
}

interface FilterMenuProps {
  label: string;
  value: string;
  options: FilterMenuOption[];
  ariaLabel: string;
  onChange: (value: string) => void;
}

export function FilterMenu({ label, value, options, ariaLabel, onChange }: FilterMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);

  const openMenu = () => setOpen(true);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };

  return <div className="filter-menu" ref={rootRef}>
    <span className="filter-menu-label">{label}</span>
    <button
      ref={triggerRef}
      className={`filter-menu-trigger ${value !== options[0]?.value ? "is-active" : ""}`}
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={onTriggerKeyDown}
    >
      <span>{selected?.label ?? "Choose"}</span>
      <span className={`filter-menu-caret ${open ? "is-open" : ""}`} aria-hidden="true">⌄</span>
    </button>
    {open ? <div id={menuId} className="filter-menu-popover" role="menu" aria-label={ariaLabel} ref={menuRef} onKeyDown={onMenuKeyDown}>
      {options.map((option) => <button
        key={option.value}
        className={`filter-menu-option ${option.value === value ? "selected" : ""}`}
        type="button"
        role="menuitemradio"
        aria-checked={option.value === value}
        onClick={() => {
          setOpen(false);
          if (option.value !== value) onChange(option.value);
        }}
      >
        <span>{option.label}</span>
        <span className="filter-menu-option-check" aria-hidden="true">{option.value === value ? "✓" : ""}</span>
      </button>)}
    </div> : null}
  </div>;
}
