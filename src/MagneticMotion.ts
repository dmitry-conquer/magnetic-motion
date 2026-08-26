/**
 * Magnetic pull, pointer parallax, and layered motion for static websites.
 *
 * @example
 * const magnetic = new MagneticMotion();
 */

export type MagneticMotionTarget =
  | HTMLElement
  | string
  | Iterable<HTMLElement>;
export type MagneticMotionMode = "pull" | "parallax";
export type MagneticMotionTargetMode = "self" | "layers" | "both";
export type MagneticMotionAxis = "both" | "x" | "y";
export type MagneticMotionFalloff = "linear" | "smooth" | "exponential";
export type MagneticMotionFeel = "smooth" | "snappy" | "elastic";
export type MagneticMotionReducedMotionBehavior = "disable" | "instant";

export interface MagneticMotionSpringOptions {
  /** Spring tension. Higher values reach the target faster. */
  stiffness?: number;
  /** Spring friction. Higher values reduce overshoot. */
  damping?: number;
  /** Virtual mass of each moving value. */
  mass?: number;
  /** Stop threshold for position and velocity. */
  precision?: number;
}

export interface MagneticMotionOptions {
  /** Default interaction mode. */
  mode?: MagneticMotionMode;
  /** Move the host, its data-magnetic-layer descendants, or both. */
  target?: MagneticMotionTargetMode;
  /** Maximum translation in CSS pixels. */
  max?: number;
  /** External activation radius for pull mode in CSS pixels. */
  radius?: number;
  /** Translation intensity multiplier. */
  strength?: number;
  /** Limit translation to one axis. */
  axis?: MagneticMotionAxis;
  /** Invert pointer direction. */
  reverse?: boolean;
  /** Proximity attenuation used outside pull targets. */
  falloff?: MagneticMotionFalloff;
  /** Named spring preset. */
  feel?: MagneticMotionFeel;
  /** Scale reached at full influence. */
  scale?: number;
  /** Maximum pointer-driven rotation in degrees. */
  rotate?: number;
  /** Spring motion. Use false for immediate updates. */
  spring?: boolean | MagneticMotionSpringOptions;
  /** Ignore touch pointers. */
  disableOnTouch?: boolean;
  /** Respond to prefers-reduced-motion. */
  respectReducedMotion?: boolean;
  /** Disable interaction or render it immediately for reduced motion. */
  reducedMotionBehavior?: MagneticMotionReducedMotionBehavior;
  /** Start immediately after construction. */
  autoStart?: boolean;
}

export type MagneticMotionUpdateOptions = Omit<
  MagneticMotionOptions,
  "autoStart"
>;

type Resolved<T> = { [Key in keyof T]-?: T[Key] };
type ResolvedSpring = false | Resolved<MagneticMotionSpringOptions>;

export interface MagneticMotionDefaults {
  readonly mode: MagneticMotionMode;
  readonly target: MagneticMotionTargetMode;
  readonly max: number;
  readonly radius: number;
  readonly strength: number;
  readonly axis: MagneticMotionAxis;
  readonly reverse: boolean;
  readonly falloff: MagneticMotionFalloff;
  readonly feel: MagneticMotionFeel;
  readonly scale: number;
  readonly rotate: number;
  readonly spring: Readonly<Resolved<MagneticMotionSpringOptions>>;
  readonly disableOnTouch: boolean;
  readonly respectReducedMotion: boolean;
  readonly reducedMotionBehavior: MagneticMotionReducedMotionBehavior;
  readonly autoStart: boolean;
}

export const magneticMotionFeelPresets: Readonly<
  Record<MagneticMotionFeel, Readonly<Resolved<MagneticMotionSpringOptions>>>
> = Object.freeze({
  smooth: Object.freeze({
    stiffness: 160,
    damping: 20,
    mass: 1,
    precision: 0.001,
  }),
  snappy: Object.freeze({
    stiffness: 260,
    damping: 26,
    mass: 0.9,
    precision: 0.001,
  }),
  elastic: Object.freeze({
    stiffness: 190,
    damping: 12,
    mass: 1,
    precision: 0.001,
  }),
});

export const magneticMotionDefaults: MagneticMotionDefaults = Object.freeze({
  mode: "pull",
  target: "self",
  max: 20,
  radius: 100,
  strength: 1,
  axis: "both",
  reverse: false,
  falloff: "smooth",
  feel: "smooth",
  scale: 1,
  rotate: 0,
  spring: magneticMotionFeelPresets.smooth,
  disableOnTouch: true,
  respectReducedMotion: true,
  reducedMotionBehavior: "disable",
  autoStart: true,
});

interface NormalizedOptions
  extends Omit<MagneticMotionDefaults, "spring"> {
  spring: ResolvedSpring;
}

interface MotionValue {
  current: number;
  target: number;
  velocity: number;
}

interface SavedActorStyles {
  translate: string;
  rotate: string;
  scale: string;
  willChange: string;
}

interface Actor {
  element: HTMLElement;
  multiplier: number;
  scale: number;
  saved: SavedActorStyles;
}

interface MagneticItem {
  element: HTMLElement;
  options: NormalizedOptions;
  actors: Actor[];
  x: MotionValue;
  y: MotionValue;
  influence: MotionValue;
  active: boolean;
  mountedAttribute: string | null;
  activeAttribute: string | null;
  pointerAttribute: string | null;
}

const DEFAULT_SELECTOR = "[data-magnetic]";
const LAYER_SELECTOR = "[data-magnetic-layer]";
const MOUNTED_ATTRIBUTE = "data-magnetic-mounted";
const ACTIVE_ATTRIBUTE = "data-magnetic-active";
const POINTER_ATTRIBUTE = "data-magnetic-pointer";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const CSS_PROPERTIES = [
  "--magnetic-x",
  "--magnetic-y",
  "--magnetic-progress-x",
  "--magnetic-progress-y",
  "--magnetic-influence",
  "--magnetic-pointer-x",
  "--magnetic-pointer-y",
] as const;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const isElement = (value: unknown): value is HTMLElement =>
  typeof HTMLElement !== "undefined" && value instanceof HTMLElement;

const isTarget = (value: unknown): value is MagneticMotionTarget => {
  if (typeof value === "string" || isElement(value)) return true;
  return Boolean(
    value &&
      typeof value === "object" &&
      Symbol.iterator in value &&
      typeof (value as Iterable<unknown>)[Symbol.iterator] === "function",
  );
};

const movement = (): MotionValue => ({
  current: 0,
  target: 0,
  velocity: 0,
});

const appendWillChange = (current: string): string => {
  const values = current
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  for (const property of ["translate", "rotate", "scale"]) {
    if (!values.includes(property)) values.push(property);
  }
  return values.join(", ");
};

/**
 * Controls every matching magnetic surface through one pointer listener and
 * one demand-driven animation frame loop.
 */
export default class MagneticMotion {
  private readonly document: Document;
  private readonly window: Window;
  private readonly source: MagneticMotionTarget;
  private options: NormalizedOptions;
  private items: MagneticItem[] = [];
  private frame = 0;
  private lastFrameTime = 0;
  private runningState = false;
  private destroyedState = false;
  private reducedMotionQuery: MediaQueryList | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private pointerX = 0;
  private pointerY = 0;
  private pointerType = "mouse";
  private hasPointer = false;

  constructor();
  constructor(options: MagneticMotionOptions);
  constructor(
    target: MagneticMotionTarget,
    options?: MagneticMotionOptions,
  );
  constructor(
    targetOrOptions: MagneticMotionTarget | MagneticMotionOptions = DEFAULT_SELECTOR,
    options: MagneticMotionOptions = {},
  ) {
    this.document = document;
    this.window = window;

    if (isTarget(targetOrOptions)) {
      this.source = targetOrOptions;
      this.options = this.normalize(options);
    } else {
      this.source = DEFAULT_SELECTOR;
      this.options = this.normalize(targetOrOptions);
    }

    this.items = this.collectItems();
    if (this.options.autoStart) this.start();
  }

  /** Every host controlled by this instance. */
  get elements(): readonly HTMLElement[] {
    return this.items.map(item => item.element);
  }

  /** Whether the shared listeners and effects are mounted. */
  get active(): boolean {
    return this.runningState;
  }

  /** Whether reduced motion currently disables interaction. */
  get disabled(): boolean {
    return this.motionDisabled;
  }

  /** Whether this instance has been permanently destroyed. */
  get destroyed(): boolean {
    return this.destroyedState;
  }

  /** Mounts listeners and all matching targets. Safe to call repeatedly. */
  start(): void {
    if (this.destroyedState) {
      throw new Error("Cannot start a destroyed MagneticMotion instance.");
    }
    if (this.runningState) return;

    this.runningState = true;
    this.reducedMotionQuery =
      this.window.matchMedia?.(REDUCED_MOTION_QUERY) ?? null;
    this.reducedMotionQuery?.addEventListener(
      "change",
      this.handleMotionPreference,
    );
    this.document.addEventListener("pointermove", this.handlePointerMove, {
      passive: true,
    });
    this.window.addEventListener("pointerout", this.handlePointerOut, {
      passive: true,
    });
    this.window.addEventListener("blur", this.handlePointerExit);
    this.window.addEventListener("resize", this.handleResize, { passive: true });
    this.window.addEventListener("scroll", this.handleScroll, {
      passive: true,
      capture: true,
    });
    this.mountItems();
  }

  /** Removes listeners and restores every style changed by the instance. */
  stop(): void {
    if (!this.runningState) return;

    this.runningState = false;
    this.cancelFrame();
    this.document.removeEventListener("pointermove", this.handlePointerMove);
    this.window.removeEventListener("pointerout", this.handlePointerOut);
    this.window.removeEventListener("blur", this.handlePointerExit);
    this.window.removeEventListener("resize", this.handleResize);
    this.window.removeEventListener("scroll", this.handleScroll, true);
    this.reducedMotionQuery?.removeEventListener(
      "change",
      this.handleMotionPreference,
    );
    this.reducedMotionQuery = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.hasPointer = false;
    this.unmountItems();
  }

  /** Updates global defaults while preserving per-element data overrides. */
  update(update: MagneticMotionUpdateOptions): void {
    if (this.destroyedState) {
      throw new Error("Cannot update a destroyed MagneticMotion instance.");
    }
    const wasRunning = this.runningState;
    if (wasRunning) this.stop();
    const next = { ...this.options, ...update };
    if (update.feel !== undefined && update.spring === undefined) {
      next.spring = magneticMotionFeelPresets[update.feel];
    }
    this.options = this.normalize(next, this.options);
    this.items = this.collectItems();
    if (wasRunning) this.start();
  }

  /** Rediscovers hosts, layers, and declarative settings. */
  refresh(): void {
    if (this.destroyedState) {
      throw new Error("Cannot refresh a destroyed MagneticMotion instance.");
    }
    const wasRunning = this.runningState;
    if (wasRunning) this.stop();
    this.items = this.collectItems();
    if (wasRunning) this.start();
  }

  /** Returns every actor to rest. */
  reset(immediate = false): void {
    this.hasPointer = false;
    for (const item of this.items) this.deactivate(item);

    if (immediate) {
      this.snapAll();
      this.renderAll();
    } else {
      this.snapInstantItems();
      this.renderAll();
      if (this.items.some(item => !this.isSettled(item))) {
        this.requestFrame();
      }
    }
  }

  /** Permanently removes all listeners and inline changes. */
  destroy(): void {
    if (this.destroyedState) return;
    this.stop();
    this.destroyedState = true;
  }

  private get motionDisabled(): boolean {
    return Boolean(
      this.options.respectReducedMotion &&
        this.options.reducedMotionBehavior === "disable" &&
        this.reducedMotionQuery?.matches,
    );
  }

  private get reducedMotionIsInstant(): boolean {
    return Boolean(
      this.options.respectReducedMotion &&
        this.options.reducedMotionBehavior === "instant" &&
        this.reducedMotionQuery?.matches,
    );
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.runningState || this.motionDisabled) return;
    if (this.options.disableOnTouch && event.pointerType === "touch") return;

    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.pointerType = event.pointerType || "mouse";
    this.hasPointer = true;
    for (const item of this.items) {
      if (item.options.disableOnTouch && event.pointerType === "touch") continue;
      this.updateItemTarget(item, this.pointerType);
    }

    this.snapInstantItems();
    this.renderAll();
    if (this.items.some(item => !this.isSettled(item))) {
      this.requestFrame();
    }
  };

  private readonly handlePointerOut = (event: PointerEvent): void => {
    if (event.relatedTarget !== null) return;
    this.handlePointerExit();
  };

  private readonly handlePointerExit = (): void => {
    this.reset();
  };

  private readonly handleMotionPreference = (): void => {
    if (this.motionDisabled) {
      this.reset(true);
      return;
    }
    if (this.hasPointer) {
      for (const item of this.items) {
        this.updateItemTarget(item, this.pointerType);
      }
    }
  };

  private readonly handleResize = (): void => {
    if (this.hasPointer) {
      for (const item of this.items) {
        this.updateItemTarget(item, this.pointerType);
      }
    }
  };

  private readonly handleScroll = (): void => {
    if (this.hasPointer) {
      for (const item of this.items) {
        this.updateItemTarget(item, this.pointerType);
      }
    }
  };

  private readonly animate = (time: number): void => {
    this.frame = 0;
    if (!this.runningState) return;

    const elapsed = this.lastFrameTime
      ? (time - this.lastFrameTime) / 1000
      : 1 / 60;
    const delta = clamp(elapsed, 1 / 240, 1 / 30);
    this.lastFrameTime = time;

    for (const item of this.items) this.stepItem(item, delta);
    this.renderAll();

    if (this.items.some(item => !this.isSettled(item))) {
      this.frame = this.window.requestAnimationFrame(this.animate);
    } else {
      this.snapAll();
      this.renderAll();
      this.lastFrameTime = 0;
    }
  };

  private collectItems(): MagneticItem[] {
    return this.resolveElements().map(element => {
      const itemOptions = this.readDeclarativeOptions(element);
      return {
        element,
        options: itemOptions,
        actors: [],
        x: movement(),
        y: movement(),
        influence: movement(),
        active: false,
        mountedAttribute: element.getAttribute(MOUNTED_ATTRIBUTE),
        activeAttribute: element.getAttribute(ACTIVE_ATTRIBUTE),
        pointerAttribute: element.getAttribute(POINTER_ATTRIBUTE),
      };
    });
  }

  private resolveElements(): HTMLElement[] {
    let values: Iterable<HTMLElement>;
    if (typeof this.source === "string") {
      try {
        values = this.document.querySelectorAll<HTMLElement>(this.source);
      } catch {
        throw new TypeError(`Invalid MagneticMotion selector: ${this.source}`);
      }
    } else if (isElement(this.source)) {
      values = [this.source];
    } else {
      values = this.source;
    }

    const unique = new Set<HTMLElement>();
    for (const element of values) {
      if (!isElement(element)) {
        throw new TypeError("MagneticMotion targets must be HTMLElements.");
      }
      unique.add(element);
    }
    return [...unique];
  }

  private mountItems(): void {
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(entries => {
        const changed = new Set(entries.map(entry => entry.target));
        for (const item of this.items) {
          if (!changed.has(item.element)) continue;
          if (this.hasPointer) {
            this.updateItemTarget(item, this.pointerType);
          }
        }
        this.snapInstantItems();
        this.renderAll();
        if (this.items.some(item => !this.isSettled(item))) {
          this.requestFrame();
        }
      });
    }

    for (const item of this.items) {
      item.actors = this.collectActors(item);
      item.element.setAttribute(MOUNTED_ATTRIBUTE, "");
      item.element.removeAttribute(ACTIVE_ATTRIBUTE);
      item.element.removeAttribute(POINTER_ATTRIBUTE);
      this.resizeObserver?.observe(item.element);
      this.applyActorBaseStyles(item);
      this.renderItem(item);
    }

    if (this.motionDisabled) this.reset(true);
  }

  private unmountItems(): void {
    for (const item of this.items) {
      this.restoreActors(item);
      for (const property of CSS_PROPERTIES) {
        item.element.style.removeProperty(property);
      }
      this.restoreAttribute(
        item.element,
        MOUNTED_ATTRIBUTE,
        item.mountedAttribute,
      );
      this.restoreAttribute(
        item.element,
        ACTIVE_ATTRIBUTE,
        item.activeAttribute,
      );
      this.restoreAttribute(
        item.element,
        POINTER_ATTRIBUTE,
        item.pointerAttribute,
      );
      item.active = false;
      for (const value of [item.x, item.y, item.influence]) {
        value.current = 0;
        value.target = 0;
        value.velocity = 0;
      }
    }
  }

  private collectActors(item: MagneticItem): Actor[] {
    const layers = [
      ...item.element.querySelectorAll<HTMLElement>(LAYER_SELECTOR),
    ].filter(
      element => element.closest(DEFAULT_SELECTOR) === item.element,
    );
    const elements =
      item.options.target === "self"
        ? [item.element]
        : item.options.target === "layers"
          ? layers
          : [item.element, ...layers];

    return elements.map(element => ({
      element,
      multiplier:
        element === item.element
          ? 1
          : this.readFiniteAttribute(
              element,
              "data-magnetic-layer",
              1,
            ),
      scale:
        element === item.element ||
        !element.hasAttribute("data-magnetic-layer-scale")
          ? item.options.scale
          : this.readFiniteAttribute(
              element,
              "data-magnetic-layer-scale",
              item.options.scale,
              0,
            ),
      saved: {
        translate: element.style.getPropertyValue("translate"),
        rotate: element.style.getPropertyValue("rotate"),
        scale: element.style.getPropertyValue("scale"),
        willChange: element.style.willChange,
      },
    }));
  }

  private applyActorBaseStyles(item: MagneticItem): void {
    for (const actor of item.actors) {
      actor.element.style.willChange = appendWillChange(actor.saved.willChange);
    }
  }

  private restoreActors(item: MagneticItem): void {
    for (const actor of item.actors) {
      this.restoreStyleProperty(
        actor.element,
        "translate",
        actor.saved.translate,
      );
      this.restoreStyleProperty(actor.element, "rotate", actor.saved.rotate);
      this.restoreStyleProperty(actor.element, "scale", actor.saved.scale);
      actor.element.style.willChange = actor.saved.willChange;
      actor.element.style.removeProperty("--magnetic-layer");
    }
    item.actors = [];
  }

  private updateItemTarget(item: MagneticItem, pointerType: string): void {
    // A target can move when unrelated asynchronous content changes the layout
    // above it, without changing the target's own dimensions. Always measure
    // immediately before calculating the interaction field.
    const rect = item.element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      this.deactivate(item);
      return;
    }

    const inside =
      this.pointerX >= rect.left &&
      this.pointerX <= rect.right &&
      this.pointerY >= rect.top &&
      this.pointerY <= rect.bottom;

    let x = 0;
    let y = 0;
    let influence = 0;

    if (item.options.mode === "parallax") {
      if (inside) {
        x = clamp(
          ((this.pointerX - rect.left) / rect.width) * 2 - 1,
          -1,
          1,
        );
        y = clamp(
          ((this.pointerY - rect.top) / rect.height) * 2 - 1,
          -1,
          1,
        );
        influence = 1;
      }
    } else if (inside) {
      x = clamp(
        (this.pointerX - (rect.left + rect.width / 2)) /
          Math.max(rect.width / 2, 1),
        -1,
        1,
      );
      y = clamp(
        (this.pointerY - (rect.top + rect.height / 2)) /
          Math.max(rect.height / 2, 1),
        -1,
        1,
      );
      influence = 1;
    } else {
      const nearestX = clamp(this.pointerX, rect.left, rect.right);
      const nearestY = clamp(this.pointerY, rect.top, rect.bottom);
      const edgeX = this.pointerX - nearestX;
      const edgeY = this.pointerY - nearestY;
      const distance = Math.hypot(edgeX, edgeY);

      if (distance <= item.options.radius) {
        influence = this.applyFalloff(
          1 - distance / Math.max(item.options.radius, 0.001),
          item.options.falloff,
        );
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const centerDistance = Math.hypot(
          this.pointerX - centerX,
          this.pointerY - centerY,
        );
        if (centerDistance > 0) {
          x = ((this.pointerX - centerX) / centerDistance) * influence;
          y = ((this.pointerY - centerY) / centerDistance) * influence;
        }
      }
    }

    const direction = item.options.reverse ? -1 : 1;
    item.x.target =
      item.options.axis === "y" ? 0 : x * direction;
    item.y.target =
      item.options.axis === "x" ? 0 : y * direction;
    item.influence.target = influence;
    this.setInteractionState(item, influence > 0, pointerType);
  }

  private deactivate(item: MagneticItem): void {
    item.x.target = 0;
    item.y.target = 0;
    item.influence.target = 0;
    this.setInteractionState(item, false, "");
  }

  private setInteractionState(
    item: MagneticItem,
    active: boolean,
    pointerType: string,
  ): void {
    item.active = active;
    if (active) {
      item.element.setAttribute(ACTIVE_ATTRIBUTE, "");
      item.element.setAttribute(POINTER_ATTRIBUTE, pointerType);
    } else {
      item.element.removeAttribute(ACTIVE_ATTRIBUTE);
      item.element.removeAttribute(POINTER_ATTRIBUTE);
    }
  }

  private applyFalloff(
    value: number,
    falloff: MagneticMotionFalloff,
  ): number {
    const progress = clamp(value, 0, 1);
    if (falloff === "linear") return progress;
    if (falloff === "exponential") return progress * progress * progress;
    return progress * progress * (3 - 2 * progress);
  }

  private stepItem(item: MagneticItem, delta: number): void {
    const spring = item.options.spring;
    if (spring === false || this.reducedMotionIsInstant) {
      this.snapItem(item);
      return;
    }
    for (const value of [item.x, item.y, item.influence]) {
      const { stiffness, damping, mass } = spring;
      const acceleration = ((value.target - value.current) * stiffness) / mass;
      value.velocity += acceleration * delta;
      value.velocity *= Math.exp((-damping / mass) * delta);
      value.current += value.velocity * delta;
    }
  }

  private isSettled(item: MagneticItem): boolean {
    const precision =
      item.options.spring === false ? 0 : item.options.spring.precision;
    return [item.x, item.y, item.influence].every(
      value =>
        Math.abs(value.target - value.current) <= precision &&
        Math.abs(value.velocity) <= precision,
    );
  }

  private snapItem(item: MagneticItem): void {
    for (const value of [item.x, item.y, item.influence]) {
      value.current = value.target;
      value.velocity = 0;
    }
  }

  private snapAll(): void {
    for (const item of this.items) this.snapItem(item);
  }

  private snapInstantItems(): void {
    for (const item of this.items) {
      if (this.itemIsInstant(item)) this.snapItem(item);
    }
  }

  private itemIsInstant(item: MagneticItem): boolean {
    return item.options.spring === false || this.reducedMotionIsInstant;
  }

  private renderAll(): void {
    for (const item of this.items) this.renderItem(item);
  }

  private renderItem(item: MagneticItem): void {
    const x =
      item.x.current * item.options.max * item.options.strength;
    const y =
      item.y.current * item.options.max * item.options.strength;
    const influence = clamp(item.influence.current, 0, 1);
    const pointerX = clamp((item.x.current + 1) * 50, 0, 100);
    const pointerY = clamp((item.y.current + 1) * 50, 0, 100);

    item.element.style.setProperty("--magnetic-x", `${x.toFixed(3)}px`);
    item.element.style.setProperty("--magnetic-y", `${y.toFixed(3)}px`);
    item.element.style.setProperty(
      "--magnetic-progress-x",
      item.x.current.toFixed(5),
    );
    item.element.style.setProperty(
      "--magnetic-progress-y",
      item.y.current.toFixed(5),
    );
    item.element.style.setProperty(
      "--magnetic-influence",
      influence.toFixed(5),
    );
    item.element.style.setProperty(
      "--magnetic-pointer-x",
      `${pointerX.toFixed(3)}%`,
    );
    item.element.style.setProperty(
      "--magnetic-pointer-y",
      `${pointerY.toFixed(3)}%`,
    );

    for (const actor of item.actors) {
      const actorX = x * actor.multiplier;
      const actorY = y * actor.multiplier;
      const actorRotate =
        item.x.current *
        item.options.rotate *
        actor.multiplier *
        influence;
      const actorScale =
        1 + (actor.scale - 1) * influence;
      actor.element.style.setProperty(
        "translate",
        `${actorX.toFixed(3)}px ${actorY.toFixed(3)}px`,
      );
      actor.element.style.setProperty(
        "rotate",
        `${actorRotate.toFixed(3)}deg`,
      );
      actor.element.style.setProperty("scale", actorScale.toFixed(5));
      actor.element.style.setProperty(
        "--magnetic-layer",
        actor.multiplier.toFixed(5),
      );
    }
  }

  private requestFrame(): void {
    if (!this.runningState || this.frame) return;
    this.frame = this.window.requestAnimationFrame(this.animate);
  }

  private cancelFrame(): void {
    if (this.frame) this.window.cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastFrameTime = 0;
  }

  private readDeclarativeOptions(element: HTMLElement): NormalizedOptions {
    const update: MagneticMotionOptions = {};
    const mode = element.getAttribute("data-magnetic");
    if (mode?.trim()) update.mode = mode.trim() as MagneticMotionMode;

    if (element.hasAttribute("data-magnetic-target")) {
      const target = element
        .getAttribute("data-magnetic-target")
        ?.trim();
      update.target = (target || "self") as MagneticMotionTargetMode;
    }

    const textAttributes: Array<
      [
        keyof Pick<
          MagneticMotionOptions,
          "axis" | "falloff" | "feel"
        >,
        string,
      ]
    > = [
      ["axis", "data-magnetic-axis"],
      ["falloff", "data-magnetic-falloff"],
      ["feel", "data-magnetic-feel"],
    ];
    for (const [key, attribute] of textAttributes) {
      const value = element.getAttribute(attribute);
      if (value !== null && value.trim()) {
        (update as Record<string, unknown>)[key] = value.trim();
      }
    }

    const numericAttributes: Array<
      [
        keyof Pick<
          MagneticMotionOptions,
          "max" | "radius" | "strength" | "scale" | "rotate"
        >,
        string,
      ]
    > = [
      ["max", "data-magnetic-max"],
      ["radius", "data-magnetic-radius"],
      ["strength", "data-magnetic-strength"],
      ["scale", "data-magnetic-scale"],
      ["rotate", "data-magnetic-rotate"],
    ];
    for (const [key, attribute] of numericAttributes) {
      if (element.hasAttribute(attribute)) {
        (update as Record<string, unknown>)[key] =
          this.readFiniteAttribute(element, attribute, 0);
      }
    }

    if (element.hasAttribute("data-magnetic-reverse")) {
      update.reverse = true;
    }

    if (update.feel) {
      update.spring = magneticMotionFeelPresets[update.feel];
    }
    return this.normalize({ ...this.options, ...update }, this.options);
  }

  private readFiniteAttribute(
    element: HTMLElement,
    attribute: string,
    fallback: number,
    minimum?: number,
  ): number {
    const raw = element.getAttribute(attribute);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new TypeError(`${attribute} must be a finite number.`);
    }
    if (minimum !== undefined && value < minimum) {
      throw new TypeError(`${attribute} must be at least ${minimum}.`);
    }
    return value;
  }

  private normalize(
    options: MagneticMotionOptions,
    fallback: NormalizedOptions | MagneticMotionDefaults =
      magneticMotionDefaults,
  ): NormalizedOptions {
    const mode = options.mode ?? fallback.mode;
    const target = options.target ?? fallback.target;
    const axis = options.axis ?? fallback.axis;
    const falloff = options.falloff ?? fallback.falloff;
    const feel = options.feel ?? fallback.feel;

    this.assertOneOf("mode", mode, ["pull", "parallax"]);
    this.assertOneOf("target", target, ["self", "layers", "both"]);
    this.assertOneOf("axis", axis, ["both", "x", "y"]);
    this.assertOneOf("falloff", falloff, [
      "linear",
      "smooth",
      "exponential",
    ]);
    this.assertOneOf("feel", feel, ["smooth", "snappy", "elastic"]);

    const max = this.finiteOption("max", options.max ?? fallback.max, 0);
    const radius = this.finiteOption(
      "radius",
      options.radius ?? fallback.radius,
      0,
    );
    const strength = this.finiteOption(
      "strength",
      options.strength ?? fallback.strength,
      0,
    );
    const scale = this.finiteOption(
      "scale",
      options.scale ?? fallback.scale,
      0,
    );
    const rotate = this.finiteOption(
      "rotate",
      options.rotate ?? fallback.rotate,
      0,
      false,
    );

    let spring: ResolvedSpring;
    if (options.spring === false) {
      spring = false;
    } else {
      const preset = magneticMotionFeelPresets[feel];
      const previous =
        options.spring === undefined && options.feel !== undefined
          ? preset
          : fallback.spring === false
            ? preset
            : fallback.spring;
      const input =
        options.spring === true || options.spring === undefined
          ? {}
          : options.spring;
      spring = {
        stiffness: this.finiteOption(
          "spring.stiffness",
          input.stiffness ?? previous.stiffness,
          0.001,
        ),
        damping: this.finiteOption(
          "spring.damping",
          input.damping ?? previous.damping,
          0,
        ),
        mass: this.finiteOption(
          "spring.mass",
          input.mass ?? previous.mass,
          0.001,
        ),
        precision: this.finiteOption(
          "spring.precision",
          input.precision ?? previous.precision,
          0.000001,
        ),
      };
    }

    const reducedMotionBehavior =
      options.reducedMotionBehavior ?? fallback.reducedMotionBehavior;
    this.assertOneOf(
      "reducedMotionBehavior",
      reducedMotionBehavior,
      ["disable", "instant"],
    );

    return {
      mode,
      target,
      max,
      radius,
      strength,
      axis,
      reverse: options.reverse ?? fallback.reverse,
      falloff,
      feel,
      scale,
      rotate,
      spring,
      disableOnTouch:
        options.disableOnTouch ?? fallback.disableOnTouch,
      respectReducedMotion:
        options.respectReducedMotion ?? fallback.respectReducedMotion,
      reducedMotionBehavior,
      autoStart: options.autoStart ?? fallback.autoStart,
    };
  }

  private finiteOption(
    name: string,
    value: number,
    minimum: number,
    enforceMinimum = true,
  ): number {
    if (
      !Number.isFinite(value) ||
      (enforceMinimum && value < minimum)
    ) {
      throw new TypeError(
        `${name} must be ${enforceMinimum ? `at least ${minimum}` : "finite"}.`,
      );
    }
    return value;
  }

  private assertOneOf<T extends string>(
    name: string,
    value: string,
    allowed: readonly T[],
  ): asserts value is T {
    if (!(allowed as readonly string[]).includes(value)) {
      throw new TypeError(`${name} must be one of: ${allowed.join(", ")}.`);
    }
  }

  private restoreStyleProperty(
    element: HTMLElement,
    property: string,
    value: string,
  ): void {
    if (value) {
      element.style.setProperty(property, value);
    } else {
      element.style.removeProperty(property);
    }
  }

  private restoreAttribute(
    element: HTMLElement,
    attribute: string,
    value: string | null,
  ): void {
    if (value === null) {
      element.removeAttribute(attribute);
    } else {
      element.setAttribute(attribute, value);
    }
  }
}
