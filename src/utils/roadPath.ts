// "Road to Finals" projection: given a chosen champion, walk the knockout bracket
// and, at every round, pick the most-likely opponent (the higher-rated probable
// winner of the feeding slot) using the same Elo model as the forecast engine.
//
// Pure functions only — the page stays thin and this stays easy to reason about.

import type { Match, Standings, Team, Venue } from '../types'
import type { SimModel } from '../sim/engine'
import { assignThirds, pairProbs } from '../sim/engine'
import { resolvedSlots } from './bracketResolve'

export type RoundKey = 'r32' | 'r16' | 'qf' | 'sf' | 'final'
export const ROUND_KEYS: RoundKey[] = ['r32', 'r16', 'qf', 'sf', 'final']

export type Difficulty = 'easy' | 'tough' | 'brutal'

export interface RoundStep {
  round: RoundKey
  matchN: number
  /** opponent shown (override if set, else the projected most-likely opponent) */
  opponent: string
  /** the model's most-likely opponent, before any manual override */
  projectedOpponent: string
  overridden: boolean
  /** champion's probability of advancing past this opponent (incl. ET/pens) */
  winProb: number
  difficulty: Difficulty
  venueId: string | null
}

export interface RoadPath {
  champion: string
  steps: RoundStep[]
  /** product of per-round advance probabilities along this exact path */
  titleOdds: number
  ok: boolean
}

const DEFAULT_ELO = 1600

/** champion's chance to advance past one opponent: 90' win + its share of draws
 * that go its way through extra time / penalties */
export function advanceProb(model: SimModel, champ: string, opp: string, venueCountry?: string): number {
  const { h, d, a } = pairProbs(model, champ, opp, venueCountry)
  const decisive = h + a
  return h + d * (decisive > 0 ? h / decisive : 0.5)
}

function pickWinner(model: SimModel, home: string, away: string, venueCountry?: string): string {
  return advanceProb(model, home, away, venueCountry) >= 0.5 ? home : away
}

export function difficultyOf(model: SimModel, code: string): Difficulty {
  const r = model.teams[code]?.r ?? DEFAULT_ELO
  if (r >= 2030) return 'brutal' // ~top-9 sides
  if (r >= 1900) return 'tough'
  return 'easy'
}

function eloOf(model: SimModel, code: string): number {
  return model.teams[code]?.r ?? DEFAULT_ELO
}

interface Projection {
  /** group letter -> [rank1, rank2, rank3, rank4] team codes, projected by Elo */
  groupPos: Record<string, string[]>
  /** groups whose third-placed team is projected to qualify (best 8 of 12) */
  thirdGroups: string[]
}

function projectGroups(model: SimModel, teams: Record<string, Team>): Projection {
  const byGroup: Record<string, string[]> = {}
  for (const tm of Object.values(teams)) {
    if (!byGroup[tm.group]) byGroup[tm.group] = []
    byGroup[tm.group].push(tm.code)
  }
  const groupPos: Record<string, string[]> = {}
  for (const [g, codes] of Object.entries(byGroup)) {
    groupPos[g] = codes.slice().sort((a, b) => eloOf(model, b) - eloOf(model, a))
  }
  const thirds = Object.entries(groupPos)
    .map(([g, arr]) => ({ g, elo: eloOf(model, arr[2]) }))
    .sort((x, y) => y.elo - x.elo)
  return { groupPos, thirdGroups: thirds.slice(0, 8).map((t) => t.g) }
}

interface Resolver {
  ko: Match[]
  /** known/projected team code on a side of a match ('A' = home, 'B' = away) */
  sideOf: (m: Match, side: 'A' | 'B') => string | undefined
}

function buildResolver(
  matches: Match[],
  standings: Standings,
  teams: Record<string, Team>,
  model: SimModel,
  venues: Record<string, Venue>,
): Resolver {
  const ko = matches.filter((m) => m.stage !== 'group').sort((a, b) => a.n - b.n)
  const realOverlay = resolvedSlots(matches, standings)
  const { groupPos, thirdGroups } = projectGroups(model, teams)

  // assign projected qualifying thirds to the bracket's third-place slots
  const thirdSlots = ko
    .flatMap((m) => [m.phA, m.phB])
    .filter((ph): ph is string => !!ph && /^3[A-L]{2,}$/.test(ph))
  const assigned = assignThirds(
    thirdSlots.map((ph) => ph.slice(1).split('')),
    thirdGroups,
  )
  const thirdBySlot = new Map<string, string>()
  thirdSlots.forEach((ph, i) => {
    const g = assigned[i]
    if (g) thirdBySlot.set(ph, g)
  })

  const projWinner = new Map<number, string>()

  // resolvePh and sideOf are mutually recursive (L/RU needs both sides; a side may
  // be a placeholder) — declared as hoisted functions so either can call the other
  function resolvePh(ph: string | null): string | undefined {
    if (!ph) return undefined
    let m = /^([1-3])([A-L])$/.exec(ph)
    if (m) return groupPos[m[2]]?.[Number(m[1]) - 1]
    m = /^W(\d+)$/.exec(ph)
    if (m) return projWinner.get(Number(m[1]))
    m = /^(?:L|RU)(\d+)$/.exec(ph)
    if (m) {
      // loser/runner-up of a match: the side that the projected winner isn't
      const n = Number(m[1])
      const src = ko.find((k) => k.n === n)
      if (!src) return undefined
      const w = projWinner.get(n)
      const h = sideOf(src, 'A')
      const a = sideOf(src, 'B')
      return w && w === h ? a : h
    }
    if (/^3[A-L]{2,}$/.test(ph)) {
      const g = thirdBySlot.get(ph)
      return g ? groupPos[g]?.[2] : undefined
    }
    return undefined
  }

  // prefer a really-decided team, then the projection
  function sideOf(m: Match, side: 'A' | 'B'): string | undefined {
    const actual = side === 'A' ? m.home?.code : m.away?.code
    if (actual) return actual
    const ov = realOverlay[m.id]
    const real = side === 'A' ? ov?.home : ov?.away
    if (real) return real
    return resolvePh(side === 'A' ? m.phA : m.phB)
  }

  // precompute the most-likely winner of every knockout match (match-number order,
  // so W-references always resolve from already-computed earlier rounds)
  for (const m of ko) {
    const home = sideOf(m, 'A')
    const away = sideOf(m, 'B')
    if (!home || !away) continue
    const vc = m.venueId ? venues[m.venueId]?.country : undefined
    projWinner.set(m.n, pickWinner(model, home, away, vc))
  }

  return { ko, sideOf }
}

/**
 * Build the champion's projected road to the final. Opponents are the model's
 * most-likely occupant of each feeding slot; `overrides` swaps an opponent at a
 * given round (downstream odds recompute, the rest of the path is unaffected
 * because each round's opponent comes from a disjoint half of the bracket).
 */
export function buildRoadPath(
  champion: string,
  model: SimModel | null,
  matches: Match[],
  standings: Standings,
  teams: Record<string, Team>,
  venues: Record<string, Venue>,
  overrides: Partial<Record<RoundKey, string>> = {},
): RoadPath {
  const empty: RoadPath = { champion, steps: [], titleOdds: 0, ok: false }
  if (!champion || !model || !teams[champion]) return empty

  const { ko, sideOf } = buildResolver(matches, standings, teams, model, venues)
  const group = teams[champion].group

  // entry slot: group winner, else runner-up — skipping a slot a different team
  // already really occupies (e.g. host Mexico is fixed at 1A)
  let current: Match | undefined
  let champSide: 'A' | 'B' = 'A'
  for (const slot of [`1${group}`, `2${group}`]) {
    const m = ko.find((k) => k.stage === 'r32' && (k.phA === slot || k.phB === slot))
    if (!m) continue
    const side: 'A' | 'B' = m.phA === slot ? 'A' : 'B'
    const actual = side === 'A' ? m.home?.code : m.away?.code
    if (actual && actual !== champion) continue
    current = m
    champSide = side
    break
  }
  // fallback: champion already placed into the bracket by real results
  if (!current) {
    const m = ko.find(
      (k) => k.stage === 'r32' && (sideOf(k, 'A') === champion || sideOf(k, 'B') === champion),
    )
    if (m) {
      current = m
      champSide = sideOf(m, 'A') === champion ? 'A' : 'B'
    }
  }
  if (!current) return empty

  const vcOf = (m: Match) => (m.venueId ? venues[m.venueId]?.country : undefined)
  const steps: RoundStep[] = []
  let titleOdds = 1
  let prevN: number | null = null

  while (current) {
    const side: 'A' | 'B' = prevN === null ? champSide : current.phA === `W${prevN}` ? 'A' : 'B'
    const oppSide: 'A' | 'B' = side === 'A' ? 'B' : 'A'
    const projectedOpponent = sideOf(current, oppSide) ?? ''
    const round = current.stage as RoundKey
    const override = overrides[round]
    const opponent = override && override !== champion ? override : projectedOpponent

    const winProb = opponent ? advanceProb(model, champion, opponent, vcOf(current)) : 0
    titleOdds *= winProb
    steps.push({
      round,
      matchN: current.n,
      opponent,
      projectedOpponent,
      overridden: !!override && override !== projectedOpponent && override !== champion,
      winProb,
      difficulty: opponent ? difficultyOf(model, opponent) : 'easy',
      venueId: current.venueId,
    })

    if (round === 'final') break
    prevN = current.n
    current = ko.find((k) => k.phA === `W${prevN}` || k.phB === `W${prevN}`)
  }

  return { champion, steps, titleOdds, ok: steps.length > 0 }
}
