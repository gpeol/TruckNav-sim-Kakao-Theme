import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTurnDistance } from '../app/utils/turnDistance.ts';

test('turn distances use readable metric and imperial units', () => {
    assert.deepEqual(formatTurnDistance(0.039, 'km'), {value:39, unit:'m'});
    assert.deepEqual(formatTurnDistance(1.26, 'km'), {value:1.3, unit:'km'});
    assert.deepEqual(formatTurnDistance(0.039, 'mi'), {value:130, unit:'ft'});
    assert.deepEqual(formatTurnDistance(2, 'mi'), {value:1.2, unit:'mi'});
    assert.deepEqual(formatTurnDistance(-1, 'km'), {value:0, unit:'m'});
});
