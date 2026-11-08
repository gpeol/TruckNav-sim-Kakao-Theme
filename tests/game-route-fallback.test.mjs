import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { ref, watch, effectScope, nextTick } from 'vue';

test('unmatched game route releases ownership and calculates the active job destination', async () => {
    const source = (await readFile(new URL('../app/components/map/map.vue', import.meta.url), 'utf8')).replace(/\r/g, '');
    const start = source.indexOf('// Match the validated game route');
    const end = source.indexOf('watch(\n    () => activeSettings.value.themeColor', start);
    // Exercise the component watchers, including the reactive failure transition.
    const watchers = source.slice(start, end).replace(/\r/g, '');
    assert.ok(start >= 0 && end > start);
    const calls = [];
    const state = {
        gameRouteKey: ref(''), failedGameRouteKey: ref(''), appliedGameRouteKey: '',
        loading: ref(false), isWorkerReady: ref(true), isCalculatingRoute: ref(false),
        isTruckSpawned: ref(true), gameConnected: ref(true), truckCoords: ref([1, 2]),
        gameRouteWaypoints: ref([[20, 30]]), gameRoutePoints: ref([[1, 2, 100], [20, 30, 0]]),
        gameRouteOwned: ref(false), currentJobKey: ref(''), waypointList: ref([]),
        truckHeading: ref(0), scale: ref(19), mapScaleConfig: ref({ ruralScale: 19 }), averageSpeed: ref(0),
        routeFound: ref(null), hasActiveJob: ref(true), destinationCity: ref('city'), destinationCompany: ref('company'),
        isClickingEnabled: ref(true), isRouteActive: ref(false), activeSettings: ref({ lastDestination: null }),
        routeTimer: null, clearTimeout,
        convertEts2ToGeo: (x, z) => [x, z],
        findDestinationCoords: () => [7, 8],
        clearRouteState: () => {}, stopNavigationMode: () => {},
        handleMultiRouteCalculation: async () => { state.routeFound.value = false; },
        handleRouteClick: async (...args) => calls.push(args), watch,
    };
    const scope = effectScope();
    try {
        scope.run(() => vm.runInNewContext(watchers, state));
        state.gameRouteKey.value = 'game-route';
        await nextTick(); await new Promise(resolve => setTimeout(resolve, 0)); await nextTick();
        assert.equal(state.failedGameRouteKey.value, 'game-route');
        assert.equal(state.gameRouteOwned.value, false);
        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0][0], [7, 8]);
        assert.equal(state.currentJobKey.value, 'city|company');
    } finally { scope.stop(); }
});
