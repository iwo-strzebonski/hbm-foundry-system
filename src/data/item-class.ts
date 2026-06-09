import { makeIntField, makeStringField, makeHtmlField, makeArrayField, fields } from './fields';

export class ClassData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = fields();
    return {
      year: makeIntField(1, { min: 1, max: 4 }),
      attributePoints: makeIntField(0, { min: 0 }),
      skillPoints: makeIntField(0, { min: 0 }),
      talents: makeArrayField(new f.StringField({ blank: false })),
      spells: makeArrayField(new f.StringField({ blank: false })),
      features: makeArrayField(
        new f.SchemaField({
          name: makeStringField(''),
          description: makeStringField(''),
        }),
      ),
      description: makeHtmlField(''),
    };
  }
}
