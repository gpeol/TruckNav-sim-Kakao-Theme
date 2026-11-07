/** Only the authenticated local preview gateway inserts this marker into its HTML. */
export function isSecurePreviewDocument(): boolean {
    return typeof document !== 'undefined' &&
        document.querySelector('meta[name="trucknav-secure-preview"][content="1"]') !== null;
}

export function telemetrySocketUrl(
    host: string,
    savedIP: string | null,
    isNative: boolean,
    isSecurePreview: boolean,
    pageProtocol: string,
    pageHost: string,
): string {
    if (!isNative && isSecurePreview) {
        const scheme = pageProtocol === 'https:' ? 'wss:' : 'ws:';
        return `${scheme}//${pageHost}/__trucknav/telemetry`;
    }
    return `ws://${isNative ? savedIP : host}:30001`;
}
