class DatabaseOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseOpenError';
  }
}

export default DatabaseOpenError;
