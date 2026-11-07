import { computed, onMounted, onUnmounted, shallowRef, watch, type Ref } from "vue";
import { gameRouteWaypoints, type GameRouteSnapshot } from "~/utils/gameRoute";
import type { TelemetryPacket } from "~/types";

/** Read-only game destinations from the authenticated preview or Electron. */
export function usePreviewGameRoute(telemetry: Ref<TelemetryPacket | null>) {
    const snapshot = shallowRef<GameRouteSnapshot | null>(null);
    const waypoints = computed(() => gameRouteWaypoints(snapshot.value, telemetry.value));
    const points = computed(() => waypoints.value ? snapshot.value!.points as [number, number, number][] : null);
    const key = computed(() => points.value ? JSON.stringify([waypoints.value, points.value.map(([x, z]) => [x, z])]) : "");
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let expiry: ReturnType<typeof setInterval> | null = null;
    let receivedAt = 0;
    let disposed = false;
    let ipcTimer: ReturnType<typeof setTimeout> | null = null;
    let ipcRevision = 0;
    let ipcBridge: { getGameRoute(): Promise<unknown>; stopGameRoute(): Promise<void> } | null = null;

    function accept(next: any) {
        if (!next || !["active", "inactive", "unavailable"].includes(next.state)) throw new Error();
        receivedAt = Date.now();
        snapshot.value = next;
    }

    function clearSnapshot() {
        snapshot.value = null;
    }

    function connect() {
        if (disposed) return;
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        socket = new WebSocket(`${protocol}//${window.location.host}/__trucknav/game-route`);
        socket.onmessage = event => {
            try {
                if (typeof event.data !== "string" || event.data.length > 1_000_000) throw new Error();
                accept(JSON.parse(event.data));
            } catch { clearSnapshot(); }
        };
        socket.onclose = () => {
            clearSnapshot();
            socket = null;
            if (!disposed) retry = setTimeout(connect, 5000);
        };
    }

    async function pollIpc(revision: number) {
        try {
            const next = await ipcBridge!.getGameRoute();
            if (disposed || revision !== ipcRevision) return;
            accept(next);
        } catch {
            if (disposed || revision !== ipcRevision) return;
            clearSnapshot();
        }
        if (!disposed && revision === ipcRevision) ipcTimer = setTimeout(() => pollIpc(revision), 1000);
    }

    function stopIpc() {
        ipcRevision++;
        if (ipcTimer) clearTimeout(ipcTimer);
        ipcTimer = null;
        clearSnapshot();
        if (ipcBridge) void ipcBridge.stopGameRoute().catch(() => {});
    }

    onMounted(() => {
        const electronApi = (window as any).electronAPI;
        if (typeof electronApi?.getGameRoute === 'function' && typeof electronApi?.stopGameRoute === 'function') {
            ipcBridge = electronApi;
            watch(() => String(telemetry.value?.game || '').toLowerCase() === 'ets2', connected => {
                if (!connected) { stopIpc(); return; }
                ipcRevision++;
                void pollIpc(ipcRevision);
            }, { immediate: true });
        } else if (document.querySelector('meta[name="trucknav-game-route"][content="1"]')) {
            connect();
        } else return;
        expiry = setInterval(() => {
            if (Date.now() - receivedAt > 6000) clearSnapshot();
        }, 1000);
    });
    onUnmounted(() => {
        disposed = true;
        stopIpc();
        if (retry) clearTimeout(retry);
        if (expiry) clearInterval(expiry);
        if (socket) { socket.onclose = null; socket.close(); socket = null; }
    });
    return { gameRouteWaypoints: waypoints, gameRoutePoints: points, gameRouteKey: key };
}
