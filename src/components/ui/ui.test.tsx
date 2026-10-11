import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { formatTime, parseTime } from "@/lib/time";
import { Button } from "./button";
import { SteppedField } from "./field";
import { Segmented } from "./segmented";
import { Slider } from "./slider";
import { Toggle } from "./toggle";

const steps = { base: 0.1, fine: 0.01, coarse: 1 };
function TimeField(props: {
  value: number;
  onCommit?: (v: number) => void;
  onStep?: (d: number) => void;
}) {
  return (
    <SteppedField
      label="In"
      value={props.value}
      format={formatTime}
      parse={parseTime}
      steps={steps}
      onCommit={props.onCommit ?? (() => {})}
      onStep={props.onStep ?? (() => {})}
    />
  );
}

describe("Segmented", () => {
  const options = [
    { value: "a", label: "Alpha", sub: "192 k" },
    { value: "b", label: "Beta", sub: "128 k" },
  ];
  it("is a labelled radio group with sublabels", async () => {
    const change = vi.fn();
    render(
      <Segmented
        label="Quality"
        value="a"
        options={options}
        onChange={change}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Quality" })).toBeVisible();
    expect(screen.getByRole("radio", { name: /Alpha/ })).toBeChecked();
    expect(screen.getByText("128 k")).toBeVisible();
    await userEvent.click(screen.getByRole("radio", { name: /Beta/ }));
    expect(change).toHaveBeenCalledWith("b");
  });
  it("disables every option", () => {
    render(
      <Segmented
        label="Q"
        value="a"
        options={options}
        onChange={() => {}}
        disabled
      />,
    );
    for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
  });
});

describe("Toggle", () => {
  it("is a switch that reports the next state", async () => {
    const change = vi.fn();
    const { rerender } = render(
      <Toggle label="Normalize" checked={false} onChange={change} />,
    );
    const sw = screen.getByRole("switch", { name: "Normalize" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    expect(change).toHaveBeenCalledWith(true);
    rerender(<Toggle label="Normalize" checked onChange={change} disabled />);
    expect(screen.getByRole("switch")).toBeDisabled();
  });
});

describe("Time field", () => {
  it("commits a typed time on Enter", async () => {
    const commit = vi.fn();
    render(<TimeField value={2.74} onCommit={commit} />);
    const input = screen.getByLabelText("In");
    expect(input).toHaveValue("0:02.740");
    await userEvent.clear(input);
    await userEvent.type(input, "3:00.000{Enter}");
    expect(commit).toHaveBeenCalledWith(180);
  });
  it("reverts invalid text on blur and on Esc", async () => {
    const commit = vi.fn();
    render(<TimeField value={2.74} onCommit={commit} />);
    const input = screen.getByLabelText("In");
    await userEvent.clear(input);
    await userEvent.type(input, "abc");
    fireEvent.blur(input);
    expect(input).toHaveValue("0:02.740");
    await userEvent.type(input, "9{Escape}");
    expect(input).toHaveValue("0:02.740");
    expect(commit).not.toHaveBeenCalled();
  });
  it("steps with arrows and steppers, Alt fine and Shift coarse", async () => {
    const step = vi.fn();
    render(<TimeField value={1} onStep={step} />);
    const input = screen.getByLabelText("In");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowDown", altKey: true });
    fireEvent.keyDown(input, { key: "ArrowUp", shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: "In +" }), {
      shiftKey: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "In −" }));
    expect(step.mock.calls.map((c) => c[0])).toEqual([0.1, -0.01, 1, 1, -0.1]);
  });
});

describe("Slider and Button", () => {
  it("exposes slider values and steps with arrows", () => {
    const change = vi.fn();
    const commit = vi.fn();
    render(
      <Slider
        label="Gain"
        min={-24}
        max={12}
        step={0.5}
        detent={0}
        value={0}
        onChange={change}
        onCommit={commit}
      />,
    );
    const s = screen.getByRole("slider", { name: "Gain" });
    expect(s).toHaveAttribute("aria-valuenow", "0");
    fireEvent.keyDown(s, { key: "ArrowRight" });
    expect(change).toHaveBeenCalledWith(0.5);
    expect(commit).toHaveBeenCalledWith(0.5);
  });
  it("renders outlined variants", () => {
    render(<Button variant="primary">Export</Button>);
    expect(screen.getByRole("button", { name: "Export" })).toHaveClass(
      "border-lavender",
    );
  });
});
