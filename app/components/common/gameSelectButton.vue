<script lang="ts" setup>
defineProps<{
    gameName: "ats" | "ets2";
    selectCard: (game: "ets2" | "ats" | null) => void;
    width: number;
}>();
</script>

<template>
    <button
        type="button"
        @click.prevent="selectCard(gameName)"
        class="game-btn"
        :style="{ maxWidth: `${width}px` }"
    >
        <img :src="`/images/game-covers/${gameName}.webp`" alt="" />
        <div class="game-name-wrapper">
            <p class="game-name">{{ gameName === "ets2" ? "Euro Truck Simulator 2" : "American Truck Simulator" }}</p>
            <slot name="icon"></slot>
        </div>
    </button>
</template>

<style
    lang="scss"
    scoped
    src="~/assets/scss/scoped/common/gameSelectButton.scss"
></style>
