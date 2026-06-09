import { makeStringField, makeHtmlField, makeIntField } from './fields';
import { ABILITY_TYPES } from '../constants';

export class AbilityData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      type: makeStringField('passive', {
        blank: false,
        choices: ABILITY_TYPES as unknown as readonly string[],
      }),
      prerequisite: makeStringField(''),
      cost: makeStringField(''),
      manaCost: makeIntField(0, { min: 0 }),
      zealCost: makeIntField(0, { min: 0 }),
      description: makeHtmlField(''),
      mechanics: makeHtmlField(''),
    };
  }
}
