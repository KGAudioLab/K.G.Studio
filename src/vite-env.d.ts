/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

// Generated from public/config.json by the shared Vite/Vitest plugin.
declare module 'virtual:fx-defaults' {
  const defaults: import('./core/fx/fxDefaults').FXDefaults;
  export default defaults;
}

declare module 'virtual:fx-default-chain' {
  const chain: { version: 1; effects: { type: import('./core/fx').FXType }[] };
  export default chain;
}
