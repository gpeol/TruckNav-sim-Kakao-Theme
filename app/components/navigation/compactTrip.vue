<script lang="ts" setup>
import { formatRouteDuration, parseRouteDuration } from "~/utils/routeTime";
import type { TrafficSegment } from '~/utils/truckersMpTraffic';

const props = defineProps<{
    routeDistanceConverted: number;
    distanceUnit: string;
    routeEta: string;
    destinationName?: string;
    currentLocationName?: string;
    arrival?: string | null;
    arrivalLabel?: string;
    progress?: number | null;
    trafficSegments?: TrafficSegment[];
}>();

const { settings } = useSettings();
const { t } = useTranslations();
const showCurrentLocation = ref(false);
let locationToggle: ReturnType<typeof setInterval> | undefined;
onMounted(() => { locationToggle = setInterval(() => { showCurrentLocation.value = !showCurrentLocation.value; }, 30_000); });
onUnmounted(() => { if (locationToggle) clearInterval(locationToggle); });
const showingCurrent = computed(() => showCurrentLocation.value && !!props.currentLocationName);
const locationName = computed(() => showingCurrent.value ? props.currentLocationName : props.destinationName);
const locationKind = computed(() => t(showingCurrent.value ? 'routeUi.currentLocation' : 'routeUi.destination'));
const remaining = computed(() => props.routeEta === 'Arriving...' ? t('routeUi.arriving') : formatRouteDuration(props.routeEta, settings.value.locale));
const remainingText = computed(() => parseRouteDuration(props.routeEta) === null ? remaining.value : remaining.value + ' ' + t('routeUi.remaining'));
const progressPercent = computed(() => props.progress == null ? null : Math.round(props.progress * 100));
const summaryLabel = computed(() => [
    locationName.value ? `${locationKind.value}: ${locationName.value}` : '',
    props.arrival && props.arrivalLabel ? `${props.arrivalLabel} ${props.arrival}` : '',
    `${props.routeDistanceConverted} ${props.distanceUnit}`,
    remainingText.value,
    progressPercent.value == null ? '' : `${t('routeUi.progress')} ${progressPercent.value}%`,
    props.trafficSegments?.length ? t('routeUi.trafficOnRoute') : '',
    t('routeUi.openMenu'),
].filter(Boolean).join(', '));
</script>

<template>
    <button type="button" class="trip-summary" :aria-label="summaryLabel" aria-expanded="false" aria-controls="navigation-actions">
        <span v-if="locationName" class="trip-destination" aria-hidden="true">
            <Icon name="lucide:map-pin" size="15" /> <span>{{ locationKind }} · {{ locationName }}</span>
        </span>
        <span class="trip-handle" aria-hidden="true"></span>
        <Icon name="lucide:route" class="trip-route-icon" size="25" aria-hidden="true" />
        <span class="trip-details">
            <span class="trip-metrics">
                <span v-if="arrival" class="trip-arrival"><small>{{ arrivalLabel }}</small> {{ arrival }}</span>
                <strong>{{ routeDistanceConverted }}<small> {{ distanceUnit }}</small></strong>
            </span>
            <span class="trip-remaining">{{ remainingText }}</span>
        </span>
        <Icon name="lucide:menu" class="trip-menu-icon" size="26" aria-hidden="true" />
        <span v-if="progressPercent !== null" class="trip-progress" aria-hidden="true">
            <span class="trip-progress-fill" :style="{ width: progressPercent + '%' }"></span>
            <span v-for="(segment, index) in trafficSegments" :key="index" class="trip-progress-traffic" :class="segment.level" :style="{ left: `${segment.startProgress * 100}%`, width: `${Math.max(0, segment.endProgress - segment.startProgress) * 100}%` }"></span>
            <span class="trip-progress-marker" :style="{ left: progressPercent + '%' }">
                <Icon name="lucide:truck" size="12" />
            </span>
        </span>
    </button>
</template>

<style lang="scss" scoped src="~/assets/scss/scoped/navigation/compactTrip.scss"></style>
