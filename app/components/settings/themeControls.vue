<script setup lang="ts">
import type { ThemeMode, ThemeClock } from "~/utils/theme";
const { settings, updateGlobal } = useSettings();
const { t } = useTranslations();
const modes: ThemeMode[] = ["auto", "day", "night"];
const clocks: ThemeClock[] = ["device", "game"];
</script>

<template>
    <section class="theme-controls" :aria-label="t('theme.title')">
        <div class="theme-heading"><Icon name="lucide:sun-moon" size="22" /><h2>{{ t('theme.title') }}</h2></div>
        <div class="theme-segments" role="group" :aria-label="t('theme.title')">
            <button v-for="mode in modes" :key="mode" type="button" :aria-pressed="settings.themeMode === mode" @click="updateGlobal('themeMode', mode)">{{ t(`theme.${mode}`) }}</button>
        </div>
        <label v-if="settings.themeMode === 'auto'" class="theme-clock">
            <span>{{ t('theme.clock') }}</span>
            <select :value="settings.themeClock" @change="updateGlobal('themeClock', ($event.target as HTMLSelectElement).value as ThemeClock)">
                <option v-for="clock in clocks" :key="clock" :value="clock">{{ t(`theme.${clock}`) }}</option>
            </select>
        </label>
        <p class="theme-description">{{ t('theme.description') }}</p>
        <label class="theme-custom"><input type="checkbox" :checked="settings.customMapColors" @change="updateGlobal('customMapColors', ($event.target as HTMLInputElement).checked)" />{{ t('theme.customColors') }}</label>
    </section>
</template>
