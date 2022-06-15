// @flow

import Promise from 'bluebird';
import Dexie from 'dexie';
import 'dexie-observable';
import { Action, combineReducers, Reducer, ReducersMapObject, Store } from 'redux';
import fetch from 'isomorphic-fetch';
import { v1 as uuid } from 'uuid';
import SyncConflictError from './errors/SyncConflictError';

import ViewModel from './view-model';
import hashCode from './utils/hashCode';
import type { DatabaseModel, ValidationSchema } from './utils/types';
import modelParser from './utils/modelParser';
import DatabaseSyncError from "./errors/DatabaseSyncError";
import DatabaseOpenError from "./errors/DatabaseOpenError";
import validateDexieAdd from "./utils/validateDexieAdd";

export type DatabaseState = {
  status: 'uninitialized' | 'offline' | 'online',
  lastSynchronization: number,
  inProgress: boolean,
  progressPercent: number,
  error: any,
  hasVersionChanged: boolean,
}

export type DatabaseAction = {
  ...Action,
  payload: ?mixed,
}

export type DatabaseOptions = {
  apiUrl: string,
  pushPath: string,
  pullPath: string,
  dataModelPath: string,
  bulkPutLimit: number,
  disablePush: boolean,
  disablePull: boolean,
  rejectionWhitelist: Array<string>,
}

export type DatabaseInitOptions = {
  apiUrl: string,
  pushPath?: string,
  pullPath?: string,
  dataModelPath?: string,
  bulkPutLimit?: number,
  disablePush?: boolean,
  disablePull?: boolean,
  rejectionWhitelist?: Array<string>,
};

export type DatabaseInitializationOptions = {
  truncate?: boolean,
  indexes?: { [string]: [string] },
};

const DATABASE_INITIALIZED = 'DATABASE_INITIALIZED';
const DATABASE_SYNC_IN_PROGRESS = 'DATABASE_SYNC_IN_PROGRESS';
const DATABASE_SYNC_FINISHED = 'DATABASE_SYNC_FINISHED';
const DATABASE_SYNC_ERROR = 'DATABASE_SYNC_ERROR';
const DATABASE_INITIALIZATION_ERROR = 'DATABASE_INITIALIZATION_ERROR';
const DATABASE_VERSION_CHANGED = 'DATABASE_VERSION_CHANGED';

const LOCALSTORAGE_MODEL_HASH_KEY = 'lambdaconnect_model_hash';
const DATABASE_NAME = 'lambdaconnect';

const initState: DatabaseState = {
  status: 'uninitialized',
  lastSynchronization: 0,
  inProgress: false,
  progressPercent: 0,
  error: null,
  hasVersionChanged: false
};

function GetSafelyAddPlugin(getValidationSchema: () => ValidationSchema) {
  return function SafelyAdd(db: Dexie) {
    db.Table.prototype.safelyAdd = function(item): Dexie.Promise<string> {
      const validationSchema = getValidationSchema();
      validateDexieAdd({
        tableName: this.name,
        objectToAdd: item,
        validationSchema,
      })
      return this.add(item);
    }
  }
}

export default class Database {
  dao: Dexie;

  registeredViewModels: Map<string, ViewModel>;

  viewModels: ViewModel[];

  store: Store;

  model: DatabaseModel;

  validationSchema: ValidationSchema;

  options: DatabaseOptions;

  requestHeaders: any;

  syncInProgress: boolean;

  isInitialized: boolean;

  isChangesFrozen: boolean = false;

  constructor(options: DatabaseInitOptions) {
    this.options = {
      pushPath: 'lambdaconnect/push',
      pullPath: 'lambdaconnect/pull',
      dataModelPath: 'data-model',
      bulkPutLimit: 1000,
      disablePull: false,
      disablePush: false,
      rejectionWhitelist: [],
      ...options,
    };
    this.syncInProgress = false;
    Dexie.addons.push(GetSafelyAddPlugin(() => this.getValidationSchema()));
    this.dao = new Dexie(DATABASE_NAME, { autoOpen: false });
    this.registeredViewModels = new Map<string, ViewModel>();
    this.viewModels = [];
    this.isInitialized = false;
  }

  setRequestHeaders(headers: any): void {
    this.requestHeaders = headers;
  }

  getValidationSchema() {
    return this.validationSchema;
  }

  makeServerRequest(
    path: string,
    method: string = 'GET',
    headers?: any,
    body?: any,
    apiVersion: string = 'v1'
  ): Promise<any> {
    return fetch(`${this.options.apiUrl}/${apiVersion}/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...this.requestHeaders,
        ...headers,
      },
      body: typeof body === 'object' ? JSON.stringify(body) : body,
    });
  }

  setReduxStore(store: Store): void {
    this.store = store;

    const defaultEqualityFunction = (left: any, right: any): boolean => left === right;

    this.store.subscribe(() => {
      const state = this.store.getState();
      this.registeredViewModels.forEach((viewModel: ViewModel) => {
        if (!viewModel.stateSelector) {
          return;
        }

        const subState = viewModel.stateSelector(state);
        const equalityFn = viewModel.stateSelectorEqualityFunction || defaultEqualityFunction;
        if (!equalityFn(viewModel.lastReloadState, subState)) {
          viewModel.lastReloadState = subState;
          this.store.dispatch(viewModel.getReloadAction());
        }
      });
    });
  }

  async initialize(options?: DatabaseInitializationOptions): Promise<void> {
    if (!this.store) {
      throw new Error('Redux store is not set');
    }
    try {
      if (options && options.truncate) {
        console.log('Deleting database!');
        await this.dao.delete();
      }

      // download current data model
      // todo: it is worth to implement calculating schema hash on the server-side
      const response = await this.makeServerRequest(this.options.dataModelPath);
      if (response.status !== 200 || !response.headers.get('Content-Type').includes('application/json')) {
        throw new Error('Could not load database model');
      }

      const modelResponse: { model: string } = await (response).json();

      // check if data model is up to date
      const currentSchemaHash: number = Number(window.localStorage.getItem(LOCALSTORAGE_MODEL_HASH_KEY));
      const receivedSchemaHash: number = hashCode(modelResponse.model);
      if (currentSchemaHash !== receivedSchemaHash && currentSchemaHash) {
        // if not - wipe out the whole database if exist
        // todo: reconsider migrations (either with server-side counting or local storage version counter)
        console.log('Truncating the whole database because of model version change');
        this.store.dispatch({type: DATABASE_VERSION_CHANGED})
        if (!this.dao.isOpen()) {
          await this.dao.open();
        }
        await this.dao.delete();
        await this.dao.close();
      }

      if (this.dao.isOpen()) {
        await this.dao.close();
      }


      const { validationSchema, model } = modelParser(modelResponse.model);
      this.model = model;
      this.validationSchema = validationSchema;

      const indexes = (options && options.indexes) || {};
      const schema = Object.keys(this.model.entities)
        .reduce((acc, entityName) => {
          const entity = this.model.entities[entityName];
          if (!entity.syncable) {
            return acc;
          }

          acc[entityName] = ['$$uuid', 'createdAt', 'updatedAt', 'isSuitableForPush', 'syncRevision']
            .concat(Object.keys(entity.attributes)
              .map((attributeName) => entity.attributes[attributeName])
              .filter((attribute) => attribute.attributeType === 'relationship'
                || (attribute.indexed && attribute.name !== 'uuid'))
              .map((attribute) => {
                if (attribute.attributeType === 'relationship' && attribute.toMany) {
                  return `*${attribute.name}`;
                }

                return attribute.name;
              })
              .concat(indexes[entityName] || []))
            .join(',');
          return acc;
        }, {});

      this.dao.version(this.model.version).stores(schema);

      // changes listener (cross-tab observable)
      this.dao.on('changes', (changes, partial) => {
        if (this.isChangesFrozen || partial || changes.length === 0) {
          return;
        }

        // todo: reload optimizations should be based on changes
        this.reloadAllViewModels();
      });

      // isSuitableForPush hooks
      const createHook = (primaryKey, object, transaction) => {
        if (!transaction.__syncTransaction) {
          object.isSuitableForPush = 1;
          if (typeof object.uuid === 'undefined') {
            object.uuid = uuid();
          }
          object.createdAt = object.updatedAt = new Date().toISOString();
          if (typeof object.active === 'undefined') {
            object.active = 1;
          }
          return object.uuid;
        }
      };
      const updateHook = (modifications, primKey, obj, transaction) => {
        if (!transaction.__syncTransaction) {
          if (!Object.keys(modifications).length) {
            return undefined;
          }
          return {
            isSuitableForPush: 1,
            updatedAt: new Date().toISOString(),
            active: typeof modifications.active === 'number' ? modifications.active : 1,
          };
        }
      };

      for (const entityName of Object.keys(this.model.entities)) {
        this.dao.table(entityName).hook('creating', createHook);
        this.dao.table(entityName).hook('updating', updateHook);
        // todo: deletion hook
      }

      try {
        await this.dao.open();
      } catch (e) {
        throw new DatabaseOpenError('Failed to open database');
      }
      // save received model hash as current
      window.localStorage.setItem(LOCALSTORAGE_MODEL_HASH_KEY, receivedSchemaHash);

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

  _publishSyncProgress(percent: number) {
    this.store.dispatch({
      type: DATABASE_SYNC_IN_PROGRESS,
      payload: { percent },
    });
  }

  async _monitoredBulkPut(entitiesToPush: { [string]: [{ isSuitableForPush: boolean }] }, progressScale: number, progressOffset: number) {
    const totalRecords = Object.keys(entitiesToPush)
      .reduce((acc, entityName) => acc + entitiesToPush[entityName].length, 0);
    let processedRecords = 0;
    const progressInterval = setInterval(() => {
      const percent = (processedRecords * progressScale / totalRecords) + progressOffset;
      this._publishSyncProgress(percent);
    }, 500);

    try {
      await this.dao.transaction(
        'rw!',
        Object.keys(entitiesToPush).map((entityName) => this.dao.table(entityName)),
        async () => {
          Dexie.currentTransaction.__syncTransaction = true;

          for (const entityName of Object.keys(entitiesToPush)) {
            const entities = entitiesToPush[entityName];

            for (let currentStart = 0; currentStart < entities.length; currentStart += this.options.bulkPutLimit) {
              const entitiesSlice = entities.slice(currentStart, currentStart + this.options.bulkPutLimit);

              for (const entity of entitiesSlice) {
                entity.isSuitableForPush = false;
              }

              await this.dao.table(entityName).bulkPut((entitiesSlice));

              processedRecords += entitiesSlice.length;
            }
          }
        },
      );
    } finally {
      clearInterval(progressInterval);
    }
  }

  async _syncPush(): Promise<void> {
    this._publishSyncProgress(0);
    const entitiesToPush = {};
    await Promise.mapSeries(Object.keys(this.model.entities), async (entityName) => {
      const entities = await this.dao.table(entityName).where('isSuitableForPush').equals(1).toArray();
      if (entities.length === 0) {
        return;
      }

      // prepare entities to be modeled within a valid schema
      const schema = this.model.entities[entityName];
      const attributes = Object.keys(schema.attributes)
        .filter((key) => key !== 'isSuitableForPush')
        .concat('uuid', 'active', 'createdAt', 'updatedAt', 'syncRevision');
      entitiesToPush[entityName] = entities.map((entity) => {
        const resultEntity = {};

        // pick only attributes that complies to the schema
        for (const attribute of attributes) {
          if (typeof entity[attribute] !== 'undefined') {
            resultEntity[attribute] = entity[attribute];
          }
        }

        return resultEntity;
      });
    });

    if (Object.keys(entitiesToPush).length > 0) {
      const pushResponse = await this.makeServerRequest(this.options.pushPath, 'POST', null, entitiesToPush);
      if (pushResponse.status !== 200) {
        let errorContent;
        try {
          errorContent = await pushResponse.json();
        } catch {
          errorContent = null;
        }
        if (errorContent?.['error-code'] === 42) {
          this.options = {
            ...this.options,
            disablePull: true,
          }
          return;
        }
        throw new DatabaseSyncError(`Error while pushing data to server: ${pushResponse.status}`, {
          pushPayload: entitiesToPush,
          error: errorContent ? errorContent.errors?.english?.push : `Server responded with ${pushResponse.status}`,
          type: 'push',
        });
      }

      const data = await pushResponse.json();

      if (!data.success) {
        throw new DatabaseSyncError('Server responded with an error while pushing data', {
          pushPayload: entitiesToPush,
          error: data.errors?.english
            ? Object.values(data.errors.english)?.[0]
            : `Server responded with error code ${data['error-code']}`,
          type: 'push'
        })
      }

      const checkedRejectedObjects = Object.keys(data['rejected-objects'])
        .filter((key) => !this.options.rejectionWhitelist.includes(key));
      const checkedRejectedFields = Object.keys(data['rejected-fields'])
        .filter((key) => {
          // flatten the rejected-fields of current object and filter out whitelisted field names
          const rejectedNotWhitelistedFields = Object.values(data['rejected-fields'][key])
            .flat().filter((fieldName) => !this.options.rejectionWhitelist.includes(fieldName))
          // remove the key from rejected-fields object when the object has been whitelisted or all of its rejected fields are whitelisted
          return !this.options.rejectionWhitelist.includes(key) && Boolean(rejectedNotWhitelistedFields.length);
        });
      if (checkedRejectedObjects.length || checkedRejectedFields.length) {
        throw new SyncConflictError("The push was malformed", {
          pushPayload: entitiesToPush,
          rejectedFields: data['rejected-fields'],
          rejectedObjects: data['rejected-objects'],
        });
      }
    }
  }

  async _syncPull(): Promise<void> {
    this._publishSyncProgress(50);
    const entityLastRevisions = {};
    await Promise.mapSeries(Object.keys(this.model.entities), async (entityName) => {
      const lastSyncRevision = (await this.dao.table(entityName).orderBy('syncRevision').last() || {}).syncRevision;
      entityLastRevisions[entityName] = lastSyncRevision ? lastSyncRevision + 1 : 0;
    });

    const pullResponse = await this.makeServerRequest(this.options.pullPath, 'POST', {}, entityLastRevisions);
    if (pullResponse.status !== 200) {
      throw new DatabaseSyncError(`Error while pushing data to server: ${pullResponse.status}`, {
        type: 'pull'
      });
    }
    const body = await pullResponse.json();
    if (!body.success) {
      throw new DatabaseSyncError(`Server responded with error code: ${body['error-code']}`, {
        type: 'pull'
      });
    }
    const data = JSON.parse(body.data);

    await this._monitoredBulkPut(data, 25, 75);
  }

  async sync(): Promise<void> {
    this.syncInProgress = true;
    try {
      if (!this.options.disablePush) {
        await this._syncPush();
      }
      if (!this.options.disablePull) {
        await this._syncPull();
      } else {
        // disablePull flag can be set to true
        // if the server responds with "Try again" while pushing data
        this.options = {
          ...this.options,
          disablePull: false,
        }
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
    await Promise.mapSeries(Object.keys(this.model.entities), (entityName) => this.dao.table(entityName).clear());
  }

  setChangesFrozen(isFrozen: boolean) {
    this.isChangesFrozen = isFrozen;
  }

  reloadAllViewModels(): void {
    if (!this.dao.isOpen()) {
      console.warn('Database still not opened, aborting reload');
    }
    console.log(`VM reload count: ${this.registeredViewModels.size}`);
    const { dispatch } = this.store;
    this.registeredViewModels.forEach((viewModel: ViewModel) => {
      viewModel.getReloadAction()(dispatch);
    });
  }

  getReducer(viewModels: Array<ViewModel>): ReducersMapObject {
    this.viewModels = viewModels;
    this.viewModels.forEach(((viewModel) => {
      viewModel.initialize(this);
    }));

    const databaseReducer = (state: DatabaseState = initState, action: DatabaseAction): DatabaseState => {
      switch (action.type) {
        case DATABASE_INITIALIZED:
          return {
            ...initState,
            status: 'offline',
            hasVersionChanged: false,
          };
        case DATABASE_INITIALIZATION_ERROR:
          return {
            ...initState,
            status: 'uninitialized',
            error: action.payload,
          }
        case DATABASE_SYNC_IN_PROGRESS:
          return {
            ...state,
            inProgress: true,
            progressPercent: action.payload.percent,
          };
        case DATABASE_SYNC_FINISHED:
          return {
            ...state,
            inProgress: false,
            error: null,
            status: 'online',
          };
        case DATABASE_SYNC_ERROR:
          return {
            ...state,
            inProgress: false,
            error: action.payload,
            status: 'offline',
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

    const reducers = this.viewModels.reduce((acc: { [string]: Reducer }, viewModel: ViewModel) => {
      acc[viewModel.name] = viewModel.getReducer();
      return acc;
    }, {
      database: databaseReducer,
    });

    return combineReducers(reducers);
  }

  registerViewModel(viewModel: ViewModel, initialReloadParameters: ?any) {
    this.registeredViewModels.set(viewModel.name, viewModel);
    if (this.isInitialized) {
      // todo: maybe a query-revision comparison to optimize query calls?
      viewModel.getReloadAction(initialReloadParameters)(this.store.dispatch);
    }
  }

  unregisterViewModel(viewModel: ViewModel) {
    this.registeredViewModels.delete(viewModel.name);
  }

  clearViewModels(): void {
    if (!this.dao.isOpen()) {
      console.warn('Database is not opened, aborting clear');
    }
    this.registeredViewModels.forEach((viewModel: ViewModel) => {
      this.unregisterViewModel(viewModel);
    })
  }

}
