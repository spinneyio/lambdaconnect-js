//@flow

import Dexie from 'dexie';
import 'dexie-observable';
import ViewModel from './view-model';
import type {Binding, ViewModelReducer} from './view-model';
import {Action, combineReducers, Reducer, ReducersMapObject, Store} from 'redux';

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

  constructor() {
    this.dao = new Dexie('lambdaconnect', {autoOpen: false});
    this.registeredViewModels = new Map<string, ViewModel>();
    this.viewModels = [];
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
                           acc[entityName] = 'id++,isSuitableForPush,'
                             + Object.keys(entity.attributes)
                                     .map(attributeName => entity.attributes[attributeName])
                                     .filter(attribute => attribute.indexed)
                                     .map(attribute => attribute.name)
                                     .join(',');

                           return acc;
                         }, {});

    this.dao.version(this.model.version).stores(schema);
    this.dao.on('changes', (changes, partial) => {
      if (partial) {
        return;
      }
      this.reloadAllViewModels();
    });

    await this.dao.open();
    this.store.dispatch({
      type: DATABASE_INITIALIZED,
    });


  }

  reloadAllViewModels() : void {
    this.registeredViewModels.forEach((viewModel: ViewModel) => {
      this.store.dispatch(viewModel.getReloadAction());
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
    this.registeredViewModels.set(viewModel.name, viewModel);
  }

  unregisterViewModel(viewModel: ViewModel) {
    this.registeredViewModels.delete(viewModel.name);
  }

  createViewModel(name: string, binding : Binding) : ViewModel {
    const viewModel : ViewModel = new ViewModel(this, name, binding);
    this.viewModels.push(viewModel);

    return viewModel;
  }
}
