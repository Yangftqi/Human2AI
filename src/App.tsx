import React, { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { StudioPage } from './pages/StudioPage';
import { WinPopupPage } from './pages/WinPopupPage';
import { AndroidOverlayPage } from './pages/AndroidOverlayPage';

type RouteKey = 'studio' | 'popup' | 'overlay';

function parseHashRoute(): RouteKey {
  const hash = window.location.hash.toLowerCase();
  if (hash.startsWith('#/popup')) return 'popup';
  if (hash.startsWith('#/overlay') || hash.startsWith('#/keyboard')) return 'overlay';
  return 'studio';
}

export const App: React.FC = () => {
  const hydrate = useAppStore((s) => s.hydrate);
  const hydrated = useAppStore((s) => s.hydrated);
  const [route, setRoute] = useState<RouteKey>(() => parseHashRoute());

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void hydrate().then((fn) => {
      cleanup = fn;
    });
    const onHashChange = () => setRoute(parseHashRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => {
      cleanup?.();
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [hydrate]);

  if (!hydrated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#09090b] font-mono text-[11px] tracking-[0.16em] text-zinc-500 uppercase">
        Human2AI · Loading
      </div>
    );
  }

  if (route === 'popup') return <WinPopupPage />;
  if (route === 'overlay') return <AndroidOverlayPage />;
  return <StudioPage />;
};

export default App;
