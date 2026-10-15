/**
 * Type-safe DOM access helpers to prevent 'null' or 'undefined' errors
 * during direct DOM manipulation in PharmaMix Lab.
 */

/**
 * Safely retrieves an element from the DOM or throws a descriptive error.
 * Prefers elements within the currently active page to avoid ID collisions.
 */
export function getElement<T extends HTMLElement>(id: string): T {
  const element = document.querySelector(`.page.active #${id}`) || document.getElementById(id);
  if (!element) {
    throw new Error(`Critical UI Error: Element with ID "${id}" not found in the document.`);
  }
  return element as T;
}

/**
 * Safely retrieves a canvas element from the DOM.
 */
export function getCanvas(id: string): HTMLCanvasElement | null {
  const element = document.querySelector(`.page.active #${id}`) || document.getElementById(id);
  if (!element || !(element instanceof HTMLCanvasElement)) {
    return null;
  }
  return element;
}

/**
 * Safely retrieves an input element.
 */
export function getInput(id: string): HTMLInputElement {
  return getElement<HTMLInputElement>(id);
}

/**
 * Safely retrieves a select element.
 */
export function getSelect(id: string): HTMLSelectElement {
  return getElement<HTMLSelectElement>(id);
}

/**
 * Hides an element by ID.
 */
export function hideElement(id: string): void {
  const el = document.querySelector(`.page.active #${id}`) || document.getElementById(id);
  if (el) (el as HTMLElement).style.display = 'none';
}

/**
 * Shows an element by ID.
 */
export function showElement(id: string, displayStyle: string = 'block'): void {
  const el = document.querySelector(`.page.active #${id}`) || document.getElementById(id);
  if (el) (el as HTMLElement).style.display = displayStyle;
}
