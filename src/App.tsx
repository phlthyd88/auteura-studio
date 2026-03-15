import { AppLayout } from './components/layout/AppLayout';
import { AppProviders } from './providers/AppProviders';

export default function App(): JSX.Element {
  return (
    <AppProviders>
      <AppLayout />
    </AppProviders>
  );
}
