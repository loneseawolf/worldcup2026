// Derives a readable accent from a team's brand colors for the champion-driven
// re-skin. The picked champion recolors --accent / --accent-text / --live; this
// helper guards contrast so the result reads on the current theme — falling back
// to the hunter-green default (null) when a team has no usable color.

interface RGB {
  r: number
  g: number
  b: number
}

/** parse #rgb / #rrggbb (with or without leading #); null if not a hex color */
function parseHex(input: string): RGB | null {
  let h = input.trim().replace(/^#/, '')
  if (h.length === 3) h = h.replace(/./g, (c) => c + c)
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  }
}

function toHex({ r, g, b }: RGB): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** WCAG relative luminance (0 = black, 1 = white) */
function luminance({ r, g, b }: RGB): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function darken({ r, g, b }: RGB, f: number): RGB {
  return { r: r * (1 - f), g: g * (1 - f), b: b * (1 - f) }
}
function lighten({ r, g, b }: RGB, f: number): RGB {
  return { r: r + (255 - r) * f, g: g + (255 - g) * f, b: b + (255 - b) * f }
}

export interface Accent {
  accent: string // fill color (white text reads on it) + live indicator
  accentText: string // accent usable as text on the current theme's surfaces
}

/**
 * Resolve a team's color list into a theme-aware accent.
 * @param colors  team.colors[] (brand colors, primary first)
 * @param dark    whether the active theme is dark
 * @returns null when no usable color exists (caller falls back to hunter green)
 */
export function teamAccent(colors: string[] | undefined, dark: boolean): Accent | null {
  const parsed = (colors ?? []).map(parseHex).filter((c): c is RGB => c !== null)
  if (!parsed.length) return null

  // pick a base color that isn't near-white (invisible on light surfaces, glaring
  // on dark) and isn't near-black (invisible on the near-black dark theme)
  const usable = (c: RGB) => luminance(c) < 0.82 && luminance(c) > 0.04
  let base = parsed.find(usable) ?? parsed[0]

  // last-resort: a near-white primary with no usable alternative — nudge toward
  // a mid grey-green so it still recolors something instead of vanishing
  if (luminance(base) >= 0.82) base = darken(base, 0.55)
  else if (luminance(base) <= 0.04) base = lighten(base, 0.45)

  // fill: white text sits on --accent (buttons, chips), so darken until white
  // clears the WCAG AA-large (3:1) bar — luminance ≤ ~0.30 (e.g. BRA gold, ARG
  // sky-blue lose just enough lightness to stay legible without going muddy)
  let fill = base
  let guard = 0
  while (luminance(fill) > 0.3 && guard++ < 14) fill = darken(fill, 0.1)

  // text: --accent-text must read on the theme's surfaces
  let text = base
  guard = 0
  if (dark) {
    // near-black bg (#0A0A0A) — lighten until it lifts off the background
    while (luminance(text) < 0.3 && guard++ < 12) text = lighten(text, 0.18)
  } else {
    // light page bg — darken until it has body-text-level contrast
    while (luminance(text) > 0.32 && guard++ < 12) text = darken(text, 0.14)
  }

  return { accent: toHex(fill), accentText: toHex(text) }
}

/** is the active theme dark? mirrors SettingsContext's data-theme logic */
export function isDarkTheme(theme: string): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
}

export interface TeamBarColors {
  /** home fill, or null when no usable color (caller keeps its CSS default) */
  home: string | null
  /** away fill, or null when no usable color */
  away: string | null
}

/**
 * Resolve home/away bar/dot fill colors from each team's brand colors (the
 * contrast-guarded `--accent` fill, so white text/numbers read on them).
 * Returns null for a side with no usable color — the caller keeps its existing
 * neutral default. **Distinctness guard:** when both sides resolve but the two
 * fills are near-identical (small RGB distance), the home side drops to null
 * (neutral) so the two sides never read as the same color. Flags + codes are
 * the primary "who is who" signal; color only reinforces it.
 */
export function teamBarColors(
  homeColors: string[] | undefined,
  awayColors: string[] | undefined,
  dark: boolean,
): TeamBarColors {
  const home = teamAccent(homeColors, dark)?.accent ?? null
  const away = teamAccent(awayColors, dark)?.accent ?? null
  if (home && away) {
    const ch = parseHex(home)
    const ca = parseHex(away)
    if (ch && ca) {
      const dist = Math.hypot(ch.r - ca.r, ch.g - ca.g, ch.b - ca.b)
      // ~441 is the max RGB distance; <44 reads as the same color at a glance
      if (dist < 44) return { home: null, away }
    }
  }
  return { home, away }
}

/** WCAG contrast ratio (1–21) between two relative luminances */
function contrastRatio(l1: number, l2: number): number {
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

export interface SlotColors {
  /** slot body — the team's raw national primary (vivid, never near-white) */
  bg: string
  /** name ink — black or white, whichever wins WCAG contrast on `bg` (always ≥ AA) */
  ink: string
  /** secondary accent — winner left-bar + champion-path tint, distinct from `bg` */
  pill: string
}

/**
 * Resolve a team's brand colors into a vivid, readable Pick'ems slot skin:
 * a national-color body, an auto black/white ink picked for maximum WCAG
 * contrast on that body (bottoms out ≈4.58:1, so normal text always clears AA),
 * and a distinct secondary pill for the winner bar / champion-path accent.
 * Returns null when no color parses (caller keeps a neutral default slot).
 */
export function slotColors(colors: string[] | undefined): SlotColors | null {
  const raw = colors ?? []
  const c0 = raw[0] ? parseHex(raw[0]) : null
  const c1 = raw[1] ? parseHex(raw[1]) : null
  const base = c0 ?? c1
  if (!base) return null

  // bg: a visible, vivid body. A near-white primary would wash the slot out, so
  // fall back to a darker secondary; failing that, darken the primary itself.
  let bgRgb = base
  if (luminance(bgRgb) >= 0.78) {
    if (c1 && c1 !== base && luminance(c1) < 0.78) bgRgb = c1
    else bgRgb = darken(bgRgb, 0.4)
  }

  // ink: whichever of white / a warm near-black ink has the higher contrast on
  // bg. The warm ink's tiny luminance leaves a thin "dead zone" of mid-toned
  // bodies (≈L 0.18) where neither ink quite clears AA, so when the best ink
  // still falls short we darken the body until white reads — readability is the
  // hard requirement, and a darkened body only deepens the national color.
  const darkInk: RGB = { r: 0x15, g: 0x11, b: 0x0a }
  const lInk = luminance(darkInk)
  const inkOf = (rgb: RGB) =>
    contrastRatio(luminance(rgb), 1) >= contrastRatio(luminance(rgb), lInk) ? '#ffffff' : '#15110a'
  const contrastOf = (rgb: RGB) => {
    const l = luminance(rgb)
    return Math.max(contrastRatio(l, 1), contrastRatio(l, lInk))
  }
  let guard = 0
  while (contrastOf(bgRgb) < 4.5 && guard++ < 12) bgRgb = darken(bgRgb, 0.1)
  const lbg = luminance(bgRgb)
  const ink = inkOf(bgRgb)

  // pill: the secondary when it reads as a distinct color from bg (same RGB-
  // distance idea as teamBarColors), else a shifted bg — lighten a dark body,
  // darken a light one — so the winner bar always separates from the slot.
  let pillRgb: RGB
  if (c1 && Math.hypot(c1.r - bgRgb.r, c1.g - bgRgb.g, c1.b - bgRgb.b) >= 44) {
    pillRgb = c1
  } else {
    pillRgb = lbg < 0.4 ? lighten(bgRgb, 0.4) : darken(bgRgb, 0.32)
  }

  return { bg: toHex(bgRgb), ink, pill: toHex(pillRgb) }
}
