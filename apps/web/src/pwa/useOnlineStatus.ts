import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  const [estEnLigne, setEstEnLigne] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const onOnline = () => setEstEnLigne(true);
    const onOffline = () => setEstEnLigne(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return estEnLigne;
}
