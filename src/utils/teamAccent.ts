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
