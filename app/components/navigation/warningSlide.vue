<script lang="ts" setup>
defineProps<{
    showIf: boolean;
    resetOn?: boolean;
    text: string;
}>();

</script>

<template>
    <Transition name="compact-slide">
        <div
            v-if="showIf"
            class="route-warning"
            role="status"
            aria-live="polite"
            aria-atomic="true"
        >
            <div class="warning-message">
                <Icon name="lucide:triangle-alert" size="22" aria-hidden="true" />

                <div class="text-content" tabindex="0" :aria-label="text">
                    <span class="text-nowrap">{{ text }}</span>
                </div>
            </div>
        </div>
    </Transition>
</template>

<style
    lang="scss"
    scoped
    src="~/assets/scss/scoped/navigation/warningSlide.scss"
></style>
