import test from 'node:test';
import assert from 'node:assert/strict';
import { mapFontFamily } from '../app/utils/mapFontFamily.ts';

test('CSS-only fonts use bundled map glyphs', () => {
    assert.equal(mapFontFamily('KakaoBigFont'), 'Commissioner');
    assert.equal(mapFontFamily('KakaoSmallFont'), 'Commissioner');
    assert.equal(mapFontFamily('Roboto'), 'Roboto');
    assert.equal(mapFontFamily(null), 'Commissioner');
});
