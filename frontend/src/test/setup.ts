// The system is Brazil-only and every date helper formats against America/Sao_Paulo
// explicitly. Pin the test runner's own local timezone to the same zone so tests that
// build `Date` objects from local-time components (`new Date(y, m, d, h)`) produce the
// same instant on every machine — a dev box already in Brasília time and a CI runner
// defaulting to UTC would otherwise disagree on what "today" or "23:59" means.
process.env.TZ = 'America/Sao_Paulo';

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
