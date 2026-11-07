<script lang="ts" setup>
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
    const key = turn.type === "roundabout" && turn.exitCount ? "roundaboutExit" : turn.type;
    return t(`directions.${key}`).replace("{exit}", String(turn.exitCount ?? ""));
});

const displayTurns = computed(() => {
    return props.upcomingTurns.slice(1, 3);
});

const { kmToUserUnits, distanceUnit } = useUnitConversion();

const routeDistanceConverted = computed(() =>
    kmToUserUnits(props.distanceToNextTurn),
);
</script>

<template>
    <div class="card">
        <div class="turn-directions">
            <DirectionIcon
                v-for="(turn, index) in displayTurns"
                :key="turn.id"
                :type="turn.type"
                :exit-count="
                    turn.type === 'roundabout' ? turn.exitCount : undefined
                "
                :active="index === 0"
                :active-color="'#20242b'"
            />
        </div>
        <div class="turn-info">
            <p>{{ routeDistanceConverted }} {{ distanceUnit }}</p>
            <p>{{ instruction }}</p>
        </div>
    </div>
</template>

<style scoped src="~/assets/scss/scoped/navigation/maneuverCard.scss"></style>
