//@flow

import Dexie from 'dexie';
import ViewModel from './view-model';
import type {Binding, ViewModelReducer} from './view-model';
import {combineReducers, ReducersMapObject} from 'redux';

export default class Database {
  dao: Dexie;
  registeredViewModels: Map<string, ViewModel>;
  viewModels: ViewModel[];

  constructor() {
    this.dao = new Dexie('lambdaconnect');
    this.registeredViewModels = new Map<string, ViewModel>();
    this.viewModels = [];
  }

  async initialize() : Promise<void> {
    this.dao.version(1);
    await this.dao.open();
  }

  getReducer() : ReducersMapObject {
    const reducers = this.viewModels.reduce((acc: { [string]: ViewModelReducer }, viewModel: ViewModel) => {
      acc[viewModel.name] = viewModel.getReducer();
      return acc;
    }, {});

    return combineReducers(reducers);
  }

  registerViewModel(viewModel: ViewModel) {
    this.registeredViewModels.set(viewModel.name, viewModel);
  }

  unregisterViewModel(viewModel: ViewModel) {
    this.registeredViewModels.delete(viewModel.name);
  }

  createViewModel(name: string, binding : Binding) {
    const viewModel : ViewModel = new ViewModel(this, name, binding);
    this.viewModels.push(viewModel);

    return viewModel
  }
}
