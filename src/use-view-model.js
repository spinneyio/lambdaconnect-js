// @flow
import { useEffect, useRef } from 'react';
import type ViewModel from './view-model';

export default function (viewModels: Array<ViewModel> | ViewModel, initialParameters: ?any) {
  const viewModelsRef = useRef<Array<ViewModel>>(
    Array.isArray(viewModels) ? viewModels : [viewModels],
  );
  const initialParametersRef = useRef<?any>(initialParameters);

  useEffect(() => {
    const models = viewModelsRef.current;
    const params = initialParametersRef.current;
    models.forEach((viewModel: ViewModel) => {
      viewModel.mount(params);
    });

    return () => models.forEach((viewModel: ViewModel) => {
      viewModel.unmount();
    });
  }, [viewModelsRef, initialParametersRef]);
}
