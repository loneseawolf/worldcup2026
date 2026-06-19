import type { Match, MatchLineups, TeamLineup } from '../types'

export type TimelineKind = 'goal' | 'card' | 'sub'

/** one chronological match event derived from a team's lineup data */
export interface TimelineEvent {
  key: string
  minute: string | null
  /** numeric minute for sorting (90+2 -> 90); null/unknown -> 0 */
  minNum: number
  kind: TimelineKind
  /** team code the event belongs to */
  code: string | null
  // --- goal ---
  own?: boolean
  pen?: boolean
  // --- card ---
  card?: 'y' | 'r'
  // --- player(s) ---
  /** primary player: scorer, booked player, or the sub coming ON */
  name: string
  num: number | null
  playerCode: string | null
  // --- sub only ---
  offName?: string
  offNum?: number | null
}

function minNumOf(minute: string | null): number {
  return parseInt(minute || '0', 10) || 0
}

/**
 * Build a single chronological list of goals, cards and substitutions from a
 * match's lineup data. Shared by the Live feed and (potentially) MatchDetail —
 * the same goal/card/sub collection logic lives in MatchDetail.tsx.
 *
 * Returned unsorted; callers sort by `minNum` (Live uses newest-first).
 */
export function buildMatchTimeline(m: Match, lu: MatchLineups | undefined): TimelineEvent[] {
  if (!lu) return []
  const events: TimelineEvent[] = []
  const sides: [TeamLineup | null, TeamLineup | null, string | null, string | null][] = [
    [lu.home, lu.away, m.home?.code ?? null, m.away?.code ?? null],
    [lu.away, lu.home, m.away?.code ?? null, m.home?.code ?? null],
  ]
  for (const [tl, other, code, otherCode] of sides) {
    if (!tl) continue
    const all = [...tl.xi, ...tl.subs]
    // own goals sit in the benefiting team's goals with the opponent player's id
    const opponents = other ? [...other.xi, ...other.subs] : []
    tl.goals.forEach((g, i) => {
      if (g.period === 11) return // shootout kicks are not goals
      const own = g.type === 3
      const p = (own ? opponents : all).find((x) => x.id === g.player)
      events.push({
        key: `g-${code ?? 'x'}-${i}`,
        minute: g.minute,
        minNum: minNumOf(g.minute),
        kind: 'goal',
        code,
        own,
        pen: g.type === 1,
        name: p?.name || g.player,
        num: p?.number ?? null,
        // an own-goal scorer belongs to the opponent (their own) squad
        playerCode: own ? otherCode : code,
      })
    })
    tl.bookings.forEach((b, i) => {
      const red = (b.card ?? 0) >= 2
      const p = all.find((x) => x.id === b.player)
      events.push({
        key: `c-${code ?? 'x'}-${i}`,
        minute: b.minute,
        minNum: minNumOf(b.minute),
        kind: 'card',
        code,
        card: red ? 'r' : 'y',
        name: p?.name || b.player,
        num: p?.number ?? null,
        playerCode: code,
      })
    })
    ;(tl.substitutions ?? []).forEach((sub, i) => {
      const onP = all.find((x) => x.id === sub.on)
      const offP = all.find((x) => x.id === sub.off)
      events.push({
        key: `s-${code ?? 'x'}-${i}`,
        minute: sub.minute,
        minNum: minNumOf(sub.minute),
        kind: 'sub',
        code,
        name: onP?.name || sub.on,
        num: onP?.number ?? null,
        playerCode: code,
        offName: offP?.name || sub.off,
        offNum: offP?.number ?? null,
      })
    })
  }
  return events
}
