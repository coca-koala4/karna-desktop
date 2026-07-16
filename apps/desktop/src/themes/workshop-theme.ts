import { useTheme } from './context'

export function useWorkshopTheme() {
  const { theme, renderedMode } = useTheme()
  const colors = theme.colors

  return {
    background: colors.background,
    foreground: colors.foreground,
    card: colors.card,
    cardForeground: colors.cardForeground,
    border: colors.border,
    primary: colors.primary,
    primaryForeground: colors.primaryForeground,
    secondary: colors.secondary,
    secondaryForeground: colors.secondaryForeground,
    accent: colors.accent,
    accentForeground: colors.accentForeground,
    muted: colors.muted,
    mutedForeground: colors.mutedForeground,
    destructive: colors.destructive,
    destructiveForeground: colors.destructiveForeground,
    ring: colors.ring,
    isDark: renderedMode === 'dark'
  }
}

export const THEME_VARS = {
  bg: 'var(--theme-background-seed)',
  fg: 'var(--theme-foreground)',
  card: 'var(--theme-card-seed)',
  primary: 'var(--theme-primary)',
  secondary: 'var(--theme-secondary)',
  accent: 'var(--theme-accent-soft)',
  border: 'var(--dt-border)',
  input: 'var(--dt-input)',
  ring: 'var(--dt-ring)',
  muted: 'var(--dt-muted)',
  mutedFg: 'var(--theme-foreground)',
  destructive: 'var(--dt-destructive)',
  composerRing: 'var(--dt-composer-ring)'
}

export const gradientFromTheme = (isDark: boolean) => ({
  nebula1: isDark
    ? 'radial-gradient(ellipse at 15% 20%, var(--theme-primary) 0%, transparent 45%)'
    : 'radial-gradient(ellipse at 15% 20%, var(--theme-primary) 0%, transparent 45%)',
  nebula2: isDark
    ? 'radial-gradient(ellipse at 85% 80%, var(--theme-accent-soft) 0%, transparent 45%)'
    : 'radial-gradient(ellipse at 85% 80%, var(--theme-accent-soft) 0%, transparent 45%)',
  bubble: isDark
    ? 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)'
    : 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
  glow: isDark
    ? `var(--theme-primary)`
    : `var(--theme-primary)`
})