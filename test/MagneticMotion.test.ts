import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MagneticMotion, {
  magneticMotionDefaults,
  magneticMotionFeelPresets,
} from "../src";

class MockMediaQueryList extends EventTarget implements MediaQueryList {
  readonly media: string;
  matches: boolean;
  onchange:
    | ((this: MediaQueryList, event: MediaQueryListEvent) => unknown)
    | null = null;

  constructor(media: string, matches: boolean) {
    super();
    this.media = media;
    this.matches = matches;
  }

  setMatches(matches: boolean): void {
    if (this.matches === matches) return;
    this.matches = matches;
    this.dispatchEvent(new Event("change"));
  }

  addListener(
    listener:
      | ((this: MediaQueryList, event: MediaQueryListEvent) => unknown)
      | null,
  ): void {
    if (listener) {
      this.addEventListener("change", listener as EventListener);
    }
  }

  removeListener(
    listener:
      | ((this: MediaQueryList, event: MediaQueryListEvent) => unknown)
      | null,
  ): void {
    if (listener) {
      this.removeEventListener("change", listener as EventListener);
    }
  }
}

class MockResizeObserver implements ResizeObserver {
  static instances: MockResizeObserver[] = [];
  readonly observed = new Set<Element>();

  constructor(
    private readonly callback: ResizeObserverCallback,
  ) {
    MockResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.add(target);
  }

  unobserve(target: Element): void {
    this.observed.delete(target);
  }

  disconnect(): void {
    this.observed.clear();
  }

  takeRecords(): ResizeObserverEntry[] {
    return [];
  }

  emit(target: Element): void {
    this.callback(
      [{ target } as ResizeObserverEntry],
      this,
    );
  }
}

const instances: MagneticMotion[] = [];
const frames = new Map<number, FrameRequestCallback>();
const mediaQueries = new Map<string, MockMediaQueryList>();
let frameId = 0;
let frameTime = 0;

const media = (query: string): MockMediaQueryList => {
  const result =
    mediaQueries.get(query) ?? new MockMediaQueryList(query, false);
  mediaQueries.set(query, result);
  return result;
};

const flushFrames = (limit = 300): void => {
  let count = 0;
  while (frames.size && count < limit) {
    const callbacks = [...frames.values()];
    frames.clear();
    frameTime += 16.667;
    for (const callback of callbacks) callback(frameTime);
    count += 1;
  }
};

const rect = (
  left = 0,
  top = 0,
  width = 200,
  height = 100,
): DOMRect => ({
  x: left,
  y: top,
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  toJSON: () => ({}),
} as DOMRect);

const makeTarget = (
  markup = "",
  box = rect(),
): HTMLElement => {
  const element = document.createElement("div");
  element.setAttribute("data-magnetic", "");
  element.innerHTML = markup;
  document.body.appendChild(element);
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(box);
  return element;
};

const movePointer = (
  clientX: number,
  clientY: number,
  pointerType = "mouse",
): void => {
  document.dispatchEvent(
    new PointerEvent("pointermove", {
      clientX,
      clientY,
      pointerType,
      bubbles: true,
    }),
  );
};

beforeEach(() => {
  document.body.innerHTML = "";
  frames.clear();
  mediaQueries.clear();
  MockResizeObserver.instances = [];
  frameId = 0;
  frameTime = 0;

  vi.stubGlobal("matchMedia", media);
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  vi.stubGlobal(
    "requestAnimationFrame",
    (callback: FrameRequestCallback): number => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    },
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    frames.delete(id);
  });
});

afterEach(() => {
  for (const instance of instances.splice(0)) instance.destroy();
  vi.unstubAllGlobals();
});

describe("MagneticMotion", () => {
  it("mounts every default target through one constructor", () => {
    const first = makeTarget();
    const second = makeTarget();
    const magnetic = new MagneticMotion({ spring: false });
    instances.push(magnetic);

    expect(magnetic.elements).toEqual([first, second]);
    expect(magnetic.active).toBe(true);
    expect(first.hasAttribute("data-magnetic-mounted")).toBe(true);
    expect(second.hasAttribute("data-magnetic-mounted")).toBe(true);
    expect(first.style.willChange).toContain("translate");
    expect(first.style.getPropertyValue("--magnetic-x")).toBe("0.000px");
    expect(magneticMotionDefaults.mode).toBe("pull");
    expect(magneticMotionDefaults.radius).toBe(100);
    expect(magneticMotionFeelPresets.elastic.damping).toBe(12);
  });

  it("is safe on pages without matching elements", () => {
    const magnetic = new MagneticMotion();
    instances.push(magnetic);

    expect(magnetic.elements).toEqual([]);
    expect(magnetic.active).toBe(true);
    expect(() => magnetic.reset()).not.toThrow();
  });

  it("pulls toward a pointer before it enters the element", () => {
    const target = makeTarget();
    const magnetic = new MagneticMotion(target, {
      spring: false,
      radius: 100,
      max: 20,
      falloff: "smooth",
    });
    instances.push(magnetic);

    movePointer(250, 50);

    expect(target.hasAttribute("data-magnetic-active")).toBe(true);
    expect(target.getAttribute("data-magnetic-pointer")).toBe("mouse");
    expect(target.style.getPropertyValue("--magnetic-influence")).toBe(
      "0.50000",
    );
    expect(target.style.getPropertyValue("--magnetic-x")).toBe("10.000px");
    expect(target.style.getPropertyValue("translate")).toBe(
      "10.000px 0.000px",
    );

    movePointer(301, 50);
    expect(target.hasAttribute("data-magnetic-active")).toBe(false);
    expect(target.style.getPropertyValue("translate")).toBe(
      "0.000px 0.000px",
    );
  });

  it("maps pointer position continuously while inside a pull target", () => {
    const target = makeTarget();
    const magnetic = new MagneticMotion(target, {
      spring: false,
      max: 20,
    });
    instances.push(magnetic);

    movePointer(200, 0);

    expect(target.style.getPropertyValue("--magnetic-x")).toBe("20.000px");
    expect(target.style.getPropertyValue("--magnetic-y")).toBe("-20.000px");
    expect(target.style.getPropertyValue("--magnetic-influence")).toBe(
      "1.00000",
    );
    expect(target.style.getPropertyValue("--magnetic-pointer-x")).toBe(
      "100.000%",
    );
  });

  it("uses the current position after an unrelated layout shift", () => {
    let box = rect(0, 100);
    const target = makeTarget("", box);
    target.setAttribute("data-magnetic", "parallax");
    vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => box);
    const magnetic = new MagneticMotion(target, { spring: false });
    instances.push(magnetic);

    movePointer(100, 150);
    expect(target.style.getPropertyValue("--magnetic-progress-y")).toBe(
      "0.00000",
    );

    // An asynchronously rendered widget above the target moves it down without
    // changing the target's dimensions, so its ResizeObserver would not fire.
    box = rect(0, 400);
    movePointer(100, 450);

    expect(target.style.getPropertyValue("--magnetic-progress-y")).toBe(
      "0.00000",
    );
  });

  it("runs parallax only inside its surface", () => {
    const target = makeTarget();
    target.setAttribute("data-magnetic", "parallax");
    const magnetic = new MagneticMotion(target, {
      spring: false,
      max: 16,
    });
    instances.push(magnetic);

    movePointer(250, 50);
    expect(target.style.getPropertyValue("translate")).toBe(
      "0.000px 0.000px",
    );

    movePointer(150, 25);
    expect(target.style.getPropertyValue("translate")).toBe(
      "8.000px -8.000px",
    );
  });

  it("supports axis limits, reverse motion, strength, scale, and rotation", () => {
    const target = makeTarget();
    target.setAttribute("data-magnetic", "parallax");
    target.setAttribute("data-magnetic-axis", "x");
    target.setAttribute("data-magnetic-reverse", "");
    target.setAttribute("data-magnetic-strength", "1.5");
    target.setAttribute("data-magnetic-scale", "1.04");
    target.setAttribute("data-magnetic-rotate", "4");
    const magnetic = new MagneticMotion(target, {
      spring: false,
      max: 20,
    });
    instances.push(magnetic);

    movePointer(200, 0);

    expect(target.style.getPropertyValue("translate")).toBe(
      "-30.000px 0.000px",
    );
    expect(target.style.getPropertyValue("rotate")).toBe("-4.000deg");
    expect(target.style.getPropertyValue("scale")).toBe("1.04000");
  });

  it("moves marked layers while keeping the host fixed", () => {
    const target = makeTarget(`
      <span data-magnetic-layer="-0.5" data-magnetic-layer-scale="0.94"></span>
      <strong data-magnetic-layer="1.25" data-magnetic-layer-scale="1.08"></strong>
    `);
    target.setAttribute("data-magnetic", "parallax");
    target.setAttribute("data-magnetic-target", "layers");
    const back = target.querySelector<HTMLElement>("span")!;
    const front = target.querySelector<HTMLElement>("strong")!;
    const magnetic = new MagneticMotion(target, {
      spring: false,
      max: 20,
    });
    instances.push(magnetic);

    movePointer(200, 50);

    expect(target.style.getPropertyValue("translate")).toBe("");
    expect(back.style.getPropertyValue("translate")).toBe(
      "-10.000px 0.000px",
    );
    expect(front.style.getPropertyValue("translate")).toBe(
      "25.000px 0.000px",
    );
    expect(back.style.getPropertyValue("scale")).toBe("0.94000");
    expect(front.style.getPropertyValue("scale")).toBe("1.08000");
    expect(front.style.getPropertyValue("--magnetic-layer")).toBe("1.25000");
  });

  it("falls back to the host scale for layers without an override", () => {
    const target = makeTarget(`
      <span data-magnetic-layer="0.5"></span>
      <strong data-magnetic-layer="1" data-magnetic-layer-scale="0.96"></strong>
    `);
    target.setAttribute("data-magnetic", "parallax");
    target.setAttribute("data-magnetic-target", "layers");
    target.setAttribute("data-magnetic-scale", "1.04");
    const inherited = target.querySelector<HTMLElement>("span")!;
    const overridden = target.querySelector<HTMLElement>("strong")!;
    const magnetic = new MagneticMotion(target, { spring: false });
    instances.push(magnetic);

    movePointer(200, 50);

    expect(inherited.style.getPropertyValue("scale")).toBe("1.04000");
    expect(overridden.style.getPropertyValue("scale")).toBe("0.96000");
  });

  it("composes host movement with additional layer movement in both mode", () => {
    const target = makeTarget(`
      <span data-magnetic-layer="-0.25" data-magnetic-layer-scale="0.96"></span>
      <strong data-magnetic-layer="0.75" data-magnetic-layer-scale="1.04"></strong>
    `);
    target.setAttribute("data-magnetic", "parallax");
    target.setAttribute("data-magnetic-target", "both");
    const back = target.querySelector<HTMLElement>("span")!;
    const front = target.querySelector<HTMLElement>("strong")!;
    const magnetic = new MagneticMotion(target, {
      spring: false,
      max: 20,
    });
    instances.push(magnetic);

    movePointer(200, 50);

    expect(target.style.getPropertyValue("translate")).toBe(
      "20.000px 0.000px",
    );
    expect(back.style.getPropertyValue("translate")).toBe(
      "-5.000px 0.000px",
    );
    expect(front.style.getPropertyValue("translate")).toBe(
      "15.000px 0.000px",
    );
    expect(back.style.getPropertyValue("scale")).toBe("0.96000");
    expect(front.style.getPropertyValue("scale")).toBe("1.04000");
  });

  it("treats an empty data-magnetic-target as an explicit self target", () => {
    const target = makeTarget(`<span data-magnetic-layer="1"></span>`);
    target.setAttribute("data-magnetic", "parallax");
    target.setAttribute("data-magnetic-target", "");
    const layer = target.querySelector<HTMLElement>("span")!;
    const magnetic = new MagneticMotion(target, {
      target: "layers",
      spring: false,
      max: 20,
    });
    instances.push(magnetic);

    movePointer(200, 50);

    expect(target.style.getPropertyValue("translate")).toBe(
      "20.000px 0.000px",
    );
    expect(layer.style.getPropertyValue("translate")).toBe("");
  });

  it("isolates layers owned by nested magnetic hosts", () => {
    const parent = makeTarget(`
      <span class="parent-layer" data-magnetic-layer="1"></span>
      <div class="nested" data-magnetic="parallax" data-magnetic-target="layers">
        <span class="nested-layer" data-magnetic-layer="2"></span>
      </div>
    `);
    parent.setAttribute("data-magnetic", "parallax");
    parent.setAttribute("data-magnetic-target", "layers");
    const nested = parent.querySelector<HTMLElement>(".nested")!;
    vi.spyOn(nested, "getBoundingClientRect").mockReturnValue(rect());
    const parentLayer =
      parent.querySelector<HTMLElement>(".parent-layer")!;
    const nestedLayer =
      parent.querySelector<HTMLElement>(".nested-layer")!;
    const magnetic = new MagneticMotion({ spring: false, max: 10 });
    instances.push(magnetic);

    movePointer(200, 50);

    expect(parentLayer.style.getPropertyValue("translate")).toBe(
      "10.000px 0.000px",
    );
    expect(nestedLayer.style.getPropertyValue("translate")).toBe(
      "20.000px 0.000px",
    );
  });

  it("uses declarative options over constructor defaults", () => {
    const target = makeTarget();
    target.setAttribute("data-magnetic-max", "8");
    target.setAttribute("data-magnetic-falloff", "linear");
    const magnetic = new MagneticMotion(target, {
      spring: false,
      max: 40,
      falloff: "exponential",
    });
    instances.push(magnetic);

    movePointer(250, 50);

    expect(target.style.getPropertyValue("--magnetic-x")).toBe("4.000px");
  });

  it("applies declarative spring feel presets", () => {
    const smooth = makeTarget();
    const snappy = makeTarget();
    smooth.setAttribute("data-magnetic-feel", "smooth");
    snappy.setAttribute("data-magnetic-feel", "snappy");
    const magnetic = new MagneticMotion({ max: 20 });
    instances.push(magnetic);

    movePointer(200, 50);
    flushFrames(1);

    const smoothX = Number.parseFloat(
      smooth.style.getPropertyValue("--magnetic-x"),
    );
    const snappyX = Number.parseFloat(
      snappy.style.getPropertyValue("--magnetic-x"),
    );
    expect(snappyX).toBeGreaterThan(smoothX);
  });

  it("animates with a spring and settles at rest", () => {
    const target = makeTarget();
    const magnetic = new MagneticMotion(target, { max: 20 });
    instances.push(magnetic);

    movePointer(200, 50);
    flushFrames(5);
    const during = Number.parseFloat(
      target.style.getPropertyValue("--magnetic-x"),
    );
    expect(during).toBeGreaterThan(0);
    expect(during).toBeLessThan(21);

    magnetic.reset();
    flushFrames();
    expect(target.style.getPropertyValue("--magnetic-x")).toBe("0.000px");
    expect(target.style.getPropertyValue("--magnetic-influence")).toBe(
      "0.00000",
    );
    expect(frames.size).toBe(0);
  });

  it("ignores touch by default while accepting pen", () => {
    const target = makeTarget();
    const magnetic = new MagneticMotion(target, { spring: false });
    instances.push(magnetic);

    movePointer(200, 50, "touch");
    expect(target.style.getPropertyValue("translate")).toBe(
      "0.000px 0.000px",
    );
    expect(target.getAttribute("data-magnetic-pointer")).toBeNull();

    movePointer(200, 50, "pen");
    expect(target.style.getPropertyValue("translate")).toBe(
      "20.000px 0.000px",
    );
    expect(target.getAttribute("data-magnetic-pointer")).toBe("pen");
  });

  it("supports disabled and instant reduced-motion behavior", () => {
    media("(prefers-reduced-motion: reduce)").setMatches(true);
    const disabledTarget = makeTarget();
    const disabled = new MagneticMotion(disabledTarget);
    instances.push(disabled);

    movePointer(200, 50);
    expect(disabled.disabled).toBe(true);
    expect(disabledTarget.style.getPropertyValue("translate")).toBe(
      "0.000px 0.000px",
    );

    const instantTarget = makeTarget();
    const instant = new MagneticMotion(instantTarget, {
      reducedMotionBehavior: "instant",
    });
    instances.push(instant);
    movePointer(200, 50);
    expect(instant.disabled).toBe(false);
    expect(instantTarget.style.getPropertyValue("translate")).toBe(
      "20.000px 0.000px",
    );
    expect(frames.size).toBe(0);
  });

  it("refreshes hosts, layers, and changed data attributes", () => {
    const first = makeTarget();
    const magnetic = new MagneticMotion({ spring: false });
    instances.push(magnetic);
    const second = makeTarget();
    first.setAttribute("data-magnetic-max", "7");

    magnetic.refresh();
    movePointer(200, 50);

    expect(magnetic.elements).toEqual([first, second]);
    expect(first.style.getPropertyValue("--magnetic-x")).toBe("7.000px");
    expect(second.style.getPropertyValue("--magnetic-x")).toBe("20.000px");
  });

  it("updates global options and preserves data overrides", () => {
    const first = makeTarget();
    first.setAttribute("data-magnetic-max", "6");
    const second = makeTarget();
    const magnetic = new MagneticMotion({ spring: false, max: 10 });
    instances.push(magnetic);

    magnetic.update({ max: 30, axis: "x" });
    movePointer(200, 0);

    expect(first.style.getPropertyValue("translate")).toBe(
      "6.000px 0.000px",
    );
    expect(second.style.getPropertyValue("translate")).toBe(
      "30.000px 0.000px",
    );
  });

  it("supports delayed start and idempotent lifecycle calls", () => {
    const target = makeTarget();
    const magnetic = new MagneticMotion(target, {
      autoStart: false,
      spring: false,
    });
    instances.push(magnetic);

    expect(magnetic.active).toBe(false);
    expect(target.hasAttribute("data-magnetic-mounted")).toBe(false);
    magnetic.start();
    magnetic.start();
    expect(magnetic.active).toBe(true);
    magnetic.stop();
    magnetic.stop();
    expect(magnetic.active).toBe(false);
    magnetic.start();
    expect(magnetic.active).toBe(true);
  });

  it("restores existing styles and state attributes on destroy", () => {
    const target = makeTarget(
      `<span data-magnetic-layer="1" style="translate: 2px 3px; rotate: 4deg; scale: 0.9; will-change: opacity"></span>`,
    );
    target.setAttribute("data-magnetic", "parallax");
    target.setAttribute("data-magnetic-target", "layers");
    target.setAttribute("data-magnetic-active", "original");
    const layer = target.querySelector<HTMLElement>("span")!;
    const magnetic = new MagneticMotion(target, { spring: false });

    movePointer(200, 50);
    magnetic.destroy();

    expect(target.hasAttribute("data-magnetic-mounted")).toBe(false);
    expect(target.getAttribute("data-magnetic-active")).toBe("original");
    expect(target.style.getPropertyValue("--magnetic-x")).toBe("");
    expect(layer.style.getPropertyValue("translate")).toBe("2px 3px");
    expect(layer.style.getPropertyValue("rotate")).toBe("4deg");
    expect(layer.style.getPropertyValue("scale")).toBe("0.9");
    expect(layer.style.willChange).toBe("opacity");
    expect(layer.style.getPropertyValue("--magnetic-layer")).toBe("");
  });

  it("does not change semantic or interactive markup", () => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-magnetic", "");
    button.textContent = "Action";
    document.body.appendChild(button);
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(rect());
    const click = vi.fn();
    button.addEventListener("click", click);
    const magnetic = new MagneticMotion(button, { spring: false });
    instances.push(magnetic);

    movePointer(200, 50);
    button.click();

    expect(click).toHaveBeenCalledOnce();
    expect(button.getAttribute("role")).toBeNull();
    expect(button.tabIndex).toBe(0);
    expect(button.parentElement).toBe(document.body);
  });

  it("rejects invalid targets, selectors, values, and post-destroy calls", () => {
    expect(() => new MagneticMotion("[")).toThrow(/Invalid/);
    expect(
      () => new MagneticMotion([document.createElement("div"), null] as never),
    ).toThrow(/HTMLElements/);
    const target = makeTarget();
    target.setAttribute("data-magnetic", "orbit");
    expect(() => new MagneticMotion(target)).toThrow(/mode/);
    target.setAttribute("data-magnetic", "");
    target.setAttribute("data-magnetic-radius", "far");
    expect(() => new MagneticMotion(target)).toThrow(
      /data-magnetic-radius/,
    );
    target.setAttribute("data-magnetic-radius", "10");
    expect(() => new MagneticMotion(target, { scale: -1 })).toThrow(/scale/);
    target.innerHTML =
      `<span data-magnetic-layer="1" data-magnetic-layer-scale="-0.1"></span>`;
    target.setAttribute("data-magnetic-target", "layers");
    expect(() => new MagneticMotion(target)).toThrow(
      /data-magnetic-layer-scale/,
    );

    const valid = makeTarget();
    const magnetic = new MagneticMotion(valid);
    magnetic.destroy();
    expect(() => magnetic.start()).toThrow(/destroyed/);
    expect(() => magnetic.update({ max: 10 })).toThrow(/destroyed/);
    expect(() => magnetic.refresh()).toThrow(/destroyed/);
  });
});
