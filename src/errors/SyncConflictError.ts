export type SyncConflictErrorData = {
  rejectedObjects: Record<string, Array<any>>;
  rejectedFields: Record<string, Array<any>>;
  pushPayload: Record<string, Array<any>>;
};

export class SyncConflictError extends Error {
  errorData: SyncConflictErrorData;

  constructor(message: string, errorData: SyncConflictErrorData) {
    super(message);
    this.errorData = errorData;
    this.name = "SyncConflictError";
  }
}

export default SyncConflictError;
