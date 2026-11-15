import dictionary from '../data/koreanCityNames.json';

export interface NamedGameCity { token: string; name: string; countryToken: string }
export interface CityNameContext { locale: string; selectedGame: string | null; activeMod: string }

/** Exact, offline city identity matching; this never translates free-form names. */
export function localizedCityName(city: NamedGameCity, cities: readonly NamedGameCity[], context: CityNameContext): string {
    if (context.locale !== 'ko' || context.selectedGame !== 'ets2' || context.activeMod !== 'none') return city.name;
    if (cities.filter(other => other.token === city.token && other.countryToken === city.countryToken).length !== 1) return city.name;
    const matches = dictionary.records.filter(row => row.token === city.token && row.countryToken === city.countryToken && row.originalName.normalize('NFC') === city.name.normalize('NFC'));
    return matches.length === 1 ? matches[0]!.koreanName : city.name;
}

/** Country localization is paired with a verified city to avoid implying unknown names were verified. */
export function localizedCityCountry(city: NamedGameCity, cities: readonly NamedGameCity[], context: CityNameContext): string | null {
    if (localizedCityName(city, cities, context) === city.name) return null;
    const matches = dictionary.countries.filter(row => row.countryToken === city.countryToken);
    return matches.length === 1 ? matches[0]!.koreanName : null;
}
