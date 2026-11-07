import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, mapThemes } from '../app/utils/theme.ts';
import { applyMapTheme } from '../app/utils/mapTheme.ts';

test('device clock changes exactly at 06:00 and 18:00', () => {
    for (const [hour, expected] of [[0,'night'], [5,'night'], [6,'day'], [12,'day'], [17,'day'], [18,'night'], [23,'night']]) {
        assert.equal(resolveTheme('auto', 'device', hour), expected);
    }
});
test('manual modes override both clocks', () => {
    assert.equal(resolveTheme('day', 'game', 23, 'Mon 23:00', true), 'day');
    assert.equal(resolveTheme('night', 'device', 12), 'night');
});
test('game clock overrides device only when connected with a valid time', () => {
    assert.equal(resolveTheme('auto', 'game', 12, 'Mon 23:00', true), 'night');
    assert.equal(resolveTheme('auto', 'game', 23, 'Tue 06:00', true), 'day');
    assert.equal(resolveTheme('auto', 'game', 12, 'Mon 23:00', false), 'day');
    assert.equal(resolveTheme('auto', 'game', 23, 'invalid', true), 'night');
    assert.equal(resolveTheme('auto', 'game', 12, 'Mon 25:00', true), 'day');
    assert.equal(resolveTheme('auto', 'device', 12, 'Mon 23:00', true), 'day');
});
test('theme changes paint for existing map layers without replacing map state', () => {
    const layers = new Set(['background','roads','city-labels','water','prefab-zones']);
    const paints = new Map();
    const map = {
        getLayer: id => layers.has(id),
        setPaintProperty: (id, property, value) => {
            assert.ok(layers.has(id));
            paints.set(`${id}/${property}`, value);
        },
    };
    applyMapTheme(map, mapThemes.day);
    assert.equal(paints.get('roads/line-color'), mapThemes.day.roadColor);
    assert.equal(paints.get('city-labels/text-color'), mapThemes.day.text);
    applyMapTheme(map, mapThemes.night);
    assert.equal(paints.get('background/background-color'), mapThemes.night.backgroundColor);
    assert.equal(paints.get('roads/line-color'), mapThemes.night.roadColor);
    assert.equal(paints.get('city-labels/text-color'), mapThemes.night.text);
    assert.equal(paints.get('city-labels/text-halo-color'), mapThemes.night.halo);
});
