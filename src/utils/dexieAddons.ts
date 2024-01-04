import { ValidationSchema } from "./types";
import Dexie, { IndexableType } from "dexie";
import validateDexie from "./validateDexie";

function GetSafelyAddPlugin(
  getValidationSchema: () => ValidationSchema | undefined,
) {
  return function SafelyAdd<Item>(db: Dexie) {
    // @ts-ignore
    db.Table.prototype.safelyAdd = function (item: Item) {
      const validationSchema = getValidationSchema();
      if (validationSchema) {
        validateDexie({
          tableName: this.name,
          objectToAdd: item,
          validationSchema,
          checkRequired: true,
        });
      }
      return this.add(item);
    };
  };
}

function GetSafelyUpdatePlugin(
  getValidationSchema: () => ValidationSchema | undefined,
) {
  return function SafelyUpdate<
    Key extends IndexableType = IndexableType,
    Item extends object = object,
  >(db: Dexie) {
    // @ts-ignore
    db.Table.prototype.safelyUpdate = function (key: Key, changes: Item) {
      const validationSchema = getValidationSchema();
      if (validationSchema) {
        validateDexie({
          tableName: this.name,
          objectToAdd: changes,
          validationSchema,
          checkRequired: false,
        });
      }
      return this.update(key, changes);
    };
  };
}

export { GetSafelyAddPlugin, GetSafelyUpdatePlugin };
