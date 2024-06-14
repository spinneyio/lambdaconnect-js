import Database, { DataAccessObject } from "./database";
import ViewModel, { ViewModelState, Binding } from "./view-model";
import useViewModel from "./use-view-model";
import connectViewModel from "./connect-view-model";
import DatabaseSyncError from "./errors/DatabaseSyncError";
import SyncConflictError from "./errors/SyncConflictError";
import DatabaseValidationError from "./errors/DatabaseValidationError";
import getViewModelReducers from "./utils/getReducers";
import authorizedFetch, { setFetchAuthToken } from "./authorized-fetch";

export type { DataAccessObject, Binding, ViewModelState };

export {
  Database,
  ViewModel,
  useViewModel,
  connectViewModel,
  DatabaseSyncError,
  SyncConflictError,
  DatabaseValidationError,
  getViewModelReducers,
  authorizedFetch,
  setFetchAuthToken,
};
