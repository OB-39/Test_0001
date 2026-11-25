import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculerZoneCaptureQr,
  calculerZoomDepuisPincement,
  normaliserFacteurZoom,
} from './qrScannerZoom';

test('normaliserFacteurZoom borne et arrondit proprement les facteurs de zoom', () => {
  assert.equal(normaliserFacteurZoom(0.2, 1, 4), 1);
  assert.equal(normaliserFacteurZoom(9.5, 1, 4), 4);
  assert.equal(normaliserFacteurZoom(2.345, 1, 4), 2.35);
  assert.equal(normaliserFacteurZoom(Number.NaN, 1, 4), 1);
});

test('calculerZoneCaptureQr recadre au centre et plafonne la resolution pour decodage fluide', () => {
  const z1 = calculerZoneCaptureQr(1280, 720, 1, 480);
  assert.equal(z1.sw, 720);
  assert.equal(z1.sh, 720);
  assert.equal(z1.sx, 280);
  assert.equal(z1.sy, 0);
  assert.equal(z1.dw, 480);
  assert.equal(z1.dh, 480);

  const z2 = calculerZoneCaptureQr(1280, 720, 2, 480);
  assert.equal(z2.sw, 360);
  assert.equal(z2.sh, 360);
  assert.equal(z2.sx, 460);
  assert.equal(z2.sy, 180);
  assert.equal(z2.dw, 360);
  assert.equal(z2.dh, 360);

  const z3 = calculerZoneCaptureQr(1920, 1080, 3, 480);
  assert.equal(z3.sw, 360);
  assert.equal(z3.sh, 360);
  assert.equal(z3.sx, 780);
  assert.equal(z3.sy, 360);
  assert.equal(z3.dw, 360);
  assert.equal(z3.dh, 360);
});

test('calculerZoomDepuisPincement gere les gestes multi-touch sans debordement', () => {
  assert.equal(calculerZoomDepuisPincement(100, 200, 1, 1, 4), 2);
  assert.equal(calculerZoomDepuisPincement(100, 500, 1.5, 1, 4), 4);
  assert.equal(calculerZoomDepuisPincement(100, 20, 1.5, 1, 4), 1);
  assert.equal(calculerZoomDepuisPincement(5, 200, 2, 1, 4), 2);
});
