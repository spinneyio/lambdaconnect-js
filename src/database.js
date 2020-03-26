//@flow

import Promise from 'bluebird';
import Dexie from 'dexie';
import 'dexie-observable';
import type {Binding} from './view-model';
import ViewModel from './view-model';
import {Action, combineReducers, Reducer, ReducersMapObject, Store} from 'redux';
import fetch from 'isomorphic-fetch';

export type DatabaseState = {
  autoSync: number,
  status: 'uninitialized' | 'offline' | 'online',
  lastSynchronization: number,
  inProgress: bool,
  error: any,
}

export type DatabaseAction = {
  ...Action,
  payload: ?mixed,
}

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

const DATABASE_INITIALIZED = 'DATABASE_INITIALIZED';
const DATABASE_SYNC_IN_PROGRESS = 'DATABASE_SYNC_IN_PROGRESS';
const DATABASE_SYNC_FINISHED = 'DATABASE_SYNC_FINISHED';
const DATABASE_SYNC_ERROR = 'DATABASE_SYNC_ERROR';
const DATABASE_SET_AUTOSYNC = 'DATABASE_SET_AUTOSYNC';

const initState : DatabaseState = {
  autoSync: 10,
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
  apiUrl: string;
  requestHeaders: any;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
    this.dao = new Dexie('lambdaconnect', {autoOpen: false});
    this.registeredViewModels = new Map<string, ViewModel>();
    this.viewModels = [];
  }

  setRequestHeaders(headers: any) : void {
    this.requestHeaders = headers;
  }

  makeServerRequest(path: string, method : string = 'GET', headers?: any, body?: any) : Promise<any> {
    return fetch(`${this.apiUrl}/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...this.requestHeaders,
        ...headers,
      },
      body: typeof body === 'object' ? JSON.stringify(body): body,
    });
  }

  async initialize(model: DatabaseModel, store: Store) : Promise<void> {
    this.model = model;
    this.store = store;

    const schema = Object.keys(model.entities)
                         .reduce((acc, entityName) => {
                           const entity = model.entities[entityName];
                           if (!entity.syncable) {
                             return acc;
                           }
                           acc[entityName] = Object.keys(entity.attributes)
                                                   .filter((key) => entity.hasOwnProperty(key))
                                                   .map(attributeName => entity.attributes[attributeName])
                                                   .filter(attribute => attribute.indexed)
                                                   .map(attribute => attribute.name)
                                                   .concat(['id++', 'uuid', 'isSuitableForPush', 'syncRevision'])
                                                   .join(',');
                           return acc;
                         }, {});

    this.dao.version(this.model.version).stores(schema);
    this.dao.on('changes', (changes, partial) => {
      if (partial || changes.length === 0) {
        return;
      }
      console.log('Detected db change, reloading');
      //todo: reload optimizations should be based on changes
      this.reloadAllViewModels();
    });

    await this.dao.open();
    //todo: reconsider database initialization within redux perist rehydrate
    this.store.dispatch({
      type: DATABASE_INITIALIZED,
    });
  }

  async sync() : Promise<void> {
    this.store.dispatch({
        type: DATABASE_SYNC_IN_PROGRESS,
    });

    const entityLastRevisions = {};
    await Promise.mapSeries(Object.keys(this.model.entities), async (entityName) => {
      entityLastRevisions[entityName] = ((await this.dao.table(entityName).orderBy('syncRevision').last()) || {}).syncRevision || 0;
    });

    console.log(entityLastRevisions);

    const pullResponse = await this.makeServerRequest('lambdaconnect/pull', 'POST', {}, entityLastRevisions);
    if (pullResponse.status !== 200) {
      this.store.dispatch({
        type: DATABASE_SYNC_ERROR,
        payload: pullResponse.status,
      });
      throw new Error('Error while pulling data from server: ' + pullResponse.status);
    }

    const body = await pullResponse.json();
    const data = JSON.parse(body.data);
    console.log(data);

    Object.keys(data).forEach((entityName) => {
      this.dao.table(entityName).bulkAdd(data[entityName]);
    });

    this.store.dispatch({
      type: DATABASE_SYNC_FINISHED,
    });
    this.reloadAllViewModels();
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
        case DATABASE_SET_AUTOSYNC:
          return {
            ...state,
            autoSync: action.payload,
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
    if (this.store) {
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
