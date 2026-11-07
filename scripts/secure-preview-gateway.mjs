import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { createGameRouteSource } from './game-route-source.mjs';
import { createTruckersMpTrafficSource } from './truckersmp-traffic-source.mjs';
import { createTmpNearbySource } from './tmp-nearby-source.mjs';

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const TELEMETRY_PATH = '/__trucknav/telemetry';
const GAME_ROUTE_PATH = '/__trucknav/game-route';
const TMP_NEARBY_PATH = '/__trucknav/tmp-nearby';

/**
 * Read-only gateway for a Tailscale Serve preview. It must listen on loopback:
 * Tailscale Serve strips spoofed identity headers before adding its own.
 */
export function createPreviewGateway({ owner, hostname, httpsPort = 443, uiPort, companionPort, telemetryPort, gameRouteSource = null, trafficSource = null, tmpNearbySource = null }) {
    if (!owner || !hostname || !/^[a-z0-9.-]+\.ts\.net$/i.test(hostname)) {
        throw new Error('A Tailscale owner and ts.net hostname are required');
    }
    const expectedHost = hostname.toLowerCase().replace(/\.$/, '');
    if (!Number.isInteger(httpsPort) || httpsPort < 1 || httpsPort > 65535) throw new Error('Invalid HTTPS port');
    const authority = httpsPort === 443 ? expectedHost : `${expectedHost}:${httpsPort}`;
    const expectedOrigin = `https://${authority}`;
    const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });

    function authorized(req, isUpgrade = false) {
        const host = String(req.headers.host || '').toLowerCase();
        const matchesHost = host === authority || (httpsPort === 443 && host === `${expectedHost}:443`);
        const login = String(req.headers['tailscale-user-login'] || '').toLowerCase();
        const origin = req.headers.origin;
        const site = req.headers['sec-fetch-site'];
        return matchesHost && login === owner.toLowerCase() &&
            (!origin || origin === expectedOrigin) && (!isUpgrade || origin === expectedOrigin) &&
            (!site || site === 'same-origin' || site === 'none');
    }

    function parsePath(raw) {
        if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
        try {
            let decoded = raw.split('?')[0];
            for (let i = 0; i < 2; i++) decoded = decodeURIComponent(decoded);
            if (decoded.includes('\\') || decoded.includes('\0') || /(^|\/)\.\.?($|\/)/.test(decoded)) return null;
            return new URL(raw, 'http://localhost').pathname;
        } catch { return null; }
    }

    function reject(res, status) {
        res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        res.end(status === 403 ? 'Forbidden' : status === 405 ? 'Read-only preview' : 'Unavailable');
    }

    function proxy(req, res, port, injectPreviewMarker) {
        const headers = { host: `127.0.0.1:${port}`, 'accept-encoding': 'identity' };
        for (const name of ['accept', 'accept-language', 'range', 'if-none-match', 'if-modified-since', 'user-agent']) {
            if (req.headers[name]) headers[name] = req.headers[name];
        }
        const upstream = http.request({ host: '127.0.0.1', port, method: req.method, path: req.url, headers }, response => {
            const type = String(response.headers['content-type'] || '');
            const responseHeaders = {};
            for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'location']) {
                if (response.headers[name] !== undefined) responseHeaders[name] = response.headers[name];
            }
            responseHeaders['x-content-type-options'] = 'nosniff';
            responseHeaders['x-frame-options'] = 'DENY';
            responseHeaders['referrer-policy'] = 'no-referrer';
            responseHeaders['content-security-policy'] = "frame-ancestors 'none'";
            responseHeaders['cache-control'] = 'no-store';
            if (injectPreviewMarker && req.method === 'GET' && response.statusCode === 200 && type.includes('text/html')) {
                let length = 0;
                const chunks = [];
                response.on('data', chunk => {
                    length += chunk.length;
                    if (length > MAX_HTML_BYTES) { upstream.destroy(); response.destroy(); if (!res.headersSent) reject(res, 502); return; }
                    chunks.push(chunk);
                });
                response.on('end', () => {
                    if (res.writableEnded) return;
                    const html = Buffer.concat(chunks).toString('utf8');
                    if (!html.includes('</head>')) return reject(res, 502);
                    const routeMarker = gameRouteSource ? '<meta name="trucknav-game-route" content="1">' : '';
                    const trafficMarker = trafficSource ? '<meta name="trucknav-traffic" content="1">' : '';
                    const nearbyMarker = tmpNearbySource ? '<meta name="trucknav-tmp-nearby" content="1">' : '';
                    const modified = Buffer.from(html.replace('</head>', `<meta name="trucknav-secure-preview" content="1">${routeMarker}${trafficMarker}${nearbyMarker}</head>`));
                    responseHeaders['content-length'] = modified.length;
                    res.writeHead(response.statusCode, responseHeaders);
                    res.end(modified);
                });
            } else {
                res.writeHead(response.statusCode || 502, responseHeaders);
                response.pipe(res);
            }
        });
        upstream.on('error', () => { if (!res.headersSent) reject(res, 502); else res.destroy(); });
        req.on('aborted', () => upstream.destroy());
        upstream.end();
    }

    const server = http.createServer((req, res) => {
        if (!authorized(req)) return reject(res, 403);
        if (req.method !== 'GET' && req.method !== 'HEAD') return reject(res, 405);
        const path = parsePath(req.url);
        if (!path) return reject(res, 403);
        if (path.startsWith('/__trucknav/traffic/')) {
            if (!trafficSource || req.method !== 'GET') return reject(res, 403);
            const url = new URL(req.url, 'http://localhost');
            let task;
            if (path === '/__trucknav/traffic/servers' && !url.search) task = trafficSource.servers();
            else if (path === '/__trucknav/traffic/snapshot' && [...url.searchParams.keys()].length === 1 && /^\d{1,4}$/.test(url.searchParams.get('server') || '')) {
                task = trafficSource.snapshot(Number(url.searchParams.get('server')));
            } else return reject(res, 403);
            Promise.resolve(task).then(data => {
                if (res.destroyed) return;
                res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
                res.end(JSON.stringify(data));
            }).catch(() => { if (!res.destroyed) reject(res, 502); });
            return;
        }
        if (path === TELEMETRY_PATH || path === GAME_ROUTE_PATH || path === TMP_NEARBY_PATH) return reject(res, 403);
        if (path.startsWith('/maps/')) return proxy(req, res, companionPort, false);
        if (/^\/api\/map-status\/[a-z0-9_-]+$/i.test(path)) return proxy(req, res, companionPort, false);
        if (path.startsWith('/api/') && !path.startsWith('/api/_nuxt_icon/')) return reject(res, 403);
        return proxy(req, res, uiPort, true);
    });

    server.on('upgrade', (req, socket, head) => {
        const path = parsePath(req.url);
        if (!authorized(req, true) || (path !== TELEMETRY_PATH && (path !== GAME_ROUTE_PATH || !gameRouteSource) && (path !== TMP_NEARBY_PATH || !tmpNearbySource))) {
            socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
            return;
        }
        sockets.handleUpgrade(req, socket, head, client => {
            if (path === TMP_NEARBY_PATH) {
                const send = () => {
                    if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 65536) client.send(JSON.stringify(tmpNearbySource.get()));
                };
                send();
                const timer = setInterval(send, 250);
                client.on('message', () => client.close(1008, 'Read-only nearby positions'));
                client.on('error', () => client.close());
                client.on('close', () => clearInterval(timer));
                return;
            }
            if (path === GAME_ROUTE_PATH) {
                const send = () => {
                    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(gameRouteSource.get()));
                };
                send();
                const timer = setInterval(send, 1000);
                client.on('message', () => client.close(1008, 'Read-only game route'));
                client.on('error', () => client.close());
                client.on('close', () => clearInterval(timer));
                return;
            }
            const bridge = new WebSocket(`ws://127.0.0.1:${telemetryPort}`);
            bridge.on('message', (data, isBinary) => {
                if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
            });
            bridge.on('error', () => client.close(1011, 'Telemetry unavailable'));
            bridge.on('close', () => client.close());
            client.on('message', () => client.close(1008, 'Read-only telemetry'));
            client.on('error', () => bridge.close());
            client.on('close', () => bridge.close());
        });
    });
    server.on('close', () => sockets.close());
    return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const gameRouteSource = process.env.TRUCKNAV_PREVIEW_GAME_ROUTE === '1' ? createGameRouteSource() : null;
    const trafficSource = process.env.TRUCKNAV_PREVIEW_TRAFFIC === '1' ? createTruckersMpTrafficSource() : null;
    const tmpNearbySource = process.env.TRUCKNAV_PREVIEW_TMP_NEARBY === '1' ? createTmpNearbySource() : null;
    process.on('exit', () => gameRouteSource?.stop());
    process.on('exit', () => tmpNearbySource?.stop());
    const server = createPreviewGateway({
        owner: process.env.TRUCKNAV_PREVIEW_OWNER,
        hostname: process.env.TRUCKNAV_PREVIEW_HOST,
        httpsPort: Number(process.env.TRUCKNAV_PREVIEW_HTTPS_PORT || 443),
        uiPort: Number(process.env.TRUCKNAV_PREVIEW_UI_PORT || 3101),
        companionPort: 8628,
        telemetryPort: 30001,
        gameRouteSource,
        trafficSource,
        tmpNearbySource,
    });
    const port = Number(process.env.TRUCKNAV_PREVIEW_GATEWAY_PORT || 3102);
    server.listen(port, '127.0.0.1', () => console.log(`Read-only preview gateway listening on 127.0.0.1:${port}`));
}
