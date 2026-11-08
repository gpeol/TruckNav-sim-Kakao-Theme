import { mapThemes, resolveTheme } from "~/utils/theme";

export const useNavigationTheme = () => {
    const { settings, activeSettings } = useSettings();
    const { gameTime, gameConnected } = useEtsTelemetry();
    const deviceHour = useState("theme-device-hour", () => new Date().getHours());
    const resolvedTheme = computed(() => resolveTheme(settings.value.themeMode, settings.value.themeClock, deviceHour.value, gameTime.value, gameConnected.value));
    const mapPalette = computed(() => ({
        ...mapThemes[resolvedTheme.value],
        ...(settings.value.customMapColors ? {
            backgroundColor: activeSettings.value.backgroundColor,
            landColor: activeSettings.value.landColor,
            roadColor: activeSettings.value.roadColor,
        } : {}),
    }));
    return { resolvedTheme, mapPalette, deviceHour };
};

/** Mount once at the application root; every screen shares the same clock. */
export const useThemeLifecycle = () => {
    const { resolvedTheme, deviceHour } = useNavigationTheme();
    const { settings } = useSettings();
    const refresh = () => { deviceHour.value = new Date().getHours(); };
    let timer: ReturnType<typeof setInterval>;
    watchEffect(() => {
        if (import.meta.client) {
            document.documentElement.dataset.theme = resolvedTheme.value;
            document.documentElement.style.colorScheme = resolvedTheme.value === "night" ? "dark" : "light";
            document.documentElement.lang = settings.value.locale;
        }
    });
    onMounted(() => {
        refresh();
        timer = setInterval(refresh, 30_000);
        document.addEventListener("visibilitychange", refresh);
        window.addEventListener("focus", refresh);
    });
    onUnmounted(() => {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", refresh);
        window.removeEventListener("focus", refresh);
    });
};
