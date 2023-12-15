import Database, { DataAccessObject } from "./database";
import { Dispatch } from "react";
import { UnknownAction, Reducer } from "redux";

export type Binding<
  BindingResult,
  Properties = undefined,
  SelectedState = undefined,
> = (
  dao: DataAccessObject,
  properties?: Properties,
  selectedState?: SelectedState,
) => Promise<BindingResult> | BindingResult;

export type ViewModelState<BindingResult, Properties = undefined> = {
  pending: boolean;
  error: unknown | null;
  result: BindingResult | null;
  parameters?: Properties;
};

type ViewModelPendingAction<Name extends string, Parameters> = {
  type: `MV_${Name}_FETCH_PENDING`;
  payload: Parameters;
};

type ViewModelSuccessAction<Name extends string, Result> = {
  type: `MV_${Name}_FETCH_SUCCESS`;
  payload: Result;
};

type ViewModelErrorAction<Name extends string> = {
  type: `MV_${Name}_FETCH_ERROR`;
  error: unknown;
};

type ViewModelAction<Name extends string, Result, Parameters> =
  | ViewModelPendingAction<Name, Parameters>
  | ViewModelSuccessAction<Name, Result>
  | ViewModelErrorAction<Name>
  | { type: "RESET_STATE" };

class ViewModel<
  Name extends string,
  BindingResult,
  Properties = undefined,
  SelectedState = undefined,
> {
  readonly binding: Binding<BindingResult, Properties, SelectedState>;

  private database: Database<Array<this>> | null;

  private mountCount: number;

  readonly name: Name;

  readonly initialParameters: Properties | undefined;

  private _parameters: Properties | undefined;

  private readonly actionTypes: {
    fetchPending: `MV_${string}_FETCH_PENDING`;
    fetchSuccess: `MV_${string}_FETCH_SUCCESS`;
    fetchError: `MV_${string}_FETCH_ERROR`;
  };

  private readonly initialState: ViewModelState<BindingResult, Properties>;

  readonly stateSelector: undefined | ((state: any) => SelectedState);

  readonly stateSelectorEqualityFunction:
    | undefined
    | ((prevState: SelectedState, nextState: SelectedState) => boolean);

  lastReloadState: SelectedState | undefined;

  constructor(
    name: Name,
    binding: Binding<BindingResult, Properties, SelectedState>,
    initialParameters?: Properties,
    stateSelector?: (state: any) => SelectedState,
    stateSelectorEqualityFunction?: (
      prevState: SelectedState,
      nextState: SelectedState,
    ) => boolean,
  ) {
    this.database = null;
    this.name = name;
    this.binding = binding;
    this.mountCount = 0;
    this.initialParameters = initialParameters;
    this._parameters = initialParameters;
    this.stateSelector = stateSelector;
    this.stateSelectorEqualityFunction = stateSelectorEqualityFunction;
    this.lastReloadState = undefined;

    const actionInterfix = name.toUpperCase() as Uppercase<string>;

    this.actionTypes = {
      fetchPending: `MV_${actionInterfix}_FETCH_PENDING` as const,
      fetchSuccess: `MV_${actionInterfix}_FETCH_SUCCESS` as const,
      fetchError: `MV_${actionInterfix}_FETCH_ERROR` as const,
    } as const;

    this.initialState = {
      error: null,
      pending: false,
      result: null,
      parameters: initialParameters,
    };
  }

  initialize(database: Database<Array<this>>) {
    this.database = database;
    if (this.mountCount > 0) {
      this.database.registerViewModel(this);
    }
  }

  private reload(parameters?: Properties): Promise<BindingResult> {
    if (!this.database) {
      return Promise.reject(
        `Could not reload ViewModel ${this.name}: not registered`,
      );
    }

    const selector = this.stateSelector;

    let selectedState: SelectedState | undefined = undefined;
    if (selector) {
      const store = this.database.store;
      if (store) {
        selectedState = selector(store.getState());
      }
    }

    this.lastReloadState = selectedState;

    return Promise.resolve(
      this.binding(this.database.dao, parameters, selectedState),
    );
  }

  getReloadAction(parameters?: Properties) {
    return (dispatch: Dispatch<UnknownAction>) => {
      dispatch({
        type: this.actionTypes.fetchPending,
        payload: parameters,
      });
      this.reload(this._parameters)
        .then((result) => {
          dispatch({
            type: this.actionTypes.fetchSuccess,
            payload: result,
          });
        })
        .catch((error) => {
          console.error(`Error reloading ViewModel '${this.name}'`, error);
          dispatch({
            type: this.actionTypes.fetchError,
            error,
          });
        });
    };
  }

  getReducer(): Reducer<
    ViewModelState<BindingResult, Properties>,
    ViewModelAction<string, BindingResult, Properties>
  > {
    return (state = this.initialState, action) => {
      switch (action.type) {
        case "RESET_STATE":
          return this.initialState;
        case this.actionTypes.fetchPending:
          // not elegant but makes us independent of direct subscribes from the store (allows user to create redux structure as he likes)
          this._parameters = action.payload || state.parameters;
          return {
            ...state,
            pending: true,
            parameters: this._parameters,
          };
        case this.actionTypes.fetchError:
          return {
            ...state,
            error: action.error,
            pending: false,
          };
        case this.actionTypes.fetchSuccess:
          return {
            ...state,
            error: null,
            pending: false,
            result: action.payload,
          };
        default:
          this._parameters = state.parameters ?? undefined;
          return state;
      }
    };
  }

  mount(initialParameters?: Properties) {
    if (this.mountCount === 0 && this.database) {
      this.database.registerViewModel(
        this,
        initialParameters ?? this.initialParameters,
      );
    }
    this.mountCount += 1;
  }

  unmount() {
    if (!this.database) {
      throw new Error(`Could not mount ViewModel ${this.name}: not registered`);
    }
    this.mountCount -= 1;
    if (this.mountCount === 0 && this.database) {
      this.database.unregisterViewModel(this.name);
    }
  }
}

export default ViewModel;
