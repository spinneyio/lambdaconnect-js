import Dexie, { IndexableType, PromiseExtended, Transaction } from "dexie";
import "dexie-observable";
import { Reducer, Store, UnknownAction } from "redux";
// todo maybe just fetch?
import fetch from "isomorphic-fetch";
import { v1 as uuid } from "uuid";
import SyncConflictError from "./errors/SyncConflictError";

import ViewModel from "./view-model";
import hashCode from "./utils/hashCode";
import { BaseEntity, DatabaseModel, ValidationSchema } from "./utils/types";
import modelParser from "./utils/modelParser";
import DatabaseSyncError from "./errors/DatabaseSyncError";
import DatabaseOpenError from "./errors/DatabaseOpenError";
import { GetSafelyAddPlugin, GetSafelyUpdatePlugin } from "./utils/dexieAddons";

export type DatabaseState = {
  status: "uninitialized" | "offline" | "online";
  lastSynchronization: number;
  progressPercent: number;
  error: unknown;
  hasVersionChanged: boolean;
};

export type DatabaseOptions = {
  apiUrl: string;
  pushPath: string;
  pullPath: string;
  dataModelPath: string;
  bulkPutLimit: number;
  disablePush: boolean;
  disablePull: boolean;
  rejectionWhitelist: Array<string>;
};

export type DatabaseInitOptions = {
  apiUrl: string;
  pushPath?: string;
  pullPath?: string;
  dataModelPath?: string;
  bulkPutLimit?: number;
  disablePush?: boolean;
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

  requestHeaders: any;

  syncInProgress: boolean;

  isInitialized: boolean;

  isChangesFrozen: boolean = false;

  constructor(viewModels: ViewModels, options: DatabaseInitOptions) {
    this.options = {
      pushPath: "lambdaconnect/push",
      pullPath: "lambdaconnect/pull",
      dataModelPath: "data-model",
      bulkPutLimit: 1000,
      disablePull: false,
      disablePush: false,
      rejectionWhitelist: [],
      ...options,
    };
    this.syncInProgress = false;
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

  setRequestHeaders(headers: any): void {
    this.requestHeaders = headers;
  }

  getValidationSchema() {
    return this.validationSchema;
  }

  makeServerRequest(
    path: string,
    method: string = "GET",
    headers?: any,
    body?: any,
    apiVersion: string = "v1",
  ): Promise<any> {
    return fetch(`${this.options.apiUrl}/${apiVersion}/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...this.requestHeaders,
        ...headers,
      },
      body: typeof body === "object" ? JSON.stringify(body) : body,
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

      // download current data model
      // todo: it is worth to implement calculating schema hash on the server-side
      const response = await this.makeServerRequest(this.options.dataModelPath);
      if (
        response.status !== 200 ||
        !response.headers.get("Content-Type").includes("application/json")
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
      const currentSchemaHash: number = Number(
        window.localStorage.getItem(LOCALSTORAGE_MODEL_HASH_KEY),
      );
      const receivedSchemaHash: number = hashCode(JSON.stringify(schema));
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

        // todo: reload optimizations should be based on changes
        this.reloadAllViewModels();
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

  async _monitoredBulkPut(
    // entitiesToPush: { [string]: [{ isSuitableForPush: 0 | 1 }] },
    entitiesToPush: Record<string, Array<BaseEntity>>,
  ) {
    await this.dao.transaction("rw!", Object.keys(entitiesToPush), async () => {
      // @ts-ignore needed to skip table hooks on sync transactions
      Dexie.currentTransaction.__syncTransaction = true;

      for (const entityName of Object.keys(entitiesToPush)) {
        const entities = entitiesToPush[entityName]!;
        for (const entity of entities) {
          entity.isSuitableForPush = 0;
        }
        await this.dao.table(entityName).bulkPut(entities);
      }
    });
  }

  async _syncPush(): Promise<void> {
    if (!this.model) {
      throw new Error("Model is not parsed yet");
    }

    const pushableEntities = await Promise.all(
      Object.keys(this.model.entities).map(async (entityName) => {
        if (!this.model) {
          return;
        }

        const entities = await this.dao
          .table(entityName)
          .where("isSuitableForPush")
          .equals(1)
          .toArray();
        for (const entity of entities) {
          // @ts-ignore
          delete entity.isSuitableForPush;
        }
        if (entities.length === 0) {
          return;
        }

        return [entityName, entities] as const;
      }),
    );

    const entitiesToPush = pushableEntities.filter(
      (entity): entity is [string, any[]] => entity !== undefined,
    );

    const pushBody = entitiesToPush.reduce(
      (acc, [entityName, entities]) => {
        acc[entityName] = entities;
        return acc;
      },
      {} as Record<string, Array<any>>,
    );

    if (entitiesToPush.length > 0) {
      const pushResponse = await this.makeServerRequest(
        this.options.pushPath,
        "POST",
        null,
        pushBody,
      );
      if (pushResponse.status !== 200) {
        let errorContent;
        try {
          errorContent = await pushResponse.json();
        } catch {
          errorContent = null;
        }
        if (errorContent?.["error-code"] === 42) {
          this.options = {
            ...this.options,
            disablePull: true,
          };
          return;
        }
        throw new DatabaseSyncError(
          `Error while pushing data to server: ${pushResponse.status}`,
          {
            pushPayload: pushBody,
            error: errorContent
              ? errorContent.errors?.english?.push
              : `Server responded with ${pushResponse.status}`,
            type: "push",
            code: errorContent?.["error-code"] || -1,
          },
        );
      }

      const data = await pushResponse.json();

      if (!data.success) {
        throw new DatabaseSyncError(
          "Server responded with an error while pushing data",
          {
            pushPayload: pushBody,
            error: data.errors?.english
              ? (Object.values(data.errors.english)?.[0] as string | undefined)
              : `Server responded with error code ${data["error-code"]}`,
            type: "push",
            code: data["error-code"] || -1,
          },
        );
      }

      const checkedRejectedObjects = Object.keys(
        data["rejected-objects"],
      ).filter((key) => !this.options.rejectionWhitelist.includes(key));
      const checkedRejectedFields = Object.keys(data["rejected-fields"]).filter(
        (key) => {
          // flatten the rejected-fields of current object and filter out whitelisted field names
          const rejectedNotWhitelistedFields = Object.values(
            data["rejected-fields"][key],
          )
            .flat()
            .filter(
              (fieldName) =>
                !this.options.rejectionWhitelist.includes(fieldName as string),
            );
          // remove the key from rejected-fields object when the object has been whitelisted or all of its rejected fields are whitelisted
          return (
            !this.options.rejectionWhitelist.includes(key) &&
            Boolean(rejectedNotWhitelistedFields.length)
          );
        },
      );
      if (checkedRejectedObjects.length || checkedRejectedFields.length) {
        throw new SyncConflictError("The push was malformed", {
          pushPayload: pushBody,
          rejectedFields: data["rejected-fields"],
          rejectedObjects: data["rejected-objects"],
        });
      }
    }
  }

  async _syncPull(pullOptions?: { forcePullAll?: boolean }): Promise<void> {
    if (!this.model) {
      throw new Error("Model is not parsed yet");
    }

    const entityLastRevisions: Record<string, number> = {};

    const entityNames = Object.keys(this.model.entities);

    /**
     * If forcePullAll is true, we want to pull all scoped data from the server, not just the changes.
     */
    if (pullOptions?.forcePullAll) {
      entityNames.forEach((entityName) => {
        entityLastRevisions[entityName] = 0;
      });
    } else {
      const syncRevisions = await Promise.all(
        entityNames.map(async (entityName) => {
          const lastSyncRevisionEntity = await this.dao
            .table<BaseEntity>(entityName)
            .orderBy("syncRevision")
            .last();
          const lastSyncRevision: number | undefined =
            lastSyncRevisionEntity?.syncRevision;
          return [entityName, lastSyncRevision] as const;
        }),
      );

      syncRevisions.forEach(([entityName, lastSyncRevision]) => {
        entityLastRevisions[entityName] = lastSyncRevision
          ? lastSyncRevision + 1
          : 0;
      });
    }

    const pullResponse = await this.makeServerRequest(
      this.options.pullPath,
      "POST",
      {},
      entityLastRevisions,
    );
    let body;
    try {
      body = await pullResponse.json();
    } catch {
      body = null;
    }
    if (pullResponse.status !== 200 || !body || !body.success) {
      throw new DatabaseSyncError(
        `Error while pushing data to server: ${pullResponse.status}`,
        {
          type: "pull",
          code: body?.["error-code"] || -1,
        },
      );
    }
    const data = JSON.parse(body.data);

    await this._monitoredBulkPut(data);
  }

  async sync(syncOptions?: {
    skipPush?: boolean;
    skipPull?: boolean;
    forcePullAll?: boolean;
  }): Promise<void> {
    if (!this.store) {
      throw new Error("Redux store is not set");
    }

    this.syncInProgress = true;
    try {
      if (!this.options.disablePush && !syncOptions?.skipPush) {
        await this._syncPush();
      }
      if (!this.options.disablePull && !syncOptions?.skipPull) {
        await this._syncPull(
          syncOptions?.forcePullAll ? { forcePullAll: true } : undefined,
        );
      } else {
        // disablePull flag can be set to true
        // if the server responds with "Try again" while pushing data
        this.options = {
          ...this.options,
          disablePull: false,
        };
      }

      this.syncInProgress = false;
      this.store.dispatch({
        type: DATABASE_SYNC_FINISHED,
      });
    } catch (error) {
      this.syncInProgress = false;
      this.store.dispatch({
        type: DATABASE_SYNC_ERROR,
        payload: error,
      });
      throw error;
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

  reloadAllViewModels(): void {
    if (!this.dao.isOpen() || !this.store) {
      console.warn("Database still not opened, aborting reload");
      return;
    }
    console.log(`VM reload count: ${this.registeredViewModels.size}`);
    const { dispatch } = this.store;
    this.registeredViewModels.forEach((viewModel) => {
      viewModel.getReloadAction()(dispatch);
    });
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
            status: "offline",
            hasVersionChanged: false,
          };
        case DATABASE_INITIALIZATION_ERROR:
          return {
            ...initState,
            status: "uninitialized",
            error: action.payload,
          };
        case DATABASE_SYNC_FINISHED:
          return {
            ...state,
            error: null,
            status: "online",
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
