<script lang="ts" setup>
defineProps<{
    onClick?: () => void;
    isActive?: boolean;
    type?: "text-btn";
}>();
</script>

<template>
    <button class="option-btn" :class="type" :aria-pressed="isActive" @click.prevent="onClick?.()">
        <slot />
    </button>
</template>

<style
    lang="scss"
    scoped
    src="~/assets/scss/scoped/common/hudButton.scss"
></style>
