import type { MatchLineups, TeamLineup } from '../types'

export interface PitchAnnotations {
  /** player id -> card shown on the pitch dot (red latches over yellow) */
  marks: Record<string, { card?: 'y' | 'r' }>
  /** player id -> minute substituted off */
  subOff: Record<string, string>
  /** player id -> goal minutes string, e.g. "5', 90'" */
  goals: Record<string, string>
}

/**
 * Per-player pitch annotations (cards, sub-off minutes, goal minutes) keyed by
 * lineup player id. Shared by MatchPitch (Live) so the pitch carries the same
 * marks as the match-detail page without duplicating the collection logic.
 */
export function pitchAnnotations(lu: MatchLineups | undefined): PitchAnnotations {
  const marks: Record<string, { card?: 'y' | 'r' }> = {}
  const subOff: Record<string, string> = {}
  const goalMins: Record<string, string[]> = {}
  const sides: (TeamLineup | null | undefined)[] = [lu?.home, lu?.away]
  for (const tl of sides) {
    if (!tl) continue
    tl.bookings.forEach((b) => {
      const red = (b.card ?? 0) >= 2
      marks[b.player] = { card: red ? 'r' : marks[b.player]?.card === 'r' ? 'r' : 'y' }
    })
    for (const sub of tl.substitutions ?? []) if (sub.minute) subOff[sub.off] = sub.minute
    for (const g of tl.goals ?? []) {
      if (g.type === 3 || g.period === 11 || !g.minute) continue
      goalMins[g.player] = goalMins[g.player] ?? []
      goalMins[g.player].push(g.minute)
    }
  }
  const goals: Record<string, string> = {}
  for (const [id, mins] of Object.entries(goalMins))
    goals[id] = mins.sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0)).join(', ')
  return { marks, subOff, goals }
}
