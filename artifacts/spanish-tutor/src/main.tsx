import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import App from './App';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.getElementById('app-splash')?.remove();
  });
});

const updateSW = registerSW({
  onNeedRefresh() {
    toast({
      title: 'Update available',
      description: 'A new version of Loquu is ready.',
      action: (
        <ToastAction altText="Reload" onClick={() => updateSW(true)}>
          Reload
        </ToastAction>
      ),
    });
  },
});
