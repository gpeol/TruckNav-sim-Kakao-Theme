<script setup lang="ts">
import { hasTrafficTransport, trafficServers, type TrafficServer } from '~/utils/trafficTransport';
const { settings, activeSettings, updateGlobal } = useSettings();
const { t } = useTranslations();
const status = useState<'off' | 'waiting' | 'ready' | 'unavailable'>('tmp-traffic-status', () => 'off');
const available = ref(false);
const loading = ref(false);
const error = ref(false);
const servers = ref<TrafficServer[] | null>(null);
onMounted(() => {
    available.value = hasTrafficTransport();
    if (available.value && settings.value.trafficServerId && activeSettings.value.activeMod === 'none') void loadServers();
});
async function loadServers() {
    loading.value = true;
    error.value = false;
    try {
        const result = await trafficServers();
        if (!Array.isArray(result)) throw new Error('Traffic servers unavailable');
        servers.value = result;
    } catch { error.value = true; } finally { loading.value = false; }
}
function choose(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    updateGlobal('trafficServerId', value ? Number(value) : null);
}
</script>

<template>
    <section v-if="available && settings.selectedGame === 'ets2'" class="traffic-controls">
        <strong>{{ t('traffic.title') }}</strong>
        <p>{{ t('traffic.description') }}</p>
        <button type="button" :disabled="loading || activeSettings.activeMod !== 'none'" @click="loadServers">{{ t('traffic.choose') }}</button>
        <button v-if="settings.trafficServerId" type="button" @click="updateGlobal('trafficServerId', null)">{{ t('traffic.off') }}</button>
        <select v-if="servers" :value="settings.trafficServerId ?? ''" :aria-label="t('traffic.title')" @change="choose">
            <option value="">{{ t('traffic.off') }}</option>
            <option v-for="server in servers" :key="server.id" :value="server.id">{{ server.name }}</option>
        </select>
        <p v-if="activeSettings.activeMod !== 'none'" role="status">{{ t('trafficUnsupported') }}</p>
        <p v-else-if="error || status === 'unavailable'" role="status">{{ t('traffic.unavailable') }}</p>
        <p v-else-if="status === 'waiting'" role="status">{{ t('traffic.waiting') }}</p>
        <p v-else-if="status === 'ready'" role="status">{{ t('traffic.ready') }}</p>
    </section>
</template>

<style scoped>
.traffic-controls { flex-shrink: 0; padding: 16px; border: 1px solid var(--border-color); border-radius: 18px; color: var(--text-primary); }
.traffic-controls strong { font-size: 1.6rem; }
.traffic-controls p { margin: 10px 0; color: var(--text-muted); font-size: 1.3rem; line-height: 1.4; }
.traffic-controls button, .traffic-controls select { max-width: 100%; padding: 8px 12px; margin-right: 8px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--surface-muted); color: var(--text-primary); font-size: 1.4rem; }
</style>
