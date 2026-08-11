export const colors = {
  page: '#F4F6FB',
  surface: '#F3F5FB',
  card: '#FFFFFF',
  ink: '#1F2633',
  muted: '#7D8796',
  subtle: '#A3ABB7',
  line: '#E2E8F0',
  primary: '#4773FF',
  primarySoft: '#EAF0FF',
  orange: '#F97316',
  orangeSoft: '#FFF4E8',
  green: '#10B981',
  greenSoft: '#EAFAF4',
  purple: '#7C3AED',
  purpleSoft: '#F4EFFF',
  danger: '#E5484D',
  dangerSoft: '#FFF0F0',
  overlay: 'rgba(31, 38, 51, 0.42)',
  shadow: 'rgba(31, 38, 51, 0.06)',
} as const;

export const typography = {
  appTitle: { fontSize: 21, lineHeight: 26, fontWeight: '900' as const },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900' as const },
  cardTitle: { fontSize: 13, lineHeight: 19, fontWeight: '800' as const },
  task: { fontSize: 13, lineHeight: 18, fontWeight: '800' as const },
  body: { fontSize: 13, lineHeight: 20, fontWeight: '400' as const },
  meta: { fontSize: 11, lineHeight: 16, fontWeight: '400' as const },
  label: { fontSize: 10, lineHeight: 14, fontWeight: '800' as const },
  control: { fontSize: 12, lineHeight: 16, fontWeight: '800' as const },
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 14,
  xxxl: 16,
  page: 14,
} as const;

export const radius = {
  small: 8,
  medium: 14,
  large: 20,
  sheet: 24,
  pill: 999,
} as const;

export const border = {
  width: 1,
  color: colors.line,
} as const;

export const shadows = {
  soft: { boxShadow: `0px 8px 18px ${colors.shadow}` },
  floating: { boxShadow: '0px 12px 28px rgba(31, 38, 51, 0.10)' },
} as const;

// 兼容现有页面的 shared import；新代码优先显式选择 shadows.soft / floating。
export const shadow = shadows.soft;

export const layout = {
  appMaxWidth: 480,
  calendarMaxWidth: 1120,
  pageGutter: spacing.page,
  bottomNavHeight: 58,
  bottomNavInset: 10,
  floatingActionSize: 54,
} as const;
