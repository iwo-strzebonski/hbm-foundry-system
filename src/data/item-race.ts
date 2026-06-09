import { makeIntField, makeStringField, makeHtmlField, makeArrayField, fields } from './fields';

export class RaceData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = fields();
    return {
      availableDisciplines: makeArrayField(new f.StringField({ blank: false })),
      attributePoints: makeIntField(0, { min: 0 }),
      skillPoints: makeIntField(0, { min: 0 }),
      freeTalents: makeArrayField(new f.StringField({ blank: false })),
      racialAbilities: makeArrayField(
        new f.SchemaField({
          name: makeStringField(''),
          description: makeStringField(''),
        }),
      ),
      physicalDescription: makeStringField(''),
      description: makeHtmlField(''),
    };
  }
}
