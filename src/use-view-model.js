// @flow
import { useEffect } from 'react';

import type ViewModel from './view-model';

export default function (viewModels: Array<ViewModel> | ViewModel, initialParameters: ?any) {
  useEffect(() => {
    const models = Array.isArray(viewModels) ? viewModels : [viewModels];
    models.forEach((viewModel: ViewModel) => {
      viewModel.mount(initialParameters);
    });

    return () => models.forEach((viewModel: ViewModel) => {
      viewModel.unmount();
    });
  }, [viewModels]);
}
