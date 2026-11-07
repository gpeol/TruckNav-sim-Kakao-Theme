export function mapFontFamily(fontFamily: string | null | undefined): string {
    // MapLibre reads PBF glyphs, not the CSS @font-face files used by the UI.
    // These two families have no bundled glyphs, so keep map labels readable.
    return fontFamily === 'KakaoBigFont' || fontFamily === 'KakaoSmallFont'
        ? 'Commissioner'
        : fontFamily || 'Commissioner';
}
