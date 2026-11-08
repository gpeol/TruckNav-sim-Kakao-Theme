import test from 'node:test';
import assert from 'node:assert/strict';
import { telemetrySocketUrl } from '../app/utils/previewTransport.ts';

test('preview uses a same-origin secure socket while existing clients keep their bridge URL', () => {
    assert.equal(telemetrySocketUrl('device.ts.net', null, false, true, 'https:', 'device.ts.net'), 'wss://device.ts.net/__trucknav/telemetry');
    assert.equal(telemetrySocketUrl('127.0.0.1', null, false, false, 'http:', '127.0.0.1:3001'), 'ws://127.0.0.1:30001');
    assert.equal(telemetrySocketUrl('localhost', '192.168.1.2', true, false, 'http:', 'localhost'), 'ws://192.168.1.2:30001');
});
