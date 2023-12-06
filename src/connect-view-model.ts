import * as React from "react";
import { ComponentType, useEffect } from "react";

import ViewModel from "./view-model";

export default function (viewModels: ViewModel<string, any, any, any>[]) {
  return <Props extends object>(component: ComponentType<Props>) => {
    return (props: Props) => {
      useEffect(() => {
        viewModels.forEach((viewModel) => {
          viewModel.mount();
        });

        return () =>
          viewModels.forEach((viewModel) => {
            viewModel.unmount();
          });
      }, [viewModels]);

      return React.createElement(component, props);
    };
  };
}
