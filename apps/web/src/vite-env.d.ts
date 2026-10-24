/// <reference types="vite/client" />

/** Which brand files scripts/copy-brand.mjs found at build time. */
declare const __BRAND__: { logo: boolean; logoDark: boolean; mark: boolean; favicon: boolean };

interface ImportMetaEnv {
  readonly VITE_REPLAY?: string;
}
