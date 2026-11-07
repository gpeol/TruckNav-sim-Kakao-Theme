/** The route controller reports a rounded duration in hours and minutes. */
export function parseRouteDuration(value: string): number | null {
    const match = value.match(/^\s*(?:~\s*)?(\d+)h\s+(\d+)min\s*$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isSafeInteger(hours) || minutes >= 60) return null;
    return hours * 60 + minutes;
}

export function formatRouteDuration(value: string, locale: string): string {
    const minutes = parseRouteDuration(value);
    if (minutes === null) return value;
    if (locale !== 'ko') return value.trimStart().replace(/^~\s*/, '');
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours ? `${hours}시간 ` : ''}${rest}분`;
}

/** Uses game time for game durations and the device clock for real-time durations. */
export function formatRouteArrival(
    duration: string,
    mode: 'game' | 'real',
    gameTime: string,
    gameConnected: boolean,
    now: Date,
    locale: string,
): string | null {
    const minutes = parseRouteDuration(duration);
    if (minutes === null) return null;
    let hours: number;
    let minute: number;
    if (mode === 'game') {
        if (!gameConnected) return null;
        const match = gameTime.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
        if (!match) return null;
        hours = Number(match[1]);
        minute = Number(match[2]);
    } else {
        if (Number.isNaN(now.getTime())) return null;
        hours = now.getHours();
        minute = now.getMinutes();
    }
    const total = hours * 60 + minute + minutes;
    const days = Math.floor(total / 1440);
    const withinDay = total % 1440;
    const date = new Date(Date.UTC(2000, 0, 1, Math.floor(withinDay / 60), withinDay % 60));
    const display = new Intl.DateTimeFormat(locale, {
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: locale === 'ko',
    }).format(date);
    const daySuffix = days ? ` (+${days}${locale === 'ko' ? '일' : 'd'})` : '';
    return `${display}${daySuffix}`;
}
