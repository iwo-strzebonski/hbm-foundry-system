import { makeIntField, makeStringField, makeHtmlField, makeBoolField, fields } from './fields';

export class TalentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = fields();
    return {
      requirements: new f.SchemaField({
        race: makeStringField(''),
        attribute: makeStringField(''),
        skill: makeStringField(''),
        talent: makeStringField(''),
        title: makeStringField(''),
        discipline: makeStringField(''),
      }),
      multiSelect: makeBoolField(false),
      cost: makeStringField(''),
      damageReductionBonus: makeIntField(0, { min: 0 }),
      description: makeHtmlField(''),
      effect: makeHtmlField(''),
    };
  }
}
