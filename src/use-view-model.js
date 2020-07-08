// @flow
import { useEffect } from 'react';

import type ViewModel from './view-model';

export default function (viewModels: Array<ViewModel> | ViewModel) {
  useEffect(() => {
    const models = Array.isArray(viewModels) ? viewModels : [viewModels];
    models.forEach((viewModel: ViewModel) => {
      viewModel.mount();
    });

    return () => models.forEach((viewModel: ViewModel) => {
      viewModel.unmount();
    });
  }, [viewModels]);
}
