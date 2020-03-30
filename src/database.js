//@flow

import Promise from 'bluebird';
import Dexie from 'dexie';
import 'dexie-observable';
import {Action, combineReducers, Reducer, ReducersMapObject, Store} from 'redux';
import fetch from 'isomorphic-fetch';
import type {Binding} from './view-model';
import ViewModel from './view-model';
import hashCode from './utils/hashCode';
import modelParser from './utils/modelParser';
import type {DatabaseModel} from './utils/modelParser';

export type DatabaseState = {
  status: 'uninitialized' | 'offline' | 'online',
  lastSynchronization: number,
  inProgress: bool,
  error: any,
}

export type DatabaseAction = {
  ...Action,
  payload: ?mixed,
}

export type DatabaseOptions = {
  apiUrl: string,
  autoSync: number,
  pushPath: string,
  pullPath: string,
  dataModelPath: string,
}

export type DatabaseInitOptions = {
  apiUrl: string,
  autoSync?: number,
  pushPath?: string,
  pullPath?: string,
  dataModelPath?: string,
};

const DATABASE_INITIALIZED = 'DATABASE_INITIALIZED';
const DATABASE_SYNC_IN_PROGRESS = 'DATABASE_SYNC_IN_PROGRESS';
const DATABASE_SYNC_FINISHED = 'DATABASE_SYNC_FINISHED';
const DATABASE_SYNC_ERROR = 'DATABASE_SYNC_ERROR';

const LOCALSTORAGE_MODEL_HASH_KEY = 'lambdaconnect_model_hash';
const DATABASE_NAME = 'lambdaconnect';

const initState : DatabaseState = {
  status: 'uninitialized',
  lastSynchronization: 0,
  inProgress: false,
  error: null,
};

export default class Database {
  dao: Dexie;
  registeredViewModels: Map<string, ViewModel>;
  viewModels: ViewModel[];
  store: Store;
  model: DatabaseModel;
  options: DatabaseOptions;
  requestHeaders: any;
  syncInProgress: boolean;
  isInitialized: boolean;

  constructor(options: DatabaseInitOptions) {
    this.options = {
      autoSync: 0,
      pushPath: 'lambdaconnect/push',
      pullPath: 'lambdaconnect/pull',
      dataModelPath: 'data-model',
      ...options,
    };
    this.syncInProgress = false;
    this.dao = new Dexie(DATABASE_NAME, {autoOpen: false});
    this.registeredViewModels = new Map<string, ViewModel>();
    this.viewModels = [];
    this.isInitialized = false;
  }

  setRequestHeaders(headers: any) : void {
    this.requestHeaders = headers;
  }

  makeServerRequest(path: string, method : string = 'GET', headers?: any, body?: any) : Promise<any> {
    return fetch(`${this.options.apiUrl}/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...this.requestHeaders,
        ...headers,
      },
      body: typeof body === 'object' ? JSON.stringify(body): body,
    });
  }

  setReduxStore(store: Store) : void {
    this.store = store;
  }

  async initialize() : Promise<void> {
    if (!this.store) {
      throw new Error('Redux store is not set');
    }

    // download current data model
    // todo: it is worth to implement calculating schema hash on the server-side
    const modelResponse: {model: string} = await (await this.makeServerRequest(this.options.dataModelPath)).json();

    // check if data model is up to date
    const currentSchemaHash: number = Number(window.localStorage.getItem(LOCALSTORAGE_MODEL_HASH_KEY));
    const receivedSchemaHash: number = hashCode(modelResponse.model);
    if (currentSchemaHash !== receivedSchemaHash && currentSchemaHash) {
      // if not - wipe out the whole database if exist
      //todo: reconsider migrations (either with server-side counting or local storage version counter)
      console.log('Truncating the whole database because of model version change');
      await this.dao.open();
      await this.dao.delete();
      await this.dao.close();
    }

    this.model = modelParser(modelResponse.model);
    console.log(this.model);
    const schema = Object.keys(this.model.entities)
                         .reduce((acc, entityName) => {
                           const entity = this.model.entities[entityName];
                           if (!entity.syncable) {
                             return acc;
                           }
                           acc[entityName] = Object.keys(entity.attributes)
                                                   .filter((key) => entity.hasOwnProperty(key))
                                                   .map(attributeName => entity.attributes[attributeName])
                                                   .filter(attribute => attribute.indexed && attribute.name !== 'uuid')
                                                   .map(attribute => attribute.name)
                                                   .concat(['$$uuid', 'isSuitableForPush', 'syncRevision'])
                                                   .join(',');
                           return acc;
                         }, {});

    this.dao.version(this.model.version).stores(schema);

    // changes listener (cross-tab observable)
    this.dao.on('changes', (changes, partial) => {
      if (partial || changes.length === 0) {
        return;
      }
      console.log('Detected db change, reloading');
      //todo: reload optimizations should be based on changes
      this.reloadAllViewModels();
    });

    // isSuitableForPush hooks
    const createHook = (primaryKey, object) => {
      if (!this.syncInProgress) {
        object.isSuitableForPush = true;
      }
    };
    const updateHook = () => {
      if (!this.syncInProgress) {
        return {
          isSuitableForPush: true,
        };
      }
    };

    for (const entityName of Object.keys(this.model.entities)) {
      this.dao.table(entityName).hook('creating', createHook);
      this.dao.table(entityName).hook('updating', updateHook);
      // todo: deletion hook
    }

    await this.dao.open();
    // save received model hash as current
    window.localStorage.setItem(LOCALSTORAGE_MODEL_HASH_KEY, receivedSchemaHash);

    //todo: reconsider database initialization within redux persist rehydrate
    this.store.dispatch({
      type: DATABASE_INITIALIZED,
    });
    this.isInitialized = true;

    if (this.options.autoSync > 0) {
      setInterval(() => {
        this.sync()
          .then(() => {
            console.log('Autosync completed');
          })
          .catch((error) => {
            console.error('Autosync failed', error);
          });
      }, 1000 * this.options.autoSync);
    }
  }

  async _sync_push() : Promise<void> {
    const entitiesToPush = {};
    await Promise.mapSeries(Object.keys(this.model.entities), async (entityName) => {
      const entities = await this.dao.table(entityName).where('isSuitableForPush').equals(true).toArray();
      if (entities.length === 0) {
        return;
      }
      entitiesToPush[entityName] = entities;
    });
    if (Object.keys(entitiesToPush).length > 0) {
      const pushResponse = await this.makeServerRequest(this.options.pushPath, 'POST', null, entitiesToPush);
      if (pushResponse.status !== 200) {
        throw new Error('Error while pushing data to server: ' + pushResponse.status);
      }

      // update isSuitableForPush fields
      await Promise.mapSeries(Object.keys(entitiesToPush), async (entityName) => {
        const entities = entitiesToPush[entityName];
        // iterating instead of mapping due to performance optimization
        for (const entity of entities) {
          entity.isSuitableForPush = false
        }
        await this.dao.table(entityName).bulkPut((entities));
      });
    }
  }

  async _sync_pull() : Promise<void> {
    const entityLastRevisions = {};
    await Promise.mapSeries(Object.keys(this.model.entities), async (entityName) => {
      entityLastRevisions[entityName] = ((await this.dao.table(entityName).orderBy('syncRevision').last()) || {}).syncRevision || 0;
    });

    console.log(entityLastRevisions);

    const pullResponse = await this.makeServerRequest(this.options.pullPath, 'POST', {}, entityLastRevisions);
    if (pullResponse.status !== 200) {
      throw new Error('Error while pulling data from server: ' + pullResponse.status);
    }

    const body = await pullResponse.json();
    const data = JSON.parse(body.data);
    console.log(data);

    Object.keys(data).forEach((entityName) => {
      const entities = data[entityName];
      for (const entity of entities) {
        entity.isSuitableForPush = 0;
      }

      this.dao.table(entityName).bulkPut(entities);
    });
  }

  async sync() : Promise<void> {
    this.store.dispatch({
        type: DATABASE_SYNC_IN_PROGRESS,
    });
    this.syncInProgress = true;
    try {
      // await this._sync_push();
      await this._sync_pull();

      this.syncInProgress = false;
      this.store.dispatch({
        type: DATABASE_SYNC_FINISHED,
      });
      this.reloadAllViewModels();
    } catch (error) {
      this.syncInProgress = false;
      this.store.dispatch({
        type: DATABASE_SYNC_ERROR,
        payload: error,
      });
      throw error;
    }
  }

  async truncate() : Promise<void> {
    await Promise.mapSeries(Object.keys(this.model.entities), (entityName) => {
      return this.dao.table(entityName).clear();
    });
  }

  reloadAllViewModels() : void {
    if (!this.dao.isOpen()) {
      console.warn('Database still not opened, aborting reload');
    }
    console.log('Reloading all registered view models: ' + this.registeredViewModels.size);
    const dispatch = this.store.dispatch;
    this.registeredViewModels.forEach((viewModel: ViewModel) => {
      viewModel.getReloadAction()(dispatch);
    });
  }

  getReducer() : ReducersMapObject {
    const databaseReducer = (state: DatabaseState = initState, action: DatabaseAction) : DatabaseState => {
      switch (action.type) {
        case DATABASE_INITIALIZED:
          return {
            ...initState,
            status: 'offline',
          };
        case DATABASE_SYNC_IN_PROGRESS:
          return {
            ...state,
            inProgress: true,
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

  registerViewModel(viewModel: ViewModel) {
    console.log('Registered viewModel ' + viewModel.name);
    this.registeredViewModels.set(viewModel.name, viewModel);
    if (this.isInitialized) {
      //todo: maybe a query-revision comparison to optimize query calls?
      viewModel.getReloadAction()(this.store.dispatch);
    }
  }

  unregisterViewModel(viewModel: ViewModel) {
    console.log('Unregistered viewModel ' + viewModel.name);
    this.registeredViewModels.delete(viewModel.name);
  }

  createViewModel(name: string, binding : Binding) : ViewModel {
    const viewModel : ViewModel = new ViewModel(this, name, binding);
    this.viewModels.push(viewModel);

    return viewModel;
  }
}
