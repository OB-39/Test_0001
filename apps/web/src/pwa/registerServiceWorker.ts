export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          if (registration.waiting) {
            window.dispatchEvent(
              new CustomEvent('enp-sw-update', { detail: { registration } }),
            );
          }

          registration.addEventListener('updatefound', () => {
            const nouveauWorker = registration.installing;
            if (!nouveauWorker) return;
            nouveauWorker.addEventListener('statechange', () => {
              if (
                nouveauWorker.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                window.dispatchEvent(
                  new CustomEvent('enp-sw-update', { detail: { registration } }),
                );
              }
            });
          });
        })
        .catch(() => {
          // Enregistrement Service Worker non critique
        });
    });
  }
}
