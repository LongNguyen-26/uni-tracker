"use client";
import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import { ChevronDown, Plus } from "lucide-react";

export type SplitAction = {
  id: string;
  icon: ComponentType<{ size?: number }>;
  label: string;
  hint?: string;
  disabled?: boolean;
  onSelect: () => void;
};
// The weekly action stays one click away; the once-a-term ones go in the menu.
export default function SplitButton({
  label,
  actions,
  onClick,
}: {
  label: string;
  actions: SplitAction[];
  onClick: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector("button")?.focus();
  }, [open]);
  return (
    <div
      className="split-button"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button className="button primary split-main" onClick={onClick}>
        <Plus size={17} />
        {label}
      </button>
      <button
        className="button primary split-toggle"
        aria-label={`Thêm lựa chọn cho ${label}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="split-menu" id={id} ref={menu} role="menu">
          {actions.map((action) => (
            <button
              key={action.id}
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
            >
              <action.icon size={17} />
              <span>
                <strong>{action.label}</strong>
                {action.hint && <small>{action.hint}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
