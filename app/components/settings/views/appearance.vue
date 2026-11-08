<script lang="ts" setup>
import { generateTruckIcon } from "~/assets/utils/map/markers";

const { settings, activeSettings, updateProfile, DEFAULT_SETTINGS } =
    useSettings();
const { t } = useTranslations();

const truckImgSrc = ref("");
const isDriveInfoOpened = ref(false);

const items = ref([
    "Quicksand",
    "Roboto",
    "Exo-2",
    "Montserrat",
    "Oxanium",
    "Rubik",
    "Open-Sans",
    "Nunito",
    "Karla",
    "Commissioner",
    "KakaoBigFont",
    "KakaoSmallFont",
]);

async function updatePreviewIcon() {
    const img = await generateTruckIcon(activeSettings.value.themeColor);
    truckImgSrc.value = img.src;
}

function updateFont(val: string) {
    updateProfile("fontFamily", val);
}

function toggleDriveInfoPanel() {
    isDriveInfoOpened.value = !isDriveInfoOpened.value;
}

watch(() => activeSettings.value.themeColor, updatePreviewIcon, {
    immediate: true,
});
</script>

<template>
    <div>
        <ThemeControls />
        <TrafficControls />
        <ColorOption
            :option-title="t('settings.mapAccent')"
            color-element="themeColor"
        >
            <template #icon>
                <Icon name="lucide:palette" size="24" />
            </template>
        </ColorOption>

        <ColorOption
            :option-title="t('settings.route')"
            color-element="routeColor"
        >
            <template #icon>
                <Icon name="lucide:milestone" size="24" />
            </template>
        </ColorOption>

        <div class="small-separator"></div>

        <ColorOption
            :option-title="t('settings.background')"
            color-element="backgroundColor"
        >
            <template #icon>
                <Icon name="lucide:waves" size="24" />
            </template>
        </ColorOption>

        <ColorOption
            :option-title="t('settings.land')"
            color-element="landColor"
        >
            <template #icon>
                <Icon name="lucide:mountain" size="24" />
            </template>
        </ColorOption>

        <ColorOption
            :option-title="t('settings.roads')"
            color-element="roadColor"
        >
            <template #icon>
                <Icon name="lucide:route" size="24" />
            </template>
        </ColorOption>

        <PreviewSetting :height="240">
            <MapColorPreview />
        </PreviewSetting>

        <div class="small-separator"></div>

        <div class="option setting">
            <div class="option-title">
                <Icon name="lucide:type" size="24" />
                <p>{{ t("settings.appFont") }}</p>
            </div>

            <USelect
                :model-value="activeSettings.fontFamily"
                @update:model-value="(val: string) => updateFont(val)"
                :items="items"
                variant="none"
                class="selector"
                :ui="{
                    trailingIcon: 'shrink-0 size-[20px] text-[var(--text-primary)] !px-6',
                    content: 'bg-[var(--surface-raised)] shadow-xl rounded-md',
                    item: 'flex items-center justify-between text-[1.6rem] font-BOLD !py-2 !px-3 text-[var(--text-primary)] data-[highlighted]:bg-[var(--surface-muted)] rounded cursor-pointer transition-colors',
                    itemTrailingIcon: 'text-[var(--text-primary)]',
                }"
            >
                <template #item="{ item }">
                    <span :style="{ fontFamily: item }">
                        {{ item }}
                    </span>
                </template>
            </USelect>
        </div>

        <div class="small-separator"></div>

        <IncreaseOption
            :option-title="t('settings.hudButtonSize')"
            setting-name="hudBtnSize"
            :max-value="40"
            :min-value="20"
            :amount="1"
        >
            <template #icon>
                <Icon name="lucide:square-plus" size="24" />
            </template>
        </IncreaseOption>

        <PreviewSetting :height="70">
            <HudButton v-on:click="null">
                <Icon name="lucide:star" class="icon" />
            </HudButton>
        </PreviewSetting>

        <IncreaseOption
            :option-title="t('settings.truckMarkerSize')"
            setting-name="truckMarkerSize"
            :max-value="70"
            :min-value="25"
            :amount="1"
        >
            <template #icon>
                <Icon name="lucide:map-pin-plus" size="24" />
            </template>
        </IncreaseOption>

        <PreviewSetting :height="70">
            <div
                class="actual-truck-preview"
                :style="{
                    width: settings.truckMarkerSize + 'px',
                    height: settings.truckMarkerSize + 'px',
                    backgroundImage: `url('${truckImgSrc}')`,
                }"
            ></div>
        </PreviewSetting>

        <IncreaseOption
            :option-title="t('settings.compactTripSize')"
            setting-name="compactTripFontSize"
            :max-value="2.5"
            :min-value="1.2"
            :amount="0.1"
        >
            <template #icon>
                <Icon name="lucide:circle-plus" size="24" />
            </template>
        </IncreaseOption>

        <PreviewSetting :height="100">
            <CompactTrip
                class="compact-trip-progress preview"
                :route-distance-converted="999"
                distance-unit="mi"
                route-eta="9h 59min"
            />
        </PreviewSetting>

        <div class="option setting">
            <div class="option-title">
                <Icon name="lucide:circle-gauge" size="24" />
                <p>{{ t("settings.drivingInfo") }}</p>
            </div>
            <div class="owned-dlcs">
                <button
                    @click.prevent="toggleDriveInfoPanel"
                    class="nav-btn settings-btn"
                >
                    {{ settings.activeUiComponents.length }} /
                    {{ DEFAULT_SETTINGS.activeUiComponents.length }}
                    {{ t("common.active") }}
                </button>
            </div>
        </div>

        <Transition name="panel-pop">
            <PopupPanel
                v-if="isDriveInfoOpened"
                :title="t('settings.selectComponents')"
                @close="toggleDriveInfoPanel"
            >
                <ManageDriveInfoPanel />
            </PopupPanel>
        </Transition>
    </div>
</template>
