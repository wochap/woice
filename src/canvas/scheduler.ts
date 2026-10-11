/** Coalesces redraw requests from every canvas into one animation frame. */
const pending = new Set<() => void>();
let frame = 0;

export function schedule(draw: () => void) {
  pending.add(draw);
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const jobs = [...pending];
    pending.clear();
    for (const j of jobs) j();
  });
}

/** Sizes the canvas backing store to its CSS box at device pixel ratio. */
export function prepare(canvas: HTMLCanvasElement | null) {
  if (!canvas) return null;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return null;
  const dpr = window.devicePixelRatio || 1;
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.globalAlpha = 1;
  return { g, w, h };
}
