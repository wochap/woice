import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMedia } from "@/store/media";
import { useUi } from "@/store/ui";
import { useDocument } from "@/store/document";
import { SHORTCUTS } from "@/lib/shortcuts";
import { loadDoc, media } from "@/test/fixtures";
import { ErrorState, errorDetails } from "./EmptyState";
import { KeyBar } from "./KeyBar";
import { ShortcutReference } from "./Dialogs";
import { Header, chips } from "./Header";
import { Sidebar, meterSegments, postGainPeak } from "./Sidebar";

describe("KeyBar", () => {
  beforeEach(() => loadDoc());
  const labels = () =>
    within(screen.getByRole("contentinfo"))
      .getAllByText(/./)
      .map((e) => e.textContent);
  it.each([
    [1280, ["Play", "Zoom sel.", "Export"], ["Undo", "Normalize"]],
    [1000, ["Play", "Zoom", "Export"], ["Fit", "Zoom sel.", "Undo"]],
    [
      640,
      ["Play", "Set In", "Set Out", "Export"],
      ["Play sel.", "Nudge", "Loop", "Zoom"],
    ],
  ])("filters by priority at %i px", (w, shown, hidden) => {
    act(() => useUi.setState({ windowWidth: w }));
    render(<KeyBar />);
    const l = labels();
    for (const s of shown) expect(l).toContain(s);
    for (const h of hidden) expect(l).not.toContain(h);
    expect(l).toContain("Shortcuts");
  });
  it("switches to handle mode", () => {
    act(() => useUi.setState({ focus: "in" }));
    render(<KeyBar />);
    expect(screen.getByText("IN HANDLE")).toBeVisible();
    expect(screen.getByText("In → playhead")).toBeVisible();
    expect(screen.queryByText("Shortcuts")).toBeNull();
  });
  it("shows Open / Quit / Shortcuts without a file", () => {
    act(() => useMedia.setState({ status: "empty", info: null }));
    render(<KeyBar />);
    expect(labels()).toEqual(
      expect.arrayContaining(["Open", "Quit", "Shortcuts"]),
    );
    expect(labels()).not.toContain("Play");
  });
});

describe("Shortcut reference", () => {
  it("renders every registry entry grouped", () => {
    render(<ShortcutReference />);
    expect(
      screen.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeVisible();
    for (const s of SHORTCUTS)
      expect(screen.getByText(s.label)).toBeInTheDocument();
    expect(screen.getByText("Navigate")).toBeVisible();
  });
});

describe("Error state", () => {
  it("renders the reason, raw message and copies the details", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    act(() =>
      useMedia.setState({
        status: "error",
        info: null,
        home: "/home/u",
        failure: {
          title: "Can’t read interview_final.m4a",
          reason: "The file’s index is missing.",
          detail: "ffprobe: moov atom not found",
          path: "/home/u/Downloads/interview_final.m4a",
          size: 18_400_000,
        },
      }),
    );
    render(
      <>
        <Header />
        <ErrorState />
      </>,
    );
    expect(screen.getByText("Can’t read interview_final.m4a")).toBeVisible();
    expect(screen.getByTestId("error-details")).toHaveTextContent(
      "ffprobe: moov atom not found",
    );
    expect(screen.getByTestId("error-details")).toHaveTextContent(
      "~/Downloads/interview_final.m4a · 18.4 MB",
    );
    expect(screen.getByText("unreadable")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Copy details/ }));
    expect(writeText).toHaveBeenCalledWith(
      errorDetails(
        "ffprobe: moov atom not found",
        "/home/u/Downloads/interview_final.m4a",
        18_400_000,
        "/home/u",
      ),
    );
  });
});

describe("Header chips", () => {
  it("lists codec, rate, layout, bitrate and duration", () => {
    expect(chips(media())).toEqual([
      "AAC-LC",
      "48 kHz",
      "mono",
      "192 kbps",
      "3:42.180",
    ]);
    expect(
      chips(
        media({
          codec: "FLAC",
          sampleRate: 44100,
          channels: 2,
          channelLayout: "stereo",
          bitDepth: 24,
          lossless: true,
          bitrate: 1_020_000,
          duration: 247.533,
        }),
      ),
    ).toEqual([
      "FLAC",
      "44.1 kHz",
      "stereo",
      "24-bit",
      "≈1 020 kbps",
      "4:07.533",
    ]);
  });
});

describe("Sidebar", () => {
  beforeEach(() => loadDoc(media({ duration: 222.18 })));
  it("typing a Duration moves Out", async () => {
    const { mockBackend } = await import("@/test/fixtures");
    mockBackend({
      snap_zero_crossing: ({ t }) => ({
        requested: t,
        time: t,
        snapped: false,
      }),
    });
    act(() => useDocument.getState().edit((d) => ({ ...d, in: 2.74 })));
    render(<Sidebar />);
    const field = screen.getByLabelText("Duration");
    fireEvent.change(field, { target: { value: "3:00.000" } });
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });
    expect(useDocument.getState().doc!.out).toBeCloseTo(182.74);
  });
  it("disables gain while normalize is on", () => {
    act(() => useDocument.getState().edit((d) => ({ ...d, normalize: true })));
    render(<Sidebar />);
    expect(screen.getByRole("slider", { name: "Gain" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("switch", { name: "Normalize" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
  it("shows the export hint and shortened path", () => {
    render(<Sidebar />);
    expect(screen.getByLabelText("Output path")).toHaveTextContent(
      "…/ep117/ep117_coldopen-trim.m4a",
    );
    expect(screen.getByRole("note")).toHaveTextContent(
      "De-click on → will re-encode",
    );
  });
});

describe("Level meter", () => {
  it("adds gain to the kept peak and reports clipping", () => {
    // −1.6 dBFS + 2 dB → +0.4: red, CLIP.
    const pk = postGainPeak(Math.pow(10, -1.6 / 20), 2, null)!;
    expect(pk).toBeCloseTo(0.4);
    const seg = meterSegments(pk);
    expect(seg.at(-1)).toBe("red");
    expect(seg[0]).toBe("green");
    expect(
      meterSegments(-20)
        .filter(Boolean)
        .every((c) => c === "green"),
    ).toBe(true);
    expect(meterSegments(-6)).toContain("yellow");
    expect(meterSegments(-6)).not.toContain("red");
    expect(postGainPeak(0.5, 6, "-1dbfs")).toBe(-1);
    expect(postGainPeak(0.5, 6, "-16lufs")).toBeCloseTo(-6.02);
  });
});
