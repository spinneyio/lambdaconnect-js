import Dexie, { IndexableType, PromiseExtended, Transaction } from "dexie";
import "dexie-observable";
import { Reducer, Store, UnknownAction } from "redux";
import { v1 as uuid } from "uuid";

import ViewModel from "./view-model";
import hashCode from "./utils/hashCode";
import { BaseEntity, DatabaseModel, ValidationSchema } from "./utils/types";
import modelParser from "./utils/modelParser";
import DatabaseOpenError from "./errors/DatabaseOpenError";
import { GetSafelyAddPlugin, GetSafelyUpdatePlugin } from "./utils/dexieAddons";
import authorizedFetch from "./authorized-fetch";

export type DatabaseState = {
  status: "uninitialized" | "offline" | "online";
  lastSynchronization: number;
  progressPercent: number;
  error: unknown;
  hasVersionChanged: boolean;
};

export type DatabaseOptions = {
  apiUrl: string;
  dataModelPath: string;
  rejectionWhitelist: Array<string>;
};

export type DatabaseInitOptions = {
  apiUrl: string;
  pushPath?: string;
  pullPath?: string;
  dataModelPath?: string;
  bulkPutLimit?: number;
  disablePull?: boolean;
  rejectionWhitelist?: Array<string>;
};

export type DatabaseInitializationOptions = {
  truncate?: boolean;
  indexes?: Record<string, Array<string>>;
};

const DATABASE_INITIALIZED = "DATABASE_INITIALIZED";
const DATABASE_SYNC_FINISHED = "DATABASE_SYNC_FINISHED";
const DATABASE_SYNC_ERROR = "DATABASE_SYNC_ERROR";
const DATABASE_INITIALIZATION_ERROR = "DATABASE_INITIALIZATION_ERROR";
const DATABASE_VERSION_CHANGED = "DATABASE_VERSION_CHANGED";

const RESET_STATE = "RESET_STATE";

const LOCALSTORAGE_MODEL_HASH_KEY = "lambdaconnect_model_hash";
const DATABASE_NAME = "lambdaconnect";

const initState: DatabaseState = {
  status: "uninitialized",
  lastSynchronization: 0,
  progressPercent: 0,
  error: null,
  hasVersionChanged: false,
};

export type AutoCreatedEntityFields = {
  uuid: string;
  active: 0 | 1;
  createdAt: string;
  updatedAt: string;
};

export type DataAccessObject = Omit<Dexie, "table"> & {
  table: <T, TKey = IndexableType>(
    tableName: string,
  ) => Omit<Dexie.Table<T, TKey>, "add" | "update"> & {
    safelyAdd: (
      item: (T extends AutoCreatedEntityFields
        ? Omit<T, "uuid" | "active" | "createdAt" | "updatedAt">
        : T) &
        Partial<AutoCreatedEntityFields>,
    ) => PromiseExtended<TKey>;
    safelyUpdate: (
      key: TKey,
      changes: { [Key in keyof T]?: T[Key] | null },
    ) => PromiseExtended<number>;
  };
};

export default class Database<
  ViewModels extends Array<ViewModel<string, any, any, any>>,
> {
  dao: DataAccessObject;

  registeredViewModels: Map<string, ViewModels[number]>;

  viewModels: ViewModels;

  store: Store | undefined;

  model: DatabaseModel | undefined;

  validationSchema: ValidationSchema | undefined;

  options: DatabaseOptions;

  isInitialized: boolean;

  isChangesFrozen: boolean = false;

  constructor(viewModels: ViewModels, options: DatabaseInitOptions) {
    this.options = {
      dataModelPath: "data-model",
      rejectionWhitelist: [],
      ...options,
    };
    Dexie.addons.push(GetSafelyAddPlugin(() => this.validationSchema));
    Dexie.addons.push(GetSafelyUpdatePlugin(() => this.validationSchema));
    // @ts-ignore
    this.dao = new Dexie(DATABASE_NAME, { autoOpen: false });
    this.registeredViewModels = new Map<string, ViewModels[number]>();
    this.viewModels = viewModels;
    this.isInitialized = false;

    this.viewModels.forEach((viewModel) => {
      viewModel.initialize(this);
    });
  }

  subscribeToStoreChanges(store: Store): void {
    this.store = store;

    const defaultEqualityFunction = (left: any, right: any): boolean =>
      left === right;

    this.store.subscribe(() => {
      if (!this.store) {
        return;
      }
      const state = this.store.getState();
      this.registeredViewModels.forEach((viewModel) => {
        if (!viewModel.stateSelector || !this.store) {
          return;
        }

        const subState = viewModel.stateSelector(state);
        const equalityFn =
          viewModel.stateSelectorEqualityFunction || defaultEqualityFunction;
        if (!equalityFn(viewModel.lastReloadState, subState)) {
          viewModel.lastReloadState = subState;
          this.store.dispatch<any>(viewModel.getReloadAction());
        }
      });
    });
  }

  async initialize(options?: DatabaseInitializationOptions): Promise<void> {
    if (!this.store) {
      throw new Error("Redux store is not set");
    }
    try {
      if (options?.truncate) {
        console.log("Deleting database!");
        await this.dao.delete();
      }

      const response = await authorizedFetch(this.options.dataModelPath);
      // const response = await this.makeServerRequest(this.options.dataModelPath);
      if (
        response.status !== 200 ||
        !response.headers.get("Content-Type")?.includes("application/json")
      ) {
        throw new Error("Could not load database model");
      }

      const modelResponse: { model: string } = await response.json();

      const { validationSchema, model } = modelParser(modelResponse.model);
      this.model = model;
      this.validationSchema = validationSchema;

      const indexes = options?.indexes || {};
      const schema = Object.keys(this.model.entities).reduce(
        (acc, entityName) => {
          const entity = model.entities[entityName];
          if (!entity?.syncable) {
            return acc;
          }

          acc[entityName] = [
            "$$uuid",
            "createdAt",
            "updatedAt",
            "isSuitableForPush",
            "syncRevision",
          ]
            .concat(
              Object.keys(entity.attributes)
                .map((attributeName) => entity.attributes[attributeName]!)
                .filter(
                  (attribute) =>
                    attribute.attributeType === "relationship" ||
                    (attribute.indexed && attribute.name !== "uuid"),
                )
                .map((attribute) => {
                  if (
                    attribute.attributeType === "relationship" &&
                    attribute.toMany
                  ) {
                    return `*${attribute.name}`;
                  }

                  return attribute.name;
                })
                .concat(indexes[entityName] || []),
            )
            .join(",");
          return acc;
        },
        {} as Record<string, string>,
      );

      // check if data model is up to date
      const currentSchemaHash = Number(
        window.localStorage.getItem(LOCALSTORAGE_MODEL_HASH_KEY),
      );
      const receivedSchemaHash = hashCode(JSON.stringify(schema));
      if (currentSchemaHash !== receivedSchemaHash && currentSchemaHash) {
        // if not - wipe out the whole database if exist
        // todo: reconsider migrations (either with server-side counting or local storage version counter)
        console.log(
          "Truncating the whole database because of model version change",
        );
        this.store.dispatch({ type: DATABASE_VERSION_CHANGED });
        if (!this.dao.isOpen()) {
          await this.dao.open();
        }
        await this.dao.delete();
        this.dao.close();
      }

      if (this.dao.isOpen()) {
        this.dao.close();
      }

      this.dao.version(this.model.version).stores(schema);

      // changes listener (cross-tab observable)
      this.dao.on("changes", (changes, partial) => {
        if (this.isChangesFrozen || partial || changes.length === 0) {
          return;
        }

        this.reloadChangedViewModels(changes.map((change) => change.table));
      });

      // Dexie hook typings are insane
      const createHook: any = <T extends BaseEntity>(
        _: string,
        object: T,
        transaction: Transaction,
      ) => {
        // @ts-ignore added to Transaction object in `this._syncPull`
        if (!transaction.__syncTransaction) {
          object.isSuitableForPush = 1;
          if (typeof object.uuid === "undefined") {
            object.uuid = uuid();
          }
          object.createdAt = object.updatedAt = new Date().toISOString();
          if (typeof object.active === "undefined") {
            object.active = 1;
          }
          return object.uuid;
        }
      };

      const updateHook: any = <T extends BaseEntity>(
        modifications: Partial<T>,
        _: string,
        obj: T,
        transaction: Transaction,
      ) => {
        // @ts-ignore added to Transaction object in `this._syncPull`
        if (!transaction.__syncTransaction) {
          if (!Object.keys(modifications).length) {
            return undefined;
          }
          return {
            // @ts-ignore `__isSuitableForPush` can be added to add object without pushing it to the remote db
            isSuitableForPush: modifications.__isSuitableForPush === 0 ? 0 : 1,
            __isSuitableForPush: undefined,
            updatedAt: new Date().toISOString(),
            active:
              typeof modifications.active === "number"
                ? modifications.active
                : 1,
          };
        }
      };

      for (const entityName of Object.keys(this.model.entities)) {
        this.dao.table(entityName).hook("creating", createHook);
        this.dao.table(entityName).hook("updating", updateHook);
      }

      try {
        await this.dao.open();
      } catch (e) {
        throw new DatabaseOpenError("Failed to open database");
      }
      // save received model hash as current
      window.localStorage.setItem(
        LOCALSTORAGE_MODEL_HASH_KEY,
        receivedSchemaHash.toString(),
      );

      // todo: reconsider database initialization within redux persist rehydrate
      this.store.dispatch({
        type: DATABASE_INITIALIZED,
      });
      this.isInitialized = true;
    } catch (err) {
      this.store.dispatch({
        type: DATABASE_INITIALIZATION_ERROR,
        payload: err,
      });
    }
  }

  async truncate(): Promise<void> {
    if (!this.model) {
      return;
    }
    for (const entityName of Object.keys(this.model.entities)) {
      await this.dao.table(entityName).clear();
    }
  }

  setChangesFrozen(isFrozen: boolean) {
    this.isChangesFrozen = isFrozen;
  }

  reloadChangedViewModels(changedObjectStores: Array<string>): void {
    if (!this.dao.isOpen() || !this.store) {
      console.warn("Database still not opened, aborting reload");
      return;
    }
    const { dispatch } = this.store;
    let counter = 0;
    this.registeredViewModels.forEach((viewModel) => {
      const doesChangeAffectViewModel = changedObjectStores.some(
        (objectStore) => {
          return viewModel.readTables.has(objectStore);
        },
      );
      if (doesChangeAffectViewModel) {
        counter += 1;
        viewModel.getReloadAction()(dispatch);
      }
    });
    console.log(
      `Registered VMs: ${this.registeredViewModels.size}; VM reload count: ${counter}`,
    );
  }

  /**
   * Clear all lambdaconnect ViewModel redux state.
   * All ViewModels return to initial state.
   */
  resetState(): void {
    if (!this.dao.isOpen()) {
      console.warn("Database still not opened, aborting reload");
    }
    const dispatch = this.store?.dispatch;
    if (dispatch) {
      dispatch({
        type: RESET_STATE,
      });
    }
  }

  static getReducer() // viewModels: A,
  : Reducer<DatabaseState> {
    const databaseReducer = (
      state: DatabaseState = initState,
      action: UnknownAction,
    ): DatabaseState => {
      switch (action.type) {
        case DATABASE_INITIALIZED:
          return {
            ...initState,
            status: "online",
            hasVersionChanged: false,
          };
        case DATABASE_INITIALIZATION_ERROR:
          return {
            ...initState,
            status: "uninitialized",
            error: action.payload,
          };
        case DATABASE_SYNC_ERROR:
          return {
            ...state,
            error: action.payload,
            status: "offline",
          };
        case DATABASE_VERSION_CHANGED:
          return {
            ...state,
            hasVersionChanged: true,
          };
        default:
          return state;
      }
    };

    return databaseReducer;
  }

  registerViewModel<Binding, Parameters, State>(
    viewModel: ViewModel<string, Binding, Parameters, State>,
    initialReloadParameters?: Parameters,
  ) {
    this.registeredViewModels.set(viewModel.name, viewModel);
    if (this.isInitialized && this.store) {
      if (viewModel.stateSelector) {
        viewModel.lastReloadState = viewModel.stateSelector(
          this.store.getState(),
        );
      }
      // todo: maybe a query-revision comparison to optimize query calls?
      viewModel.getReloadAction(initialReloadParameters)(this.store.dispatch);
    }
  }

  unregisterViewModel(viewModelName: string) {
    this.registeredViewModels.delete(viewModelName);
  }

  clearViewModels(): void {
    if (!this.dao.isOpen()) {
      console.warn("Database is not opened, aborting clear");
    }
    this.registeredViewModels.forEach((viewModel) => {
      this.unregisterViewModel(viewModel.name);
    });
  }
}
