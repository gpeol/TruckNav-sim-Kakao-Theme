import test from 'node:test';
import assert from 'node:assert/strict';
import { matchGameRouteNodes } from '../app/utils/matchGameRoute.ts';

test('matches the connected game route even when closer nodes belong to another road', () => {
    const graph = new Map([[1,[{to:2}]], [2,[{to:3}]], [4,[{to:5}]]]);
    const groups = [
        [{id:1,distance:3}, {id:4,distance:1}],
        [{id:2,distance:3}, {id:5,distance:1}],
        [{id:3,distance:3}],
    ];
    assert.deepEqual(matchGameRouteNodes(groups, graph), [1,2,3]);
    assert.equal(matchGameRouteNodes(groups.slice().reverse(), graph), null);
    assert.equal(matchGameRouteNodes([groups[0], [], groups[2]], graph), null);
    assert.equal(matchGameRouteNodes([groups[0]], graph), null);
});
