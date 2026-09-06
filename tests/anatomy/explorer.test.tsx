// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import fixture from "./catalogue.fixture.json";
import type { CanvasProps } from "../../components/anatomy/AtlasCanvas";
const canvasObservation = vi.hoisted(() => ({
  props: null as CanvasProps | null,
}));
vi.mock("next/dynamic", () => ({
  default: () =>
    function FakeCanvas(p: CanvasProps) {
      canvasObservation.props = p;
      return (
        <div data-testid="canvas">
          <button onClick={() => p.onPick("FJ3259")}>Pick left femur</button>
          <button onClick={() => p.onError("context-lost")}>Lose WebGL</button>
        </div>
      );
    },
}));
vi.mock("../../lib/anatomy/validation", () => ({
  fetchAtlasManifest: vi.fn(async () => fixture),
}));
import AnatomyExplorer from "../../components/anatomy/AnatomyExplorer";
import { I18nProvider } from "../../lib/i18n";
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});
afterEach(cleanup);
const open = () =>
  render(
    <I18nProvider defaultLang="en">
      <AnatomyExplorer
        manifestUrl={`/anatomy/${fixture.release}/manifest.json`}
      />
    </I18nProvider>,
  );
it("keeps text usable before opening 3D and after context loss, disposes the canvas on close", async () => {
  open();
  await screen.findByRole("button", { name: "Open 3D view" });
  expect(screen.queryByTestId("canvas")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open 3D view" }));
  expect(screen.getByTestId("canvas")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close 3D view" }));
  expect(screen.queryByTestId("canvas")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open 3D view" }));
  fireEvent.click(screen.getByRole("button", { name: "Lose WebGL" }));
  expect(screen.queryByTestId("canvas")).toBeNull();
  expect(screen.getByRole("searchbox")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
});
it("picking and search select the same source identity and explain hidden layers", async () => {
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Open 3D view" }));
  fireEvent.click(screen.getByRole("button", { name: "Pick left femur" }));
  expect(screen.getAllByRole("heading", { name: "left femur" })).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: /Skeleton/ }));
  expect(
    screen.getAllByText(/Some or all of this selection is hidden/),
  ).toBeTruthy();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "FMA24475" },
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /left femur FMA24475/ }),
    ).toBeTruthy(),
  );
  fireEvent.click(screen.getByRole("button", { name: /left femur FMA24475/ }));
  expect(screen.getAllByRole("heading", { name: "left femur" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
  expect(
    screen.queryByText(/Some or all of this selection is hidden/),
  ).toBeNull();
});

it("filters catalogue independently of visible layers and clears an empty combination", async () => {
  open();
  await screen.findByRole("button", { name: "Open 3D view" });
  const skeleton = screen.getByRole("checkbox", {
    name: /Skeleton/,
  }) as HTMLInputElement;
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "FMA24475" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Muscles" }));
  expect(
    screen.queryByRole("button", { name: /left femur FMA24475/ }),
  ).toBeNull();
  expect(skeleton.checked).toBe(true);
  fireEvent.click(screen.getAllByRole("button", { name: "Skeleton" }).at(-1)!);
  expect(
    screen.getByRole("button", { name: /left femur FMA24475/ }),
  ).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "Side" }), {
    target: { value: "right" },
  });
  expect(
    screen.queryByRole("button", { name: /left femur FMA24475/ }),
  ).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");

  expect(screen.queryByRole("combobox", { name: "Side" })).toBeNull();
  expect(skeleton.checked).toBe(true);
});

it("keeps viewer mounted while browsing and shows source-backed identification on pick", async () => {
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Open 3D view" }));
  const canvas = screen.getByTestId("canvas");
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(screen.getByTestId("canvas")).toBe(canvas);
  fireEvent.click(screen.getByRole("button", { name: "Pick left femur" }));
  const card = screen.getByRole("region", {
    name: "Selected structure in viewer",
  });
  expect(card.textContent).toContain("FMA24475");
  expect(card.textContent).toContain("left femur");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss selection" }));
  expect(
    screen.queryByRole("region", { name: "Selected structure in viewer" }),
  ).toBeNull();
  expect(screen.getByTestId("canvas")).toBe(canvas);
});

it("opens workout focus without organs and preserves deep exploration as a separate mode", async () => {
  render(
    <I18nProvider defaultLang="en">
      <AnatomyExplorer
        workout
        initialGroup="chest"
        manifestUrl="/manifest.json"
      />
    </I18nProvider>,
  );
  await screen.findByTestId("canvas");
  expect(screen.getByRole("heading", { name: "Muscle Atlas" })).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Exercises" }).getAttribute("href"),
  ).toBe("/dashboard/workout/exercises?atlas=chest");
  expect(canvasObservation.props!.interactive).toBe(true);
  act(() => canvasObservation.props!.onManualView?.());
  expect(
    screen.getByRole("button", { name: "View direction" }).textContent,
  ).toContain("Free view");
  expect(
    screen
      .getByRole("button", { name: "Subgroup colors" })
      .closest(".anatomy-stage"),
  ).toBeTruthy();
  const loadedManifest = canvasObservation.props!.manifest;
  fireEvent.click(screen.getByRole("button", { name: "Groups" }));
  fireEvent.click(screen.getByRole("button", { name: "Glutes" }));
  expect(canvasObservation.props!.manifest).toBe(loadedManifest);
  expect(canvasObservation.props!.view).toBe("back");
  expect(
    screen
      .getByRole("button", { name: "Groups" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "View direction" }));
  fireEvent.click(screen.getByRole("button", { name: "Side" }));
  expect(canvasObservation.props!.view).toBe("side");
  fireEvent.click(screen.getByRole("button", { name: "Groups" }));
  fireEvent.click(screen.getByRole("button", { name: "Neck & shoulders" }));
  expect(canvasObservation.props!.manifest).toBe(loadedManifest);
  expect(
    screen.getByRole("link", { name: "Exercises" }).getAttribute("href"),
  ).toBe("/dashboard/workout/exercises");
  expect(
    screen.getByText(/This group has no highlight available yet/),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Explore full atlas/ }));
  expect(screen.getByRole("heading", { name: "Explore anatomy" })).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "Organs" })).toBeTruthy();
});

it("toggles a muscle off and restores group framing from both return buttons", async () => {
  const { fetchAtlasManifest } = await import("../../lib/anatomy/validation");
  const source = structuredClone(fixture);
  Object.assign(source.concepts, {
    FMA13397: {
      ...source.concepts.FMA24475,
      id: "FMA13397",
      elements: ["FJ3259"],
    },
    FMA34687: {
      ...source.concepts.FMA24474,
      id: "FMA34687",
      elements: ["FJ3365"],
    },
  });
  vi.mocked(fetchAtlasManifest).mockResolvedValueOnce(
    source as unknown as CanvasProps["manifest"],
  );
  render(
    <I18nProvider defaultLang="en">
      <AnatomyExplorer
        workout
        initialGroup="chest"
        manifestUrl="/manifest.json"
      />
    </I18nProvider>,
  );
  const serratus = await screen.findByRole("button", {
    name: "Serratus anterior",
  });
  await waitFor(() =>
    expect((serratus as HTMLButtonElement).disabled).toBe(false),
  );
  const resident = canvasObservation.props!.manifest;
  fireEvent.click(serratus);
  expect(canvasObservation.props!.focusElements).toEqual(["FJ3259"]);
  expect(canvasObservation.props!.cameraGroup).toBe("serratus-anterior");
  fireEvent.click(serratus);
  expect(serratus.getAttribute("aria-pressed")).toBe("false");
  expect(canvasObservation.props!.cameraGroup).toBe("chest");
  expect(canvasObservation.props!.focusElements).toHaveLength(2);
  for (const index of [0, 1]) {
    fireEvent.click(serratus);
    fireEvent.click(screen.getByRole("button", { name: "Isolate selection" }));
    act(() => canvasObservation.props!.onManualView?.());
    fireEvent.click(
      screen.getAllByRole("button", { name: "Show full group" })[index],
    );
    expect(canvasObservation.props!.isolated).toBe(false);
    expect(canvasObservation.props!.cameraGroup).toBe("chest");
    expect(canvasObservation.props!.view).toBe("front");
    expect(
      screen.getByRole("button", { name: "View direction" }).textContent,
    ).not.toContain("Free view");
    expect(canvasObservation.props!.manifest).toBe(resident);
  }
});
