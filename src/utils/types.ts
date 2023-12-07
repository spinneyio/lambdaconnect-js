/**
 * Types for Dexie database schema
 */
export type DatabaseModel = {
  version: number;
  entities: Record<string, DatabaseModelEntity>;
};

export type DatabaseModelEntity = {
  name: string;
  syncable: boolean;
  attributes: Record<string, DatabaseModelEntityAttribute>;
};

export type DatabaseModelEntityAttribute = {
  name: string;
  optional: boolean;
  attributeType: string;
  syncable: boolean;
  indexed?: false;
  toMany?: boolean;
};

/**
 * Raw types of data-model schema parsed by fast-xml-parser
 */

type RawAttributeType =
  | "Boolean"
  | "Float"
  | "Double"
  | "Integer 64"
  | "Integer 32"
  | "Integer 16"
  | "String"
  | "Date"
  | "URI"
  | "UUID";
export type RawAttribute = {
  attr: {
    name: string;
    attributeType: RawAttributeType;
    optional?: "YES";
    minValueString?: number;
    maxValueString?: number;
    regularExpressionString?: string;
    syncable?: "YES";
  };
};

type RawRelationShip = {
  attr: {
    name: string;
    optional?: "YES";
    maxCount?: number;
    destinationEntity?: string;
    toMany?: "YES";
  };
};

export type RawEntity = {
  attr: {
    name: string;
    syncable?: "YES";
  };
  attribute: RawAttribute[];
  relationship: RawRelationShip | RawRelationShip[];
};

/**
 * Validation schema types
 */
export type Type = "string" | "number" | "boolean" | "date";
export type Constraints = {
  required: boolean;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  regex?: string;
};

export type ValidationSchema = Record<
  string,
  {
    attributes: Record<
      string,
      {
        type: Type;
        constraints: Constraints;
      }
    >;
    relationships: Record<
      string,
      {
        destinationEntity: string;
        toMany: boolean;
      }
    >;
  }
>;

/**
 * Business types
 */
export type BaseEntity = {
  uuid: string;
  active: 0 | 1;
  isSuitableForPush: 0 | 1;
  createdAt: string;
  updatedAt: string;
  syncRevision?: number;
};
