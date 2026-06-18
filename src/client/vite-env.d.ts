/// <reference types="vite/client" />

// Erlaubt den direkten Import von Audiodateien über Vite's Bundler-Asset-
// Pipeline (z.B. `import hornUrl from './assets/horn-long.mp3'`). Ohne diese
// Deklaration meldet TypeScript "Cannot find module" für solche Imports.
declare module '*.mp3' {
  const src: string;
  export default src;
}