//@flow
import * as React from 'react'
import type ViewModel from './view-model';

export type UseViewModelHOC = (component: React.AbstractComponent<any>) => React.AbstractComponent<any>;

export default function(viewModels: ViewModel[]) : UseViewModelHOC {
    return (component: React.AbstractComponent<any>) => {
      return class extends React.Component<any> {
        componentDidMount(): * {
          viewModels.forEach((viewModel: ViewModel) => {
            viewModel.mount();
          });
        }

        componentWillUnmount(): * {
          viewModels.forEach((viewModel: ViewModel) => {
            viewModel.unmount();
          });
        }

        render(): React$Element<*> {
          return React.createElement(component, this.props);
        }
      }
    };
  }
