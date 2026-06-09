/**
 * Permissive shims for Foundry VTT v13 globals.
 *
 * The official @league-of-foundry-developers/foundry-vtt-types package is
 * still being aligned to v13's API surface and many generic constraints are
 * over-strict for v13's actual runtime. To keep our `bun run typecheck`
 * green for our own logic, we declare the Foundry surface we touch loosely.
 */

declare class Roll {
  [key: string]: any;
  constructor(formula?: string, data?: Record<string, unknown>, options?: Record<string, unknown>);
  static CHAT_TEMPLATE: string;
  formula: string;
  options: Record<string, any>;
  terms: any[];
  total: number;
  evaluate(options?: Record<string, unknown>): Promise<this>;
  evaluateSync(options?: Record<string, unknown>): this;
  render(options?: Record<string, unknown>): Promise<string>;
  toMessage(data?: Record<string, unknown>, options?: Record<string, unknown>): Promise<any>;
}

declare class Combat {
  [key: string]: any;
  combatants: any[];
  combatant: any;
}

declare class Combatant {
  [key: string]: any;
  actor: any;
}

declare class Actor {
  [key: string]: any;
}

declare class Item {
  [key: string]: any;
}

declare class ActorSheet { [key: string]: any; }
declare class ItemSheet { [key: string]: any; }

declare class FormDataExtended {
  constructor(form: HTMLFormElement);
  readonly object: Record<string, unknown>;
}

declare const Handlebars: {
  registerHelper(name: string, fn: (...args: any[]) => any): void;
};

// TextEditor is now namespaced in v13; kept as shim for backwards compat tooling.
// Use foundry.applications.ux.TextEditor.implementation at runtime.

declare function fromUuid<T = unknown>(uuid: string): Promise<T | null>;
declare class ChatMessage {
  [key: string]: any;
  static create(data: Record<string, unknown>): Promise<any>;
  static getWhisperRecipients(name: string): any[];
  static getSpeaker(data?: Record<string, unknown>): any;
}

declare namespace ChatMessage {
  type SpeakerData = Record<string, unknown>;
}

declare const Hooks: {
  on(event: string, fn: (...args: any[]) => any): number;
  once(event: string, fn: (...args: any[]) => any): number;
  off(event: string, id: number | ((...args: any[]) => any)): void;
};

declare const CONFIG: any;

declare const game: any;

declare const ui: any;

declare namespace foundry {
  namespace utils {
    function getProperty(obj: any, path: string): any;
    function setProperty(obj: any, path: string, value: any): boolean;
    function mergeObject<T = any>(original: T, other?: any, options?: any): T;
    function deepClone<T>(obj: T): T;
    function randomID(length?: number): string;
  }
  namespace abstract {
    class TypeDataModel {
      [key: string]: any;
      static defineSchema(): Record<string, any>;
      prepareDerivedData(): void;
    }
    class DataModel {
      [key: string]: any;
    }
  }
  namespace data {
    namespace fields {
      class DataField { constructor(options?: Record<string, unknown>); }
      namespace DataField { type Any = DataField; }
      class SchemaField extends DataField { constructor(fields: Record<string, any>, options?: Record<string, unknown>); }
      class StringField extends DataField {}
      class NumberField extends DataField {}
      class BooleanField extends DataField {}
      class HTMLField extends DataField {}
      class ArrayField extends DataField { constructor(element: any, options?: Record<string, unknown>); }
      class ObjectField extends DataField {}
    }
  }
  /** v12-compat layer, always available in v13 */
  namespace appv1 {
    namespace api {
      class Dialog {
        constructor(data: {
          title: string;
          content: string;
          buttons: Record<string, { icon?: string; label: string; callback?: (html: any) => void }>;
          default: string;
          close?: () => void;
        });
        render(force?: boolean): this;
      }
    }
    namespace sheets {
      class ActorSheet { [key: string]: any; }
      class ItemSheet  { [key: string]: any; }
    }
  }
  namespace applications {
    namespace ux {
      const TextEditor: {
        implementation: {
          getDragEventData(event: DragEvent): Record<string, unknown> | null;
        };
      };
      class FormDataExtended {
        constructor(form: HTMLFormElement);
        readonly object: Record<string, unknown>;
      }
    }
    namespace api {
      class DialogV2 {
        static wait(options: {
          title: string;
          content: string;
          buttons: Array<{ type: string; label: string; action: string; default?: boolean }>;
          rejectClose?: boolean;
          modal?: boolean;
        }): Promise<string | null>;
        static prompt(options: {
          title: string;
          content: string;
          label?: string;
          rejectClose?: boolean;
          modal?: boolean;
          ok?: { callback: (event: Event, button: any, dialog: HTMLElement) => any };
        }): Promise<any>;
        static inform(options: { title: string; content: string; rejectClose?: boolean }): Promise<void>;
      }
      class ApplicationV2 {
        [key: string]: any;
        static DEFAULT_OPTIONS: any;
        static PARTS: any;
        element: HTMLElement;
        tabGroups: Record<string, string>;
        _prepareContext(options?: any): Promise<any>;
        _preparePartContext(partId: string, context: any): Promise<any>;
        _onRender(context?: any, options?: any): void | Promise<void>;
        changeTab(tabId: string, groupId: string, options?: any): void;
      }
      function HandlebarsApplicationMixin<T>(base: T): T;
    }
    namespace sheets {
      class ActorSheetV2 extends api.ApplicationV2 { document: any; actor: any; }
      class ItemSheetV2 extends api.ApplicationV2 { document: any; item: any; }
    }
    namespace handlebars {
      function renderTemplate(path: string, data: Record<string, unknown>): Promise<string>;
    }
  }
  namespace documents {
    namespace collections {
      const Actors: { unregisterSheet(scope: string, cls: any): void; registerSheet(scope: string, cls: any, options: Record<string, unknown>): void };
      const Items:  { unregisterSheet(scope: string, cls: any): void; registerSheet(scope: string, cls: any, options: Record<string, unknown>): void };
    }
  }
}

// Vite define replacement
declare const __SYSTEM_ID__: string;
