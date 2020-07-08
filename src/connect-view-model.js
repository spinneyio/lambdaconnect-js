//@flow
import * as React from 'react'
import { useEffect } from 'react';

import type ViewModel from './view-model';

export type ConnectViewModelHOC = (component: React.AbstractComponent<any>) => React.AbstractComponent<any>;

export default function(viewModels: ViewModel[]) : ConnectViewModelHOC {
  return (component: React.AbstractComponent<any>) => {
    return (props) => {
      useEffect(() => {
        viewModels.forEach((viewModel: ViewModel) => {
          viewModel.mount();
        });

        return () => viewModels.forEach((viewModel: ViewModel) => {
          viewModel.unmount();
        });
      }, [viewModels])

      return React.createElement(component, props);
    };
  };
}
