import '@testing-library/jest-dom/vitest';

// jsdom implements neither of these, and both are used by the theme provider and the
// dnd-kit sensors. Stubbing them here keeps every suite from repeating the boilerplate.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => undefined;
}
