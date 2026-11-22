export interface ErrorEventLike {
  filename?: string;
  message?: string;
  error?: { stack?: string } | null;
  preventDefault: () => void;
  stopImmediatePropagation: () => void;
}

/**
 * Ensures a configurable getter-only `fetch` descriptor (e.g. from a sandboxed
 * preview host) tolerates assignments from third-party browser extensions
 * without throwing `TypeError: Cannot set property fetch` and without altering
 * the underlying `fetch` implementation.
 */
export function ensureSafeFetchSetter(target: object): boolean {
  try {
    const desc = Object.getOwnPropertyDescriptor(target, 'fetch');
    if (desc && typeof desc.get === 'function' && !desc.set && desc.configurable) {
      Object.defineProperty(target, 'fetch', {
        configurable: true,
        enumerable: desc.enumerable ?? true,
        get: desc.get,
        set() {
          // Ignore attempts by browser extensions to overwrite a getter-only fetch.
        },
      });
      return true;
    }
  } catch {
    // Non-configurable descriptor or restricted host object; ignore safely.
  }
  return false;
}

/**
 * Returns true if an ErrorEvent originates strictly from a browser extension
 * script (e.g. `chrome-extension://` or `moz-extension://`).
 */
export function isBrowserExtensionError(event: Pick<ErrorEventLike, 'filename' | 'message' | 'error'>): boolean {
  const filename = typeof event.filename === 'string' ? event.filename : '';
  if (
    filename.startsWith('chrome-extension://') ||
    filename.startsWith('moz-extension://') ||
    filename.startsWith('safari-extension://')
  ) {
    return true;
  }

  const stack = typeof event.error?.stack === 'string' ? event.error.stack : '';
  const message = typeof event.message === 'string' ? event.message : '';
  return (
    (stack.includes('chrome-extension://') || stack.includes('moz-extension://')) &&
    message.includes('Cannot set property fetch')
  );
}

export function installExtensionErrorGuard(win: Window = window): void {
  ensureSafeFetchSetter(win);
  win.addEventListener(
    'error',
    (event) => {
      if (isBrowserExtensionError(event)) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true,
  );
}
