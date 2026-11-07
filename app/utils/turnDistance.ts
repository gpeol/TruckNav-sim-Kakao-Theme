export function formatTurnDistance(km: number, unit: 'km' | 'mi') {
    const distance = Math.max(0, Number.isFinite(km) ? km : 0);
    if (unit === 'mi') {
        const miles = distance * 0.621371;
        return miles < 0.1
            ? { value: Math.round(miles * 5280 / 10) * 10, unit: 'ft' }
            : { value: Math.round(miles * 10) / 10, unit: 'mi' };
    }
    return distance < 1
        ? { value: Math.round(distance * 1000), unit: 'm' }
        : { value: Math.round(distance * 10) / 10, unit: 'km' };
}
