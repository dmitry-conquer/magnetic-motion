import MagneticMotion, {
  magneticMotionDefaults,
  type MagneticMotionAxis,
  type MagneticMotionFalloff,
  type MagneticMotionFeel,
  type MagneticMotionUpdateOptions,
} from "../src";

const toolbar = document.querySelector<HTMLFormElement>("[data-toolbar]");
const resetButton = document.querySelector<HTMLButtonElement>("[data-reset]");

if (!toolbar || !resetButton) {
  throw new Error("Magnetic Motion demo controls are missing.");
}

const magnetic = new MagneticMotion();

const field = <T extends HTMLInputElement | HTMLSelectElement>(
  name: string,
): T => {
  const element = toolbar.elements.namedItem(name);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing demo field: ${name}`);
  }
  return element as T;
};

const updateText = (name: string, value: string): void => {
  document
    .querySelectorAll<HTMLElement>(`[data-output="${name}"]`)
    .forEach(element => {
      element.textContent = value;
    });
};

const readOptions = (): MagneticMotionUpdateOptions => ({
  max: Number(field<HTMLInputElement>("max").value),
  radius: Number(field<HTMLInputElement>("radius").value),
  strength: Number(field<HTMLInputElement>("strength").value),
  axis: field<HTMLSelectElement>("axis").value as MagneticMotionAxis,
  falloff: field<HTMLSelectElement>("falloff")
    .value as MagneticMotionFalloff,
  feel: field<HTMLSelectElement>("feel").value as MagneticMotionFeel,
});

const render = (): void => {
  const options = readOptions();
  magnetic.update(options);
  updateText("max", `${options.max}px`);
  updateText("radius", `${options.radius}px`);
  updateText("strength", `${options.strength}×`);
};

toolbar.addEventListener("input", render);
resetButton.addEventListener("click", () => {
  toolbar.reset();
  render();
});

window.addEventListener(
  "pagehide",
  () => {
    magnetic.destroy();
  },
  { once: true },
);

Object.assign(window, {
  magneticMotion: magnetic,
  magneticMotionDefaults,
});
