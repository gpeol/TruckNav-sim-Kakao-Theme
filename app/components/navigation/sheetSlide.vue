<script lang="ts" setup>
import { formatRouteArrival, formatRouteDuration } from "~/utils/routeTime";
import type { TrafficSegment } from '~/utils/truckersMpTraffic';

const props = defineProps<{
    isSheetHidden: boolean;
    truckSpeed: number;
    speedLimit: number;
    destinationName: string;
    currentLocationName?: string;
    routeEta: string;
    routeDistance: number;
    routeProgress: number | null;
    trafficSegments?: TrafficSegment[];
    gameRouteEstimate?: boolean;
    isNavigating: boolean;
    onStopNavigation: () => void;
    onStartNavigation: () => void;
    onOpenSettings: () => void;
    onOpenGeneralSettings: () => void;
}>();

const { kmToUserUnits, distanceUnit } = useUnitConversion();
const { settings } = useSettings();
const { gameTime, gameConnected } = useEtsTelemetry();
const { t } = useTranslations();
const deviceTime = ref(new Date());
const countdown = ref(5);
const routeDistanceConverted = computed(() => kmToUserUnits(props.routeDistance));
const remaining = computed(() => props.routeEta === 'Arriving...' ? t('routeUi.arriving') : formatRouteDuration(props.routeEta, settings.value.locale));
const arrival = computed(() => formatRouteArrival(
    props.routeEta, settings.value.routeTimeMode, gameTime.value,
    gameConnected.value, deviceTime.value, settings.value.locale,
));
const arrivalLabel = computed(() => t(settings.value.routeTimeMode === 'game' ? 'routeUi.arrivalGame' : 'routeUi.arrivalReal'));

const emit = defineEmits<{
    (e: "update:isSheetHidden", value: boolean): void;
    (e: "update:addStopClicked"): void;
}>();
const onToggleSheetHidden = () => emit("update:isSheetHidden", !props.isSheetHidden);

let rafId: number | null = null;
let clockTimer: ReturnType<typeof setInterval> | undefined;
const cancelAutoStart = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    countdown.value = 0;
};
const startNavigation = () => {
    cancelAutoStart();
    props.onStartNavigation();
};
const cancelRoute = () => {
    cancelAutoStart();
    props.onStopNavigation();
};
const handleAddStopClick = () => {
    cancelAutoStart();
    if (!props.isSheetHidden) onToggleSheetHidden();
    emit("update:addStopClicked");
};
const openSettings = () => {
    cancelAutoStart();
    if (props.isNavigating && !props.isSheetHidden) onToggleSheetHidden();
    props.onOpenSettings();
};
const openGeneralSettings = () => {
    cancelAutoStart();
    if (props.isNavigating && !props.isSheetHidden) onToggleSheetHidden();
    props.onOpenGeneralSettings();
};
const startSmoothTimer = () => {
    const duration = 5000;
    const startTime = Date.now();
    const frame = () => {
        const remainingMs = Math.max(0, duration - (Date.now() - startTime));
        countdown.value = Math.ceil(remainingMs / 1000);
        if (remainingMs > 0) rafId = requestAnimationFrame(frame);
        else startNavigation();
    };
    rafId = requestAnimationFrame(frame);
};

onMounted(() => {
    if (!props.isNavigating) startSmoothTimer();
    clockTimer = setInterval(() => { deviceTime.value = new Date(); }, 30_000);
});
onUnmounted(() => {
    cancelAutoStart();
    if (clockTimer) clearInterval(clockTimer);
});
watch(() => props.isNavigating, navigating => {
    if (navigating) cancelAutoStart();
});
</script>

<template>
    <div class="route-ui" :class="{ 'is-navigating': isNavigating, 'is-preview': !isNavigating }">
        <div v-if="!isNavigating" class="route-preview-bar">
            <button type="button" class="preview-icon-button" :aria-label="t('routeUi.cancelRoute')" @click="cancelRoute">
                <Icon name="lucide:arrow-left" size="23" />
            </button>
            <div class="preview-destination">
                <span>{{ t('routeUi.currentLocation') }}</span>
                <Icon name="lucide:arrow-right" size="17" aria-hidden="true" />
                <strong>{{ destinationName }}</strong>
            </div>
            <button type="button" class="preview-icon-button" :aria-label="t('map.addStop')" @click="handleAddStopClick">
                <Icon name="lucide:circle-plus" size="23" />
            </button>
            <button type="button" class="preview-icon-button" :aria-label="t('settings.title')" @click="openSettings">
                <Icon name="lucide:settings" size="21" />
            </button>
        </div>

        <Transition name="compact-slide">
            <CompactTrip
                v-if="isSheetHidden"
                :route-distance-converted="routeDistanceConverted"
                :distance-unit="distanceUnit"
                :route-eta="routeEta"
                :destination-name="destinationName"
                :current-location-name="currentLocationName"
                :arrival="arrival"
                :arrival-label="arrivalLabel"
                :progress="routeProgress"
                :traffic-segments="trafficSegments"
                @click="onToggleSheetHidden"
            />
        </Transition>

        <div v-if="isNavigating && !isSheetHidden" class="route-menu-scrim" aria-hidden="true" @click="onToggleSheetHidden"></div>
        <section
            v-if="!isSheetHidden"
            id="navigation-actions"
            class="route-panel"
            :class="{ 'route-panel-preview': !isNavigating, 'route-panel-menu': isNavigating }"
            :aria-label="isNavigating ? t('routeUi.navigationMenu') : t('routeUi.routePreview')"
            @keydown.esc.stop="onToggleSheetHidden"
        >
            <button type="button" class="panel-handle" :aria-label="t('routeUi.closeMenu')" @click="onToggleSheetHidden">
                <span></span>
            </button>

            <template v-if="!isNavigating">
                <h2 class="panel-heading">{{ t('routeUi.routePreview') }}</h2>
                <div class="preview-route-card">
                    <div class="preview-route-copy">
                        <div class="preview-route-meta">{{ t(gameRouteEstimate ? 'routeUi.gameRouteEstimate' : 'routeUi.routeOption') }} <span>{{ routeDistanceConverted }} {{ distanceUnit }}</span></div>
                        <div class="preview-route-time">{{ remaining }}</div>
                        <div v-if="arrival" class="preview-arrival">{{ arrivalLabel }} {{ arrival }}</div>
                    </div>
                    <button type="button" class="preview-start" :aria-label="t('common.startNavigation')" @click="startNavigation">
                        <Icon name="lucide:navigation" size="27" />
                    </button>
                </div>
                <div class="preview-actions">
                    <button type="button" class="preview-action" @click="handleAddStopClick">
                        <Icon name="lucide:map-pin-plus" size="20" /> {{ t('map.addStop') }}
                    </button>
                    <button v-if="countdown > 0" type="button" class="auto-start-cancel" @click="cancelAutoStart">
                        {{ t('routeUi.autoStart').replace('{seconds}', String(countdown)) }} · {{ t('routeUi.cancelAuto') }}
                    </button>
                </div>
            </template>
            <template v-else>
                <div class="menu-title-row">
                    <h2 class="panel-heading">{{ t('routeUi.navigationMenu') }}</h2>
                    <button type="button" class="menu-close" :aria-label="t('routeUi.closeMenu')" @click="onToggleSheetHidden">
                        <Icon name="lucide:x" size="22" />
                    </button>
                </div>
                <div class="menu-actions">
                    <button type="button" class="menu-action" @click="handleAddStopClick">
                        <Icon name="lucide:map-pin-plus" size="26" /> <span>{{ t('map.addStop') }}</span>
                    </button>
                    <button type="button" class="menu-action" @click="openSettings">
                        <Icon name="lucide:palette" size="26" /> <span>{{ t('settings.appearance') }}</span>
                    </button>
                    <button type="button" class="menu-action" @click="openGeneralSettings">
                        <Icon name="lucide:settings" size="26" /> <span>{{ t('settings.title') }}</span>
                    </button>
                    <button type="button" class="menu-action" @click="startNavigation">
                        <Icon name="lucide:locate-fixed" size="26" /> <span>{{ t('common.resume') }}</span>
                    </button>
                </div>
                <button type="button" class="end-guidance" @click="cancelRoute">{{ t('routeUi.endGuidance') }}</button>
            </template>
        </section>
    </div>
</template>

<style lang="scss" scoped src="~/assets/scss/scoped/navigation/sheetSlide.scss"></style>
