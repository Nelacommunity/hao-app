import '@/global.css';

export const Colors = {
  red: '#D7263D',
  redDark: '#A3172B',
  redSoft: '#FDE8EA',
  gold: '#F2B33D',
  goldSoft: '#FEF4DE',
  jade: '#1F9D7A',
  jadeSoft: '#E1F4EE',
  ink: '#1B1A1F',
  inkSoft: '#5E5B66',
  muted: '#9A97A3',
  line: '#ECE7E1',
  paper: '#FFF9F3',
  card: '#FFFFFF',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const Shadow = {
  shadowColor: '#3B1A10',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;
