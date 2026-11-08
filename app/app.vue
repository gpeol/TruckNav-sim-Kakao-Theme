<script setup lang="ts">
import { KeepAwake } from "@capacitor-community/keep-awake";

useThemeLifecycle();

onMounted(async () => {
    const { initSettings } = useSettings();
    initSettings();

    const { initDesktopSettings } = useDesktopSettings();
    await initDesktopSettings();

    const result = await KeepAwake.isSupported();
    if (result.isSupported) {
        await KeepAwake.keepAwake();
    }
});
</script>

<template>
    <UApp>
        <NuxtLayout>
            <NuxtPage />
        </NuxtLayout>
    </UApp>
</template>

<style lang="scss">
@use "~/assets/scss/global/global";
@use "~/assets/scss/global/navigation-theme";
</style>
