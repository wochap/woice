import { EMPTY_BAR, editorBar, handleBar, type BarItem } from "@/lib/shortcuts";
import { useMedia } from "@/store/media";
import { useUi } from "@/store/ui";
import { Keys } from "./ui/kbd";

function Item({ item }: { item: BarItem }) {
  return (
    <span className="flex flex-none items-center gap-[5px]">
      <Keys keys={item.keys} />
      <span className="text-[11px] text-subtext0">{item.label}</span>
    </span>
  );
}

/** Bottom key hints from the SHORTCUTS registry, filtered by window width. */
export function KeyBar() {
  const width = useUi((s) => s.windowWidth);
  const focus = useUi((s) => s.focus);
  const status = useMedia((s) => s.status);
  const hasDoc = status === "ready";
  const { items, pinned } = editorBar(width);
  let left: BarItem[] = items;
  let badge: string | null = null;
  if (!hasDoc) left = EMPTY_BAR;
  else if (focus !== "playhead") {
    badge = focus === "in" ? "IN HANDLE" : "OUT HANDLE";
    left = handleBar(focus);
  }
  return (
    <footer
      aria-label="Keyboard shortcuts"
      className="relative flex h-[28px] flex-none items-center gap-[12px] overflow-hidden bg-crust px-[12px] whitespace-nowrap"
    >
      <div className="rule-x absolute inset-x-0 top-0" />
      {badge && (
        <span className="flex flex-none items-center rounded-[6px] border border-lavender px-[8px] py-px font-mono text-[10px] font-semibold tracking-[.06em] text-lavender">
          {badge}
        </span>
      )}
      {/* Items that do not fit wrap onto a hidden line, so none is clipped mid-item. */}
      <div className="flex h-[16px] min-w-0 flex-1 flex-wrap items-center gap-x-[12px] gap-y-[20px] overflow-hidden">
        {left.map((i) => (
          <Item key={i.label} item={i} />
        ))}
      </div>
      {!badge && <Item item={pinned} />}
    </footer>
  );
}
