<script lang="ts" setup>
const emit = defineEmits<{ (event: 'exit' | 'appearance' | 'settings'): void }>();
const { t } = useTranslations();
const menuOpen = ref(false);
const menuButton = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
async function openMenu() { menuOpen.value = true; await nextTick(); panel.value?.focus(); }
async function closeMenu() { menuOpen.value = false; await nextTick(); menuButton.value?.focus(); }
function choose(action: 'appearance' | 'settings') { menuOpen.value = false; emit(action); }
function trapFocus(event: KeyboardEvent) {
    const buttons = panel.value?.querySelectorAll<HTMLButtonElement>('button');
    if (!buttons?.length) return;
    const first = buttons[0]!, last = buttons[buttons.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.value)) { event.preventDefault(); first.focus(); }
}
</script>

<template>
    <div class="free-drive-ui">
        <div class="free-drive-bar">
            <span class="free-drive-handle" aria-hidden="true"></span>
            <button type="button" class="end-safe-driving" @click="emit('exit')">
                <Icon name="lucide:shield-check" size="25" aria-hidden="true" />
                <span>{{ t('routeUi.endSafeDriving') }}</span>
            </button>
            <button ref="menuButton" type="button" class="free-drive-menu-button" :aria-label="t('routeUi.safeDrivingMenu')"
                :aria-expanded="menuOpen" aria-controls="safe-driving-actions" @click="openMenu">
                <Icon name="lucide:menu" size="26" aria-hidden="true" />
            </button>
        </div>
        <template v-if="menuOpen">
            <div class="free-drive-scrim" @click="closeMenu"></div>
            <section id="safe-driving-actions" ref="panel" class="free-drive-actions" role="dialog" aria-modal="true"
                :aria-label="t('routeUi.safeDrivingMenu')" tabindex="-1" @keydown.esc.prevent.stop="closeMenu" @keydown.tab="trapFocus">
                <div class="free-drive-menu-heading"><h2>{{ t('routeUi.safeDrivingMenu') }}</h2>
                    <button type="button" :aria-label="t('common.back')" @click="closeMenu"><Icon name="lucide:x" size="24" /></button>
                </div>
                <button type="button" @click="choose('appearance')"><Icon name="lucide:palette" size="24" />{{ t('settings.appearance') }}</button>
                <button type="button" @click="choose('settings')"><Icon name="lucide:settings" size="24" />{{ t('settings.title') }}</button>
                <button type="button" class="end-safe-driving" @click="emit('exit')">{{ t('routeUi.endSafeDriving') }}</button>
            </section>
        </template>
    </div>
</template>

<style lang="scss" scoped src="~/assets/scss/scoped/navigation/freeDriveBar.scss"></style>
