import { Capacitor } from '@capacitor/core';
import { isSecurePreviewDocument, telemetrySocketUrl } from '~/utils/previewTransport';
import { isMapDownloaded } from '~/assets/utils/shared/fileManager';

/** A landing-only probe; never shares or stops the navigation telemetry socket. */
export function useLandingAutoStart(view: Ref<string>, launch: () => void, blocked?: Readonly<Ref<boolean>>) {
    const { settings, activeSettings, updateGlobal } = useSettings();
    const { selectGame } = useGameSelection();
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let lastInput = 0;
    let lastSeen = 0;
    let detected: 'ets2' | 'ats' | null = null;
    let generation = 0;
    let autoSelecting = false;
    let manualGame: 'ets2' | 'ats' | null = null;
    let inputRevision = 0;
    let checkingMap = false;
    let nextMapCheck = 0;
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const;
    function cancelTimer() { if (timer) clearTimeout(timer); timer = null; }
    function input() { inputRevision++; lastInput = Date.now(); cancelTimer(); }
    function selectManually(game: 'ets2' | 'ats' | null) {
        if (view.value !== 'gameManager' && view.value !== 'desktopHome') return;
        manualGame = game;
        input();
    }
    function visibility() { input(); }
    function stop() {
        generation++;
        cancelTimer();
        if (retry) clearTimeout(retry);
        retry = null;
        if (socket) { socket.onclose = null; socket.onmessage = null; socket.onerror = null; socket.close(); socket = null; }
        detected = null;
        checkingMap = false;
        nextMapCheck = 0;
        manualGame = null;
    }
    function start() {
        stop();
        if (view.value !== 'gameManager' && view.value !== 'desktopHome') return;
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
                if (document.visibilityState !== 'visible' || blocked?.value) return;
                if (manualGame && manualGame !== game) return;
                autoSelecting = true;
                try {
                    selectGame(game);
                    updateGlobal('selectedGame', game);
                } finally { autoSelecting = false; }
                if (settings.value.selectedGame !== game) return;
                timer = setTimeout(async () => {
                    timer = null;
                    if (token !== generation || blocked?.value || settings.value.selectedGame !== game || detected !== game || Date.now() - lastSeen > 3000 || document.visibilityState !== 'visible') return;
                    const mapId = activeSettings.value.activeMod === 'none' ? game : activeSettings.value.activeMod;
                    const revisionAtCheck = inputRevision;
                    checkingMap = true;
                    let ready = false;
                    try { ready = await isMapDownloaded(mapId); } catch { ready = false; }
                    if (token !== generation) return;
                    checkingMap = false;
                    nextMapCheck = Date.now() + 5000;
                    if (revisionAtCheck === inputRevision && !blocked?.value && settings.value.selectedGame === game && detected === game && ready && Date.now() - lastSeen <= 3000 && document.visibilityState === 'visible' && Date.now() - lastInput >= 10000) launch();
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
        // Synchronous observation distinguishes our own update from the real UI's
        // updateGlobal call; useGameSelection mirrors that same setting.
        watch(() => settings.value.selectedGame, game => {
            if (autoSelecting || (view.value !== 'gameManager' && view.value !== 'desktopHome')) return;
            selectManually(game);
        }, { flush: 'sync' });
        if (blocked) watch(blocked, input, { flush: 'sync' });
        watch(view, start, { immediate: true });
    });
    onUnmounted(() => { stop(); events.forEach(event => window.removeEventListener(event, input, true)); document.removeEventListener('visibilitychange', visibility); });
    return { selectManually };
}
