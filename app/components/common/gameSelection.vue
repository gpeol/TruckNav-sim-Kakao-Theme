<script lang="ts" setup>
defineProps<{ width: number }>();
const { settings, updateGlobal } = useSettings();
const emit = defineEmits<{ gameSelected: [game: 'ats' | 'ets2' | null] }>();

const selectCard = (game: "ats" | "ets2" | null) => {
    emit('gameSelected', game);
    updateGlobal("selectedGame", game);
};
</script>

<template>
    <section class="game-select-section">
        <GameSelectButton
            game-name="ats"
            :select-card="selectCard"
            :class="{ 'is-selected': settings.selectedGame === 'ats' }"
            :aria-pressed="settings.selectedGame === 'ats'"
            :width="width"
        >
            <template #icon>
                <Icon name="map:route" size="22" />
            </template>
        </GameSelectButton>

        <GameSelectButton
            :select-card="selectCard"
            game-name="ets2"
            :class="{ 'is-selected': settings.selectedGame === 'ets2' }"
            :aria-pressed="settings.selectedGame === 'ets2'"
            :width="width"
        >
            <template #icon>
                <Icon name="map:museum" size="22" />
            </template>
        </GameSelectButton>
    </section>
</template>

<style
    lang="scss"
    scoped
    src="~/assets/scss/scoped/common/gameSelection.scss"
></style>
