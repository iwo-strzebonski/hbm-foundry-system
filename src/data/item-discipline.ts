import { makeStringField, makeHtmlField, makeArrayField, fields } from './fields';
import { ATTRIBUTES } from '../constants';

export class DisciplineData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = fields();
    return {
      color: makeStringField(''),
      suggestedAttribute: makeStringField('magic', {
        blank: false,
        choices: ATTRIBUTES as unknown as readonly string[],
      }),
      suggestedSkills: makeArrayField(new f.StringField({ blank: false })),
      passiveAbility: makeHtmlField(''),
      availableSpells: makeArrayField(new f.StringField({ blank: false })),
      description: makeHtmlField(''),
    };
  }
}
