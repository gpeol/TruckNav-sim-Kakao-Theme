import type { Map } from "maplibre-gl";
import type { mapThemes } from "./theme";

type MapPalette = { [K in keyof typeof mapThemes.day]: string };

/** Update paint only: sources, camera, routes and telemetry stay intact. */
export function applyMapTheme(map: Map, palette: MapPalette) {
    const paint = (id: string, property: string, color: string) => {
        if (map.getLayer(id)) map.setPaintProperty(id, property, color);
    };
    paint("background", "background-color", palette.backgroundColor);
    paint("water", "fill-color", palette.landColor);
    paint("country-borders", "fill-color", palette.landColor);
    paint("water-outline", "line-color", palette.border);
    paint("roads", "line-color", palette.roadColor);
    paint("lines", "line-color", palette.border);
    paint("state-borders", "line-color", palette.border);
    paint("maparea-zones", "fill-color", palette.zone);
    paint("prefab-zones", "fill-color", palette.prefab);
    for (const id of ["village-labels", "city-labels", "capital-major-labels", "country-labels"]) {
        paint(id, "text-color", palette.text);
        paint(id, "text-halo-color", palette.halo);
        if (map.getLayer(id)) map.setPaintProperty(id, "text-halo-width", 1.5);
    }
}
