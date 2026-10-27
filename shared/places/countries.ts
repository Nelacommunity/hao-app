// Nationalities for the profile picker and the "Liked by people from …" line. Regions match
// public.country_groups (supabase/migrations/*_community_stats.sql).
import { tx } from '../i18n/tx.ts';

/** Adjective used in "Popular with East African students in Beijing". */
export const RegionLabels: Record<string, string> = {
  east_africa: tx('East African'),
  west_africa: tx('West African'),
  central_africa: tx('Central African'),
  southern_africa: tx('Southern African'),
  north_africa: tx('North African'),
  middle_east: tx('Middle Eastern'),
  south_asia: tx('South Asian'),
  southeast_asia: tx('Southeast Asian'),
  east_asia: tx('East Asian'),
  central_asia: tx('Central Asian'),
  eastern_europe: tx('Eastern European'),
  western_europe: tx('Western European'),
  northern_europe: tx('Nordic and Baltic'),
  southern_europe: tx('Southern European'),
  north_america: tx('North American'),
  latin_america: tx('Latin American'),
  oceania: tx('Oceanian'),
};

/** ISO 3166-1 alpha-2 → English name. Shown in the user's language where the platform can (Intl.DisplayNames). */
export const Countries: Record<string, string> = {
  AF: 'Afghanistan', AL: 'Albania', DZ: 'Algeria', AO: 'Angola', AR: 'Argentina', AM: 'Armenia', AU: 'Australia', AT: 'Austria',
  AZ: 'Azerbaijan', BH: 'Bahrain', BD: 'Bangladesh', BY: 'Belarus', BE: 'Belgium', BJ: 'Benin', BT: 'Bhutan', BO: 'Bolivia',
  BA: 'Bosnia and Herzegovina', BW: 'Botswana', BR: 'Brazil', BN: 'Brunei', BG: 'Bulgaria', BF: 'Burkina Faso', BI: 'Burundi',
  KH: 'Cambodia', CM: 'Cameroon', CA: 'Canada', CV: 'Cape Verde', CF: 'Central African Republic', TD: 'Chad', CL: 'Chile',
  CO: 'Colombia', KM: 'Comoros', CG: 'Congo', CD: 'DR Congo', CR: 'Costa Rica', CI: 'Côte d’Ivoire', HR: 'Croatia', CU: 'Cuba',
  CY: 'Cyprus', CZ: 'Czechia', DK: 'Denmark', DJ: 'Djibouti', DO: 'Dominican Republic', EC: 'Ecuador', EG: 'Egypt',
  SV: 'El Salvador', GQ: 'Equatorial Guinea', ER: 'Eritrea', EE: 'Estonia', SZ: 'Eswatini', ET: 'Ethiopia', FJ: 'Fiji',
  FI: 'Finland', FR: 'France', GA: 'Gabon', GM: 'Gambia', GE: 'Georgia', DE: 'Germany', GH: 'Ghana', GR: 'Greece',
  GT: 'Guatemala', GN: 'Guinea', GW: 'Guinea-Bissau', HT: 'Haiti', HN: 'Honduras', HK: 'Hong Kong', HU: 'Hungary',
  IS: 'Iceland', IN: 'India', ID: 'Indonesia', IR: 'Iran', IQ: 'Iraq', IE: 'Ireland', IL: 'Israel', IT: 'Italy', JM: 'Jamaica',
  JP: 'Japan', JO: 'Jordan', KZ: 'Kazakhstan', KE: 'Kenya', KW: 'Kuwait', KG: 'Kyrgyzstan', LA: 'Laos', LV: 'Latvia',
  LB: 'Lebanon', LS: 'Lesotho', LR: 'Liberia', LY: 'Libya', LI: 'Liechtenstein', LT: 'Lithuania', LU: 'Luxembourg',
  MO: 'Macao', MG: 'Madagascar', MW: 'Malawi', MY: 'Malaysia', MV: 'Maldives', ML: 'Mali', MT: 'Malta', MR: 'Mauritania',
  MU: 'Mauritius', MX: 'Mexico', MD: 'Moldova', MC: 'Monaco', MN: 'Mongolia', ME: 'Montenegro', MA: 'Morocco',
  MZ: 'Mozambique', MM: 'Myanmar', NA: 'Namibia', NP: 'Nepal', NL: 'Netherlands', NZ: 'New Zealand', NI: 'Nicaragua',
  NE: 'Niger', NG: 'Nigeria', KP: 'North Korea', MK: 'North Macedonia', NO: 'Norway', OM: 'Oman', PK: 'Pakistan',
  PS: 'Palestine', PA: 'Panama', PG: 'Papua New Guinea', PY: 'Paraguay', PE: 'Peru', PH: 'Philippines', PL: 'Poland',
  PT: 'Portugal', QA: 'Qatar', RO: 'Romania', RU: 'Russia', RW: 'Rwanda', WS: 'Samoa', ST: 'São Tomé and Príncipe',
  SA: 'Saudi Arabia', SN: 'Senegal', RS: 'Serbia', SC: 'Seychelles', SL: 'Sierra Leone', SG: 'Singapore', SK: 'Slovakia',
  SI: 'Slovenia', SB: 'Solomon Islands', SO: 'Somalia', ZA: 'South Africa', KR: 'South Korea', SS: 'South Sudan', ES: 'Spain',
  LK: 'Sri Lanka', SD: 'Sudan', SE: 'Sweden', CH: 'Switzerland', SY: 'Syria', TW: 'Taiwan', TJ: 'Tajikistan', TZ: 'Tanzania',
  TH: 'Thailand', TL: 'Timor-Leste', TG: 'Togo', TO: 'Tonga', TT: 'Trinidad and Tobago', TN: 'Tunisia', TR: 'Türkiye',
  TM: 'Turkmenistan', UG: 'Uganda', UA: 'Ukraine', AE: 'United Arab Emirates', GB: 'United Kingdom', US: 'United States',
  UY: 'Uruguay', UZ: 'Uzbekistan', VU: 'Vanuatu', VE: 'Venezuela', VN: 'Vietnam', YE: 'Yemen', ZM: 'Zambia', ZW: 'Zimbabwe',
};

export const isCountryCode = (value: unknown): value is string => typeof value === 'string' && value in Countries;

