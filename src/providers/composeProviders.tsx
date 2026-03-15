import { type ComponentType, type PropsWithChildren } from 'react';

export type ComposableProvider = ComponentType<PropsWithChildren>;

export function composeProviders(
  providers: readonly ComposableProvider[],
): ComposableProvider {
  function ComposedProviders({ children }: PropsWithChildren): JSX.Element {
    return providers.reduceRight<JSX.Element>(
      (accumulatedTree: JSX.Element, ProviderComponent: ComposableProvider): JSX.Element => (
        <ProviderComponent>{accumulatedTree}</ProviderComponent>
      ),
      <>{children}</>,
    );
  }

  return ComposedProviders;
}
