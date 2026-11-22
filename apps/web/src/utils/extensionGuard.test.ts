import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureSafeFetchSetter, isBrowserExtensionError } from './extensionGuard';

test('ensureSafeFetchSetter leaves standard writable fetch untouched', () => {
  const origFetch = () => 'ok';
  const obj: Record<string, unknown> = { fetch: origFetch };
  const patched = ensureSafeFetchSetter(obj);
  assert.equal(patched, false);
  assert.equal(obj.fetch, origFetch);
});

test('ensureSafeFetchSetter prevents TypeError on configurable getter-only fetch while preserving getter', () => {
  const origFetch = () => 'sandbox-fetch';
  const obj: Record<string, unknown> = {};
  Object.defineProperty(obj, 'fetch', {
    configurable: true,
    enumerable: true,
    get: () => origFetch,
  });

  const patched = ensureSafeFetchSetter(obj);
  assert.equal(patched, true);

  assert.doesNotThrow(() => {
    obj.fetch = () => 'extension-override';
  });
  assert.equal(obj.fetch, origFetch);
});

test('ensureSafeFetchSetter safely ignores non-configurable getter-only fetch', () => {
  const origFetch = () => 'locked-fetch';
  const obj: Record<string, unknown> = {};
  Object.defineProperty(obj, 'fetch', {
    configurable: false,
    enumerable: true,
    get: () => origFetch,
  });

  assert.doesNotThrow(() => {
    const patched = ensureSafeFetchSetter(obj);
    assert.equal(patched, false);
  });
});

test('isBrowserExtensionError identifies chrome-extension errors and ignores app errors', () => {
  assert.equal(
    isBrowserExtensionError({
      filename: 'chrome-extension://nimlmejbmnecnaghgmbahmbaddhjbecg/libs/requests.js',
      message: 'Uncaught TypeError: Cannot set property fetch of #<Window> which has only a getter',
      error: null,
    }),
    true,
  );

  assert.equal(
    isBrowserExtensionError({
      filename: '',
      message: 'TypeError: Cannot set property fetch of #<Window> which has only a getter',
      error: {
        stack: 'TypeError: ...\n    at chrome-extension://nimlmejbmnecnaghgmbahmbaddhjbecg/executors/200.js:1:1090',
      },
    }),
    true,
  );

  assert.equal(
    isBrowserExtensionError({
      filename: 'http://localhost:3000/src/App.tsx',
      message: 'TypeError: Cannot read properties of undefined',
      error: { stack: 'TypeError: ...\n    at App (http://localhost:3000/src/App.tsx:10:5)' },
    }),
    false,
  );
});
