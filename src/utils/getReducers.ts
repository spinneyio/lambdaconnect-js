import ViewModel from "../view-model";

function getViewModelReducers<
  T extends Record<string, ViewModel<string, any, any, any>>,
>(
  record: T,
): {
  [Key in keyof T]: ReturnType<T[Key]["getReducer"]>;
} {
  const reducerType: Partial<{
    [Key in keyof T]: ReturnType<T[Key]["getReducer"]>;
  }> = {};

  for (const key in record) {
    reducerType[key] = record[key]!.getReducer() as ReturnType<
      T[typeof key]["getReducer"]
    >;
  }

  return reducerType as {
    [Key in keyof T]: ReturnType<T[Key]["getReducer"]>;
  };
}

export default getViewModelReducers;
