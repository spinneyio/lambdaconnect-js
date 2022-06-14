// @flow

/**
 * Types for Dexie database schema
 */
export type DatabaseModel = {
  version: number,
  entities: {
    [string]: DatabaseModelEntity,
  },
};

export type DatabaseModelEntity = {
  name: string,
  syncable: boolean,
  attributes: {
    [string]: DatabaseModelEntityAttribute,
  },
};

export type DatabaseModelEntityAttribute = {
  name: string,
  optional: boolean,
  attributeType: string,
  syncable: boolean,
  indexed: true,
};

/**
 * Raw types of data-model schema parsed by fast-xml-parser
 */

type RawAttributeType = 'Boolean' | 'Float' | 'Double' | 'Integer 64'
  | 'Integer 32' | 'Integer 16' | 'String' | 'Date' | 'URI' | 'UUID';
export type RawAttribute = {
  attr: {
    name: string,
    attributeType: RawAttributeType,
    optional?: 'YES',
    minValueString?: number,
    maxValueString?: number,
    regularExpressionString?: string,
    syncable?: 'YES'
  }
}

type RawRelationShip = {
  attr: {
    name: string,
    optional?: 'YES',
    maxCount?: number,
    destinationEntity?: string,
    toMany?: 'YES',
  }
}

export type RawEntity = {
  attr: {
    name: string,
    syncable?: 'YES',
  },
  attribute: RawAttribute[],
  relationship: RawRelationShip | RawRelationShip[],
}

/**
 * Validation schema types
 */
export type Type = 'string' | 'number' | 'boolean';
export type Constraints = {
  required: boolean,
  minLength?: number,
  maxLength?: number,
  minValue?: number,
  maxValue?: number,
  regex?: string,
}
export type ValidationSchema = {
  [string]: {
    attributes: {
      [string]: {
        type: Type,
        constraints: Constraints,
      }
    },
    relationships: {
      [string]: {
        destinationEntity: string,
        toMany: boolean,
      }
    }
  }
}