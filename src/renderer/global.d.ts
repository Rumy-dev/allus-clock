import type { AllusApi } from '../preload/preload';

declare global {
  interface Window {
    allus: AllusApi;
  }
}

declare module '*.svg' {
  const src: string;
  export default src;
}

export {};
