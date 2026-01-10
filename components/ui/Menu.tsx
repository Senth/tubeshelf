"use client";

import React, { ReactNode } from "react";

interface MenuItemProps {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  badge?: string | number;
  divider?: boolean;
  className?: string;
}

interface MenuProps {
  isOpen: boolean;
  items: MenuItemProps[];
  align?: "left" | "right";
  className?: string;
}

export function MenuDivider() {
  return <div className="h-px bg-border/50 my-1" />;
}

export function MenuItem({
  icon,
  label,
  onClick,
  destructive = false,
  badge,
  className = "",
}: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full px-3 py-2.5 text-left text-sm
        flex items-center gap-3
        transition-all duration-150
        rounded-md
        ${
          destructive
            ? "text-destructive hover:bg-destructive/10 active:bg-destructive/15"
            : "text-foreground hover:bg-primary/5 active:bg-primary/10"
        }
        focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-0
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      {icon && <span className="flex-shrink-0 w-4 h-4">{icon}</span>}
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span className="flex-shrink-0 bg-primary text-primary-foreground text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
          {badge}
        </span>
      )}
    </button>
  );
}

export function Menu({
  isOpen,
  items,
  align = "right",
  className = "",
}: MenuProps) {
  if (!isOpen) return null;

  return (
    <div
      className={`
        absolute top-full mt-2
        ${align === "right" ? "right-0" : "left-0"}
        w-64 max-h-[28rem]
        bg-card border border-border/50
        rounded-lg shadow-lg
        overflow-y-auto
        z-50
        ${className}
      `}
    >
      <div className="flex flex-col divide-y divide-border/30">
        {items.map((item, idx) => (
          <React.Fragment key={idx}>
            {item.divider && idx > 0 ? <MenuDivider /> : null}
            <MenuItem {...item} />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
