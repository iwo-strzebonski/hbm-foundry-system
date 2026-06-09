/**
 * Shared DataModel field helpers. Foundry's data model field constructors
 * live under foundry.data.fields at runtime; we re-export local aliases
 * to keep the data model files terse.
 */

// Foundry exposes fields globally; declared via fvtt-types.
export const fields = (): typeof foundry.data.fields => foundry.data.fields;

export function makeIntField(initial = 0, options: Partial<{ min: number; max: number; nullable: boolean }> = {}) {
  const f = fields();
  return new f.NumberField({
    required: true,
    nullable: options.nullable ?? false,
    integer: true,
    initial,
    min: options.min,
    max: options.max,
  });
}

export function makeStringField(initial = '', options: Partial<{ blank: boolean; choices: readonly string[] }> = {}) {
  const f = fields();
  return new f.StringField({
    required: true,
    blank: options.blank ?? true,
    initial,
    choices: options.choices as string[] | undefined,
  });
}

export function makeBoolField(initial = false) {
  const f = fields();
  return new f.BooleanField({ required: true, initial });
}

export function makeHtmlField(initial = '') {
  const f = fields();
  return new f.HTMLField({ required: true, blank: true, initial });
}

export function makeArrayField(element: foundry.data.fields.DataField.Any) {
  const f = fields();
  return new f.ArrayField(element);
}

export function makeValueMaxField(initial = 0, max = 0) {
  const f = fields();
  return new f.SchemaField({
    value: makeIntField(initial, { min: 0 }),
    max: makeIntField(max, { min: 0 }),
  });
}
