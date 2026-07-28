# magnetic-motion

Lightweight magnetic pull, pointer parallax, and layered motion for static
websites.

- One constructor for every effect on the page
- HTML data attributes for per-element control
- Spring-powered motion with three practical feel presets
- No stylesheet import
- No production dependencies
- ESM, CommonJS, and TypeScript declarations

## Install

```bash
npm install magnetic-motion
```

```bash
pnpm add magnetic-motion
```

## Quick start

Mark an element and initialize the page once:

```html
<a href="/work" data-magnetic>Explore projects</a>
```

```js
import MagneticMotion from "magnetic-motion";

const magnetic = new MagneticMotion();
```

`new MagneticMotion()` discovers every `[data-magnetic]` element. It is safe
to use on pages without matching elements.

## Magnetic pull

Pull mode starts before the pointer reaches the element:

```html
<button
  data-magnetic="pull"
  data-magnetic-radius="120"
  data-magnetic-max="24"
  data-magnetic-feel="snappy"
>
  Start a project
</button>
```

An empty `data-magnetic` attribute also means `pull`.

## Pointer parallax

Parallax responds while the pointer is inside the surface:

```html
<article
  data-magnetic="parallax"
  data-magnetic-max="14"
  data-magnetic-reverse
>
  Project preview
</article>
```

## Layered surfaces

Keep the host fixed and move selected descendants:

```html
<section
  data-magnetic="parallax"
  data-magnetic-target="layers"
  data-magnetic-max="20"
>
  <div class="glow" data-magnetic-layer="-0.5"></div>
  <p data-magnetic-layer="0.35">Independent studio</p>
  <h1 data-magnetic-layer="1" data-magnetic-layer-scale="1.04">
    Interfaces with depth
  </h1>
  <a
    href="/work"
    data-magnetic-layer="1.3"
    data-magnetic-layer-scale="1.07"
  >
    Explore
  </a>
</section>
```

Positive layer values follow the configured direction. Negative values move
in the opposite direction. The number multiplies the host's maximum movement.
`data-magnetic-layer-scale` sets the scale reached by that layer at full
influence. Values above `1` bring it forward; values below `1` push it back.
Layers without this attribute use the host's `data-magnetic-scale`.

Nested magnetic hosts are isolated: a parent's layer mode does not collect
layers belonging to another `[data-magnetic]` surface.

## Host and layers together

Use `both` when the surface should move as a whole while its descendants add
independent relative motion:

```html
<article
  data-magnetic="parallax"
  data-magnetic-target="both"
  data-magnetic-max="14"
>
  <div
    data-magnetic-layer="-0.3"
    data-magnetic-layer-scale="0.96"
  ></div>
  <h2
    data-magnetic-layer="0.7"
    data-magnetic-layer-scale="1.04"
  >
    Layered project
  </h2>
</article>
```

The host receives the base movement. Layer transforms are added on top through
normal CSS transform inheritance, producing a stronger sense of depth.

## Data attributes

| Attribute | Purpose |
| --- | --- |
| `data-magnetic` | Enables pull mode |
| `data-magnetic="pull"` | Pulls toward a pointer inside the configured radius |
| `data-magnetic="parallax"` | Moves from the pointer position inside the surface |
| `data-magnetic-target` | Moves the host; shorthand for `self` |
| `data-magnetic-target="self"` | Moves the host explicitly |
| `data-magnetic-target="layers"` | Moves marked descendants and keeps the host fixed |
| `data-magnetic-target="both"` | Moves the host and adds relative movement to marked descendants |
| `data-magnetic-layer="0.5"` | Sets a layer direction and strength multiplier |
| `data-magnetic-layer-scale="1.04"` | Sets an individual layer's scale at full influence |
| `data-magnetic-radius="100"` | Sets pull activation radius in CSS pixels |
| `data-magnetic-max="20"` | Sets maximum translation in CSS pixels |
| `data-magnetic-strength="1"` | Multiplies translation intensity |
| `data-magnetic-axis="x"` | Restricts movement to `x`, `y`, or `both` |
| `data-magnetic-reverse` | Inverts the configured direction |
| `data-magnetic-falloff="smooth"` | Uses `linear`, `smooth`, or `exponential` attenuation |
| `data-magnetic-feel="snappy"` | Uses the `smooth`, `snappy`, or `elastic` spring preset |
| `data-magnetic-scale="1.03"` | Scales actors at full influence |
| `data-magnetic-rotate="2"` | Rotates actors from horizontal pointer progress |

Data attributes override constructor options for their host.

## Options

```ts
const magnetic = new MagneticMotion({
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
  spring: {
    stiffness: 160,
    damping: 20,
    mass: 1,
    precision: 0.001,
  },
  disableOnTouch: true,
  respectReducedMotion: true,
  reducedMotionBehavior: "disable",
});
```

Set `spring: false` for immediate pointer updates. `feel` provides tuned
defaults; explicit spring values provide advanced control.

## Select targets

The constructor accepts a selector, one element, or an iterable:

```js
new MagneticMotion(".magnetic-item");
new MagneticMotion(document.querySelector(".hero"));
new MagneticMotion(document.querySelectorAll("[data-magnetic]"));
```

Pass options as the first argument when using the default selector:

```js
new MagneticMotion({
  radius: 140,
  max: 24,
});
```

## Lifecycle

```js
magnetic.start();
magnetic.stop();
magnetic.reset();
magnetic.refresh();
magnetic.update({ radius: 140 });
magnetic.destroy();
```

- `start()` remounts a stopped instance.
- `stop()` removes listeners and restores inline styles.
- `reset()` returns all actors to rest with the configured spring.
- `refresh()` rediscovers hosts, layers, and data attributes.
- `update()` changes global options without replacing the instance.
- `destroy()` permanently releases the instance.

`refresh()` is useful after adding static markup through partial navigation or
changing data attributes.

## CSS states and variables

Mounted hosts receive `data-magnetic-mounted`. A host inside its interaction
field also receives `data-magnetic-active` and
`data-magnetic-pointer="mouse|pen"`.

The following values are available to your CSS:

```css
[data-magnetic] {
  background-position:
    var(--magnetic-pointer-x, 50%)
    var(--magnetic-pointer-y, 50%);
}
```

- `--magnetic-x`
- `--magnetic-y`
- `--magnetic-progress-x`
- `--magnetic-progress-y`
- `--magnetic-influence`
- `--magnetic-pointer-x`
- `--magnetic-pointer-y`
- `--magnetic-layer`

Magnetic Motion owns the individual CSS `translate`, `rotate`, and `scale`
properties while running. Regular CSS `transform` remains untouched. Existing
inline values are restored by `stop()` and `destroy()`.

## Accessibility and input

The library does not change focus, click behavior, roles, labels, or document
structure. Touch pointers are ignored by default.

When `prefers-reduced-motion: reduce` matches, interaction is disabled and
actors stay at rest. Use `reducedMotionBehavior: "instant"` if immediate
pointer-following behavior is preferred instead.

## Browser support

Magnetic Motion is browser-only and targets modern browsers with Pointer
Events, CSS individual transform properties, and `requestAnimationFrame`.
Initialize it after the page markup is available.

No React, Vue, server rendering, or required CSS is included.

## Development

```bash
pnpm install
pnpm run check
pnpm dev
```

`pnpm run check` runs strict TypeScript validation, unit tests, package builds,
declaration generation, and the documentation build.
