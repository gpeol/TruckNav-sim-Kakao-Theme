import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createTmpNearbySource } from '../scripts/tmp-nearby-source.mjs';

test('native shared memory reaches the read-only source and disappears with its producer',
    { skip: !process.env.TRUCKNAV_TEST_NEARBY_WRITER, timeout: 15000 }, async () => {
        const writer = spawn(process.env.TRUCKNAV_TEST_NEARBY_WRITER, [], { windowsHide: true });
        let source;
        try {
            const [output] = await once(writer.stdout, 'data');
            assert.match(output.toString(), /ready/);
            source = createTmpNearbySource();
            let snapshot;
            for (let i = 0; i < 20; i++) {
                await delay(100);
                snapshot = source.get();
                if (snapshot.state === 'active') break;
            }
            assert.deepEqual(snapshot, { state: 'active', vehicles: [[123.25, -456.75], [-100, 200]] });
            writer.kill();
            await once(writer, 'exit');
            for (let i = 0; i < 30 && source.get().state !== 'unavailable'; i++) await delay(100);
            assert.deepEqual(source.get(), { state: 'unavailable', vehicles: [] });
        } finally {
            source?.stop();
            if (!writer.killed) writer.kill();
        }
    });
