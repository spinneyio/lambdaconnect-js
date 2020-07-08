// @flow
import type Dexie from 'dexie';
import Database from './database';

export type BindingResult = mixed;
export type Binding = (dao: Dexie, properties?: mixed, selectedState?: mixed) => BindingResult | Promise<BindingResult>;
export type ViewModelState = {
  pending: boolean,
  error: mixed,
  parameters: mixed,
  result: mixed,
};
export type ViewModelAction = {
  type: string,
  error?: mixed,
  payload?: mixed,
};
export type ViewModelReducer = (state: ViewModelState, action: ViewModelAction) => ViewModelState;

export type StateSelector = (any) => any;
export type StateSelectorEqualityFunction = (any, any) => boolean;

class ViewModel {
  binding: Binding;

  database: Database | null;

  mountCount : number;

  name: string;

  initialParameters: mixed;

  _parameters: mixed;

  actions: {
    fetchPending: string,
    fetchSuccess: string,
    fetchError: string,
  };

  initialState: ViewModelState;

  stateSelector: ?StateSelector;

  stateSelectorEqualityFunction: ?StateSelectorEqualityFunction;

  lastReloadState: any;

  constructor(name: string, binding: Binding, initialParameters: mixed,
    stateSelector?: StateSelector, stateSelectorEqualityFunction?: StateSelectorEqualityFunction) {
    this.database = null;
    this.name = name;
    this.binding = binding;
    this.mountCount = 0;
    this.initialParameters = initialParameters;
    this._parameters = initialParameters;
    this.stateSelector = stateSelector;
    this.stateSelectorEqualityFunction = stateSelectorEqualityFunction;
    this.lastReloadState = undefined;

    const actionInterfix = name.toUpperCase();

    this.actions = {
      fetchPending: `MV_${actionInterfix}_FETCH_PENDING`,
      fetchSuccess: `MV_${actionInterfix}_FETCH_SUCCESS`,
      fetchError: `MV_${actionInterfix}_FETCH_ERROR`,
    };
    this.initialState = {
      error: null,
      pending: false,
      result: null,
      parameters: initialParameters,
    };
  }

  initialize(database: Database) {
    this.database = database;
    if (this.mountCount > 0) {
      this.database.registerViewModel(this);
    }
  }

  reload(parameters: ?mixed) : Promise<BindingResult> {
    if (!this.database) {
      return Promise.reject(`Could not reload ViewModel ${this.name}: not registered`);
    }

    const selector: ?StateSelector = this.stateSelector;
    const selectedState = selector ? selector(this.database.store.getState()) : null;
    this.lastReloadState = selectedState;

    return Promise.resolve(this.binding(this.database.dao, parameters, selectedState));
  }

  getReloadAction(parameters: mixed) {
    return (dispatch: (ViewModelAction) => void) => {
      dispatch({
        type: this.actions.fetchPending,
        payload: parameters,
      });
      this.reload(this._parameters)
        .then((result: BindingResult) => {
          dispatch({
            type: this.actions.fetchSuccess,
            payload: result,
          });
        })
        .catch((error) => {
          console.error(`Error reloading ViewModel '${this.name}'`, error);
          dispatch({
            type: this.actions.fetchError,
            error,
          });
        });
    };
  }

  getReducer() : ViewModelReducer {
    return (state: ViewModelState = this.initialState, action: ViewModelAction) => {
      switch (action.type) {
        case this.actions.fetchPending:

          // not elegant but makes us independent from direct subscribes from the store (allows user to create redux structure as he likes)
          this._parameters = action.payload || state.parameters;
          return {
            ...state,
            pending: true,
            parameters: this._parameters,
          };
        case this.actions.fetchError:
          return {
            ...state,
            error: action.error,
            pending: false,
          };
        case this.actions.fetchSuccess:
          return {
            ...state,
            error: null,
            pending: false,
            result: action.payload,
          };
        default:
          this._parameters = state.parameters;
          return state;
      }
    };
  }

  mount(initialParameters: ?any) {
    if (this.mountCount === 0 && this.database) {
      this.database.registerViewModel(this, initialParameters);
    }
    this.mountCount += 1;
  }

  unmount() {
    if (!this.database) {
      throw new Error(`Could not mount ViewModel ${this.name}: not registered`);
    }
    this.mountCount -= 1;
    if (this.mountCount === 0 && this.database) {
      this.database.unregisterViewModel(this);
    }
  }
}

export default ViewModel;
