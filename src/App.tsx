import { AppLayout } from './components/layout/AppLayout';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { AppProviders } from './providers/AppProviders';

export default function App(): JSX.Element {
  return (
    <AppProviders>
      <AppLayout />
      <PwaUpdatePrompt />
    </AppProviders>
  );
}
