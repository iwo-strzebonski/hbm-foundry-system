/**
 * Vitest setup — stubs out Foundry globals that our modules touch on import.
 * Each test can override these by reaching into globalThis directly.
 */

import { vi } from 'vitest';

// Hooks
(globalThis as any).__SYSTEM_ID__ = 'hbm-rpg-v3';
(globalThis as any).Hooks = {
  on: vi.fn(),
  once: vi.fn(),
  off: vi.fn(),
  callAll: vi.fn(),
  call: vi.fn(),
};

// game
(globalThis as any).game = {
  user: { isGM: true, targets: new Set(), character: null },
  i18n: { localize: (k: string) => k, format: (k: string) => k },
  settings: {
    get: vi.fn(() => '0.0.0'),
    set: vi.fn(async () => undefined),
    register: vi.fn(),
  },
  items: { contents: [] },
  actors: { contents: [] },
  system: { version: '1.2.0' },
  hbm: undefined,
};

// CONFIG
(globalThis as any).CONFIG = {
  Combat: { initiative: { formula: '2d6', decimals: 0 } },
  Dice: { rolls: [] },
  Actor: { dataModels: {} },
  Item: { dataModels: {} },
  statusEffects: [],
};

// foundry namespace (minimal)
(globalThis as any).foundry = {
  utils: {
    getProperty: (obj: any, path: string) => path.split('.').reduce((o, k) => o?.[k], obj),
    setProperty: (obj: any, path: string, value: any) => {
      const parts = path.split('.');
      const last = parts.pop()!;
      const tgt = parts.reduce((o, k) => (o[k] ??= {}), obj);
      tgt[last] = value;
      return true;
    },
    deepClone: <T>(x: T): T => JSON.parse(JSON.stringify(x)),
    mergeObject: (a: any, b: any) => Object.assign(a, b),
  },
  abstract: {
    TypeDataModel: class {},
  },
  applications: {
    api: {
      HandlebarsApplicationMixin: <T extends abstract new (...args: any[]) => any>(base: T) => base,
    },
    sheets: {
      ActorSheetV2: class {},
      ItemSheetV2: class {},
    },
    handlebars: {
      loadTemplates: vi.fn(async () => []),
      renderTemplate: vi.fn(async () => ''),
    },
  },
  appv1: { sheets: {} },
  documents: { collections: {} },
};

// ChatMessage stub
(globalThis as any).ChatMessage = {
  create: vi.fn(async () => undefined),
  getSpeaker: vi.fn(() => ({})),
  getWhisperRecipients: vi.fn(() => []),
};

// ui notifications
(globalThis as any).ui = {
  notifications: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
};

// Roll stub — pool roll counting successes >= threshold
class StubRoll {
  formula: string;
  data: any;
  total = 0;
  ts: { isSuccess: boolean; successes: number };
  constructor(formula: string, data?: any) {
    this.formula = formula;
    this.data = data;
    this.ts = { isSuccess: false, successes: 0 };
  }
  async evaluate() {
    if (this.formula && this.formula.includes('1d6')) {
      this.total = 4 + (this.data?.endurance ?? 0);
    }
    return this;
  }
  async toMessage() { return undefined; }
}
(globalThis as any).Roll = StubRoll;
(global as any).Roll = StubRoll;
if (typeof window !== 'undefined') {
  (window as any).Roll = StubRoll;
}
