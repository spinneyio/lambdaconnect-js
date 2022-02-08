export type ErrorData = {
  error?: string,
  pushPayload?: {[string]: Array<any>},
  origin?: Error,
  type: 'push' | 'pull',
}

class DatabaseSyncError extends Error {
  errorData: ErrorData;

  constructor(message: string, errorData: ErrorData) {
    super(message);
    this.errorData = errorData;
    this.name = 'DatabaseSyncError';
  }
}

export default DatabaseSyncError;
