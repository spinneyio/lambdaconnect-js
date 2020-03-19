//@flow

import Dexie from 'dexie';
import ViewModel from './view-model';
import type {Binding} from './view-model';

export default class Database {
  dao: Dexie;
  viewModels: Map<string, ViewModel>;

  constructor() {
    this.dao = new Dexie('lambdaconnect');
    this.viewModels = new Map<string, ViewModel>();
  }

  async initialize() : Promise<void> {
    this.dao.version(1);
    await this.dao.open();
  }

  getReducer() {

  }

  registerViewModel(viewModel: ViewModel) {
    this.viewModels.set(viewModel.name, viewModel);
  }

  unregisterViewModel(viewModel: ViewModel) {
    this.viewModels.delete(viewModel.name);
  }

  createViewModel(name: string, binding : Binding) {
    const viewModel : ViewModel = new ViewModel(this, name, binding);

    return viewModel
  }
}
