export type ThemeMode = "auto" | "day" | "night";
export type ThemeClock = "device" | "game";

/** Game clock is already formatted in UTC by the telemetry adapter. */
export function resolveTheme(mode: ThemeMode, clock: ThemeClock, deviceHour: number, gameTime = "", connected = false): "day" | "night" {
    if (mode === "day" || mode === "night") return mode;
    const match = connected && clock === "game" ? gameTime.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/) : null;
    const hour = match ? Number(match[1]) : deviceHour;
    return hour >= 6 && hour < 18 ? "day" : "night";
}

export const mapThemes = {
    day: { backgroundColor: "#a9cdea", landColor: "#e7e8e7", roadColor: "#ffffff", text: "#29313c", halo: "#ffffff", border: "#a8b5bd", zone: "#d9dfce", prefab: "#e7dba8" },
    night: { backgroundColor: "#263e49", landColor: "#343943", roadColor: "#5b6069", text: "#edf2f7", halo: "#202b36", border: "#405162", zone: "#2b3945", prefab: "#4c4935" },
} as const;
