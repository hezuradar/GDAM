import { useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import type { OrderStatus, PaymentStatus } from '@/domain/types';

interface Tone {
  readonly fg: string;
  readonly bg: string;
}

export interface Theme {
  readonly dark: boolean;
  readonly colors: {
    readonly background: string;
    readonly surface: string;
    readonly surfaceAlt: string;
    readonly text: string;
    readonly textSecondary: string;
    /** Control outlines: ≥ 3:1 against surface and background (WCAG 1.4.11). */
    readonly border: string;
    /** Decorative hairlines only. */
    readonly divider: string;
    readonly primary: string;
    readonly onPrimary: string;
    readonly danger: string;
    readonly onDanger: string;
    readonly warning: Tone;
    readonly focus: string;
  };
  readonly status: Record<OrderStatus, Tone>;
  readonly payment: Record<PaymentStatus, Tone>;
}

/** All foreground/background pairs meet WCAG AA (≥ 4.5:1) for body text. */
const light: Theme = {
  dark: false,
  colors: {
    background: '#F2F2F7',
    surface: '#FFFFFF',
    surfaceAlt: '#E9E9EF',
    text: '#111114',
    textSecondary: '#4A4A50',
    border: '#8A8A90',
    divider: '#C4C4CA',
    primary: '#0B57C9',
    onPrimary: '#FFFFFF',
    danger: '#B3261E',
    onDanger: '#FFFFFF',
    warning: { fg: '#7A4100', bg: '#FFF1D6' },
    focus: '#0B57C9',
  },
  status: {
    borrador: { fg: '#3F3F46', bg: '#E7E7EC' },
    confirmado: { fg: '#0B4AA8', bg: '#DCE9FF' },
    enviado: { fg: '#6A2CA8', bg: '#EFE3FF' },
    recibido: { fg: '#11672F', bg: '#DDF5E4' },
    cancelado: { fg: '#9B1C1C', bg: '#FDE2E2' },
  },
  payment: {
    sin_pagar: { fg: '#9B1C1C', bg: '#FDE2E2' },
    parcial: { fg: '#7A4100', bg: '#FFF1D6' },
    pagado: { fg: '#11672F', bg: '#DDF5E4' },
  },
};

const dark: Theme = {
  dark: true,
  colors: {
    background: '#000000',
    surface: '#1C1C1E',
    surfaceAlt: '#2C2C2E',
    text: '#F5F5F7',
    textSecondary: '#B4B4BB',
    border: '#8E8E93',
    divider: '#48484A',
    primary: '#6EA8FF',
    onPrimary: '#04122B',
    danger: '#FF8A80',
    onDanger: '#2B0300',
    warning: { fg: '#FFD08A', bg: '#3A2A10' },
    focus: '#6EA8FF',
  },
  status: {
    borrador: { fg: '#D4D4DA', bg: '#2C2C30' },
    confirmado: { fg: '#A9C8FF', bg: '#132849' },
    enviado: { fg: '#D9B8FF', bg: '#2E1A47' },
    recibido: { fg: '#9BE3B0', bg: '#123320' },
    cancelado: { fg: '#FFB3AE', bg: '#3D1414' },
  },
  payment: {
    sin_pagar: { fg: '#FFB3AE', bg: '#3D1414' },
    parcial: { fg: '#FFD08A', bg: '#3A2A10' },
    pagado: { fg: '#9BE3B0', bg: '#123320' },
  },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
/** Apple HIG minimum touch target. */
export const MIN_TOUCH = 44;

export const typography = {
  largeTitle: { fontSize: 28, fontWeight: '700' },
  title: { fontSize: 20, fontWeight: '600' },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 17 },
  callout: { fontSize: 15 },
  footnote: { fontSize: 13 },
} as const;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Builds a StyleSheet from the current theme, memoised per theme. */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(factory(theme)), [theme, factory]);
}
