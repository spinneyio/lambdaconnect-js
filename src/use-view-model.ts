import { useEffect, useRef } from "react";
import ViewModel from "./view-model";

export default function <Properties>(
  viewModels:
    | Array<ViewModel<string, any, Properties, any>>
    | ViewModel<string, any, Properties, any>,
  initialParameters?: Properties,
) {
  const viewModelsRef = useRef<Array<ViewModel<string, any, Properties, any>>>(
    Array.isArray(viewModels) ? viewModels : [viewModels],
  );
  const initialParametersRef = useRef<Properties | undefined>(
    initialParameters,
  );

  useEffect(() => {
    const models = viewModelsRef.current;
    const params = initialParametersRef.current;
    models.forEach((viewModel) => {
      viewModel.mount(params);
    });

    return () =>
      models.forEach((viewModel) => {
        viewModel.unmount();
      });
  }, [viewModelsRef, initialParametersRef]);
}
