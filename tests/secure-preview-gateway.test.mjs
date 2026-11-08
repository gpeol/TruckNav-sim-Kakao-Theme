import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { createPreviewGateway } from '../scripts/secure-preview-gateway.mjs';

const hostname = 'device.example.ts.net';
const owner = 'owner@example.test';
const origin = `https://${hostname}`;
const headers = { host: hostname, 'tailscale-user-login': owner };
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const stop = server => new Promise(resolve => server.close(resolve));
function request(port, path, options = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path, method: options.method || 'GET', headers: options.headers || headers }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
        });
        req.on('error', reject);
        req.end();
    });
}

test('preview accepts only the owner and stays read-only', async () => {
    let mutations = 0;
    const ui = http.createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><head></head><body>TruckNav</body></html>');
    });
    const companion = http.createServer((req, res) => {
        if (req.method !== 'GET') mutations++;
        res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        res.end('{"downloaded":true}');
    });
    const bridge = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(bridge, 'listening');
    bridge.on('connection', socket => socket.send('{"game":"ets2"}'));
    const uiPort = await listen(ui);
    const companionPort = await listen(companion);
    const routeSnapshot = {state:'active', points:[[0,0,100],[1,1,0]]};
    const trafficSource = { servers: async () => [{id:2,name:'Simulation 1'}], snapshot: async id => ({serverId:id, vehicles:[]}) };
    const nearbySnapshot = { state:'active', vehicles:[[100,200]] };
    const gateway = createPreviewGateway({ owner, hostname, uiPort, companionPort, telemetryPort: bridge.address().port, gameRouteSource:{get:() => routeSnapshot}, trafficSource, tmpNearbySource:{get:() => nearbySnapshot} });
    const port = await listen(gateway);
    try {
        assert.equal((await request(port, '/', {headers: {host: hostname}})).status, 403);
        assert.equal((await request(port, '/', {headers: {...headers, host:'wrong.example'}})).status, 403);
        assert.equal((await request(port, '/', {headers: {...headers, origin:'https://evil.example'}})).status, 403);
        assert.equal((await request(port, '/', {headers: {...headers, 'sec-fetch-site':'cross-site'}})).status, 403);
        assert.equal((await request(port, '/api/uninstall-map', {method:'POST'})).status, 405);
        assert.equal((await request(port, '/api/download-map')).status, 403);
        assert.equal((await request(port, '/%61pi/download-map')).status, 403);
        assert.equal((await request(port, '/%2561pi/download-map')).status, 403);
        assert.equal((await request(port, '/maps/%2e%2e/api/uninstall-map')).status, 403);
        assert.equal(mutations, 0);
        const page = await request(port, '/');
        assert.equal(page.status, 200);
        assert.match(page.body, /name="trucknav-secure-preview"/);
        assert.match(page.body, /name="trucknav-traffic"/);
        assert.match(page.body, /name="trucknav-tmp-nearby"/);
        assert.equal((await request(port, '/__trucknav/tmp-nearby')).status, 403);
        assert.equal((await request(port, '/__trucknav/traffic/servers', {headers:{host:hostname}})).status, 403);
        assert.equal((await request(port, '/__trucknav/traffic/snapshot?server=2&server=3')).status, 403);
        assert.equal((await request(port, '/__trucknav/traffic/snapshot?server=https://evil.test')).status, 403);
        assert.equal((await request(port, '/__trucknav/traffic/servers', {method:'POST'})).status, 405);
        assert.deepEqual(JSON.parse((await request(port, '/__trucknav/traffic/snapshot?server=2')).body), {serverId:2,vehicles:[]});
        assert.equal(page.headers['x-frame-options'], 'DENY');
        const status = await request(port, '/api/map-status/ets2');
        assert.equal(status.status, 200);
        assert.equal(status.headers['access-control-allow-origin'], undefined);
        const client = new WebSocket(`ws://127.0.0.1:${port}/__trucknav/telemetry`, {headers: {...headers, origin}});
        const [data] = await once(client, 'message');
        assert.equal(data.toString(), '{"game":"ets2"}');
        client.close();
        await once(client, 'close');
        const denied = new WebSocket(`ws://127.0.0.1:${port}/__trucknav/telemetry`, {headers: {...headers, origin:'https://evil.example'}});
        const [error] = await once(denied, 'error');
        assert.match(error.message, /403/);
        const route = new WebSocket(`ws://127.0.0.1:${port}/__trucknav/game-route`, {headers: {...headers, origin}});
        const [snapshot] = await once(route, 'message');
        assert.deepEqual(JSON.parse(snapshot.toString()), routeSnapshot);
        route.send('not allowed');
        const [code] = await once(route, 'close');
        assert.equal(code, 1008);
        const largeRoute = new WebSocket(`ws://127.0.0.1:${port}/__trucknav/game-route`, {headers: {...headers, origin}});
        await once(largeRoute, 'message');
        largeRoute.send('x'.repeat(2048));
        const [largeCode] = await once(largeRoute, 'close');
        assert.equal(largeCode, 1009);
        const deniedRoute = new WebSocket(`ws://127.0.0.1:${port}/__trucknav/game-route`, {headers: {...headers, origin:'https://evil.example'}});
        const [routeError] = await once(deniedRoute, 'error');
        assert.match(routeError.message, /403/);
        const nearby = new WebSocket(`ws://127.0.0.1:${port}/__trucknav/tmp-nearby`, {headers: {...headers, origin}});
        const [nearbyData] = await once(nearby, 'message');
        assert.deepEqual(JSON.parse(nearbyData.toString()), nearbySnapshot);
        nearby.send('not allowed');
        const [nearbyCode] = await once(nearby, 'close');
        assert.equal(nearbyCode, 1008);
        const deniedNearby = new WebSocket(`ws://127.0.0.1:${port}/__trucknav/tmp-nearby`, {headers: {...headers, origin:'https://evil.example'}});
        const [nearbyError] = await once(deniedNearby, 'error');
        assert.match(nearbyError.message, /403/);
    } finally {
        await stop(gateway);
        await stop(ui);
        await stop(companion);
        await new Promise(resolve => bridge.close(resolve));
    }
});

test('a non-default HTTPS port is required in the host and origin', async () => {
    const ui = http.createServer((_req, res) => { res.writeHead(200, {'content-type':'text/html'}); res.end('<head></head>'); });
    const uiPort = await listen(ui);
    const gateway = createPreviewGateway({owner, hostname, httpsPort:3001, uiPort, companionPort:uiPort, telemetryPort:1});
    const port = await listen(gateway);
    try {
        assert.equal((await request(port, '/', {headers:{host:hostname, 'tailscale-user-login':owner}})).status, 403);
        assert.equal((await request(port, '/', {headers:{host:`${hostname}:3001`, 'tailscale-user-login':owner, origin:`https://${hostname}:3001`}})).status, 200);
        assert.equal((await request(port, '/', {headers:{host:`${hostname}:3001`, 'tailscale-user-login':owner, origin:`https://${hostname}`}})).status, 403);
    } finally { await stop(gateway); await stop(ui); }
});
