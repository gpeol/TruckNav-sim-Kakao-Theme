import { Capacitor } from '@capacitor/core';
import { isSecurePreviewDocument, telemetrySocketUrl } from '~/utils/previewTransport';
import { isMapDownloaded } from '~/assets/utils/shared/fileManager';

/** A landing-only probe; never shares or stops the navigation telemetry socket. */
export function useLandingAutoStart(view: Ref<string>, launch: () => void) {
    const { settings, activeSettings, updateGlobal } = useSettings();
    const { selectGame, selectedGame } = useGameSelection();
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let lastInput = 0;
    let lastSeen = 0;
    let detected: 'ets2' | 'ats' | null = null;
    let generation = 0;
    let interacted = false;
    let checkingMap = false;
    let nextMapCheck = 0;
    const events = ['pointerdown', 'keydown', 'wheel'] as const;
    function cancelTimer() { if (timer) clearTimeout(timer); timer = null; }
    function input() { interacted = true; lastInput = Date.now(); cancelTimer(); }
    function visibility() { cancelTimer(); lastInput = Date.now(); }
    function stop() {
        generation++;
        cancelTimer();
        if (retry) clearTimeout(retry);
        retry = null;
        if (socket) { socket.onclose = null; socket.onmessage = null; socket.onerror = null; socket.close(); socket = null; }
        detected = null;
        checkingMap = false;
        nextMapCheck = 0;
    }
    function start() {
        stop();
        if (view.value !== 'gameManager' && view.value !== 'desktopHome') return;
        interacted = false;
        lastInput = Date.now();
        const token = generation;
        const connect = () => {
            if (token !== generation) return;
            const connection = new WebSocket(telemetrySocketUrl(location.hostname, settings.value.savedIP,
                Capacitor.isNativePlatform(), isSecurePreviewDocument(), location.protocol, location.host));
            socket = connection;
            const ownsSocket = () => token === generation && socket === connection;
            connection.onmessage = event => {
                if (!ownsSocket()) return;
                let game: string;
                try { game = String(JSON.parse(event.data)?.game).toLowerCase(); } catch { return; }
                if (game !== 'ets2' && game !== 'ats') { detected = null; cancelTimer(); return; }
                lastSeen = Date.now();
                if (detected !== game) cancelTimer();
                detected = game;
                if (timer || checkingMap || Date.now() < nextMapCheck) return;
                if (document.visibilityState !== 'visible') return;
                const manualSelection = interacted && selectedGame?.value && selectedGame.value !== settings.value.selectedGame;
                if (manualSelection) return;
                if (!manualSelection) {
                    selectGame(game);
                    updateGlobal('selectedGame', game);
                }
                if (settings.value.selectedGame !== game) return;
                timer = setTimeout(async () => {
                    timer = null;
                    if (token !== generation || settings.value.selectedGame !== game || detected !== game || Date.now() - lastSeen > 3000 || document.visibilityState !== 'visible') return;
                    const mapId = activeSettings.value.activeMod === 'none' ? game : activeSettings.value.activeMod;
                    const inputAtCheck = lastInput;
                    checkingMap = true;
                    let ready = false;
                    try { ready = await isMapDownloaded(mapId); } catch { ready = false; }
                    if (token !== generation) return;
                    checkingMap = false;
                    nextMapCheck = Date.now() + 5000;
                    if (inputAtCheck === lastInput && settings.value.selectedGame === game && detected === game && ready && Date.now() - lastSeen <= 3000 && document.visibilityState === 'visible' && Date.now() - lastInput >= 10000) launch();
                }, Math.max(0, 10000 - (Date.now() - lastInput)));
            };
            connection.onerror = () => { if (ownsSocket()) connection.close(); };
            connection.onclose = () => {
                if (!ownsSocket()) return;
                socket = null;
                detected = null;
                cancelTimer();
                retry = setTimeout(connect, 2000);
            };
        };
        connect();
    }
    onMounted(() => {
        events.forEach(event => window.addEventListener(event, input, { capture: true, passive: true }));
        document.addEventListener('visibilitychange', visibility);
        watch(view, start, { immediate: true });
    });
    onUnmounted(() => { stop(); events.forEach(event => window.removeEventListener(event, input, true)); document.removeEventListener('visibilitychange', visibility); });
}
