export type SyncConflictErrorData = {
  rejectedObjects: {[String]: Array<mixed>},
  rejectedFields: {[String]: Array<mixed>},
  pushPayload: {[String]: Array<mixed>}
}

export class SyncConflictError extends Error {
  errorData: SyncConflictErrorData;

  constructor(message: string, errorData: SyncConflictErrorData) {
    super(message);
    this.errorData = errorData;
    this.name = 'SyncConflictError';
  }
}

export default SyncConflictError;
