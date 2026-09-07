/// <reference types="vite/client" />

import type { PosApi } from '../../main/preload.js';

declare global {
  interface Window {
    pos: PosApi;
  }
}
export {};
