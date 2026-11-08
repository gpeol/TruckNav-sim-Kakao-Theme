<script lang="ts" setup>
type settingsView = "main" | "general" | "appearance" | "navigation";

const { t } = useTranslations();

const props = defineProps<{ closePanel: () => void; directAppearance?: boolean }>();

const currentView = ref<settingsView>("main");
const returnDirectlyToMap = ref(false);

function setView(view: settingsView, direct = false) {
    currentView.value = view;
    returnDirectlyToMap.value = direct;
}

defineExpose({ setView });

function handleBack() {
    if (currentView.value === "main" || returnDirectlyToMap.value) {
        props.closePanel();
    } else {
        currentView.value = "main";
    }
}
</script>

<template>
    <div class="settings-layer" :class="{ 'is-direct': directAppearance }">
      <div v-if="directAppearance" class="settings-scrim" aria-hidden="true" @click="closePanel"></div>
      <div class="settings-panel" :role="directAppearance ? 'dialog' : undefined" :aria-modal="directAppearance ? 'true' : undefined" :aria-label="directAppearance ? t('settings.appearance') : undefined">
        <div class="settings-title">
            <button type="button" class="icon-btn" :aria-label="t('common.back')" @click="handleBack">
                <Icon name="lucide:arrow-left" size="26" />
            </button>

            <div class="title-icon">
                <Icon :name="directAppearance ? 'lucide:palette' : 'lucide:settings'" size="38" />

                <div>
                    <p class="panel-title">{{ t(directAppearance ? "settings.appearance" : "settings.title") }}</p>
                    <p v-if="!directAppearance" class="panel-description">
                        {{ t("settings.description") }}
                    </p>
                </div>
            </div>
        </div>

        <div class="separator"></div>

        <div class="settings-wrapper">
            <Transition name="page-fade" mode="out-in">
                <div
                    v-if="currentView === 'main'"
                    class="menu-list main"
                    key="main"
                >
                    <div class="option setting" @click="setView('general')">
                        <Icon name="lucide:settings-2" size="28" />
                        <span>{{ t("settings.general") }}</span>
                        <Icon
                            name="lucide:chevron-right"
                            size="24"
                            class="arrow"
                        />
                    </div>

                    <div class="option setting" @click="setView('appearance')">
                        <Icon name="lucide:palette" size="28" />
                        <span>{{ t("settings.appearance") }}</span>
                        <Icon
                            name="lucide:chevron-right"
                            size="24"
                            class="arrow"
                        />
                    </div>

                    <div class="option setting" @click="setView('navigation')">
                        <Icon name="lucide:navigation" size="28" />
                        <span>{{ t("settings.navigation") }}</span>
                        <Icon
                            name="lucide:chevron-right"
                            size="24"
                            class="arrow"
                        />
                    </div>
                </div>

                <General
                    v-else-if="currentView === 'general'"
                    class="menu-list"
                    key="general"
                />

                <Appearance
                    v-else-if="currentView === 'appearance'"
                    class="menu-list appearance-settings"
                    key="appearance"
                />

                <Navigation
                    v-else-if="currentView === 'navigation'"
                    class="menu-list"
                    key="navigation"
                />
            </Transition>
        </div>
      </div>
    </div>
</template>

<style
    lang="scss"
    src="~/assets/scss/scoped/settings/settingsPanel.scss"
></style>
