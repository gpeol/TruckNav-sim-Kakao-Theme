<script lang="ts" setup>
import { formatTurnDistance } from "~/utils/turnDistance";
import type { DirectionStep } from "~/assets/utils/routing/directions";

const props = defineProps<{
    upcomingTurns: DirectionStep[];
    distanceToNextTurn: number;
    nextInstruction: string;
    active?: boolean;
    exit?: number | undefined;
}>();

const { t } = useTranslations();
const instruction = computed(() => {
    const turn = props.upcomingTurns[1];
    if (!turn) return props.nextInstruction;
    if (turn.type === "roundabout" && turn.exitClock) return t("directions.roundaboutClock").replace("{clock}", String(turn.exitClock));
    const key = turn.type === "roundabout" && turn.exitCount ? "roundaboutExit" : turn.type;
    return t(`directions.${key}`).replace("{exit}", String(turn.exitCount ?? ""));
});

const displayTurns = computed(() => {
    return props.upcomingTurns.slice(1, 3);
});

const { distanceUnit } = useUnitConversion();
const routeDistance = computed(() => formatTurnDistance(props.distanceToNextTurn, distanceUnit.value));
const followingDistance = computed(() => formatTurnDistance(displayTurns.value[0]?.distance ?? 0, distanceUnit.value));
</script>

<template>
    <div class="card">
        <div class="primary-turn">
            <DirectionIcon v-if="displayTurns[0]" :type="displayTurns[0].type"
                :exit-count="displayTurns[0].type === 'roundabout' ? displayTurns[0].exitCount : undefined"
                :exit-clock="displayTurns[0].exitClock"
                :active="true" active-color="#ffffff" />
            <div class="turn-info">
                <p>{{ routeDistance.value }}<span>{{ routeDistance.unit }}</span></p>
                <p>{{ instruction }}</p>
            </div>
        </div>
        <div v-if="displayTurns[1] && displayTurns[0]" class="secondary-turn">
            <DirectionIcon :type="displayTurns[1].type" :exit-count="displayTurns[1].exitCount" :exit-clock="displayTurns[1].exitClock" :active="true" active-color="#ffffff" />
            <span>{{ followingDistance.value }}<small>{{ followingDistance.unit }}</small></span>
        </div>
    </div>
</template>

<style scoped src="~/assets/scss/scoped/navigation/maneuverCard.scss"></style>
