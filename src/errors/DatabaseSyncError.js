class DatabaseSyncError extends Error {
    constructor(message: string, error_data: { error_code?: number, errors?: any }) {
        super(message);
        this.error_data = error_data;
        this.name = "DatabaseSyncError";
    }
}
export default DatabaseSyncError;