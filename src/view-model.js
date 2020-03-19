//@flow
import type Dexie from 'dexie';
import Database from './database';

export type BindingResult = mixed;
export type Binding = (dao: Dexie, properties?: mixed) => BindingResult | Promise<BindingResult>;
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

class ViewModel {
  binding: Binding;
  database: Database;
  mountCount : number;
  name: string;
  initialParameters: mixed;
  actions: {
    fetchPending: string,
    fetchSuccess: string,
    fetchError: string,
  };
  initialState: ViewModelState;

  constructor(database: Database, name: string, binding: Binding, initialParameters: mixed) {
    this.database = database;
    this.name = name;
    this.binding = binding;
    this.mountCount = 0;
    this.initialParameters = initialParameters;

    const actionInterfix = name.toUpperCase();

    this.actions = {
      fetchPending: `MV_${actionInterfix}_FETCH_PENDING`,
      fetchSuccess: `MV_${actionInterfix}_FETCH_SUCCESS`,
      fetchError: `MV_${actionInterfix}_FETCH_ERROR`
    };
    this.initialState = {
      error: null,
      pending: false,
      result: null,
      parameters: initialParameters,
    };
  }

  reload(parameters: ?mixed) : Promise<BindingResult> {
    return Promise.resolve(this.binding(this.database.dao, parameters))
  }

  getReloadAction(parameters: mixed) {
    return (dispatch: (ViewModelAction) => void) => {
      dispatch({
        type: this.actions.fetchPending,
        payload: parameters,
      });
      this.reload(parameters)
        .then((result: BindingResult) => {
          dispatch({
            type: this.actions.fetchSuccess,
            payload: result,
          });
        })
        .catch((error) => {
          dispatch({
            type: this.actions.fetchError,
            error,
          });
        });
    }
  }

  getReducer() : ViewModelReducer {
      return (state: ViewModelState = this.initialState, action: ViewModelAction) => {
        switch (action.type) {
          case this.actions.fetchPending:
            return {
              ...state,
              pending: true,
              parameters: action.payload,
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
            return state;
        }
      };
  }

  mount() {
    if (this.mountCount === 0) {
      this.database.registerViewModel(this);
    }
    this.mountCount += 1;
  }

  unmount() {
    this.mountCount -= 1;
    if (this.mountCount === 0) {
      this.database.unregisterViewModel(this);
    }
  }
}

export default ViewModel;
