import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Match, Stage } from '../types'
import { useI18n } from '../i18n'
import { useAppData, useData } from '../data/DataContext'
import { clinchState, STAGE_LABEL_KEY } from '../utils/helpers'
import type { QualState } from '../utils/helpers'
import { advanceProb, projectedBracket } from '../utils/roadPath'
import { isDarkTheme, teamAccent } from '../utils/teamAccent'
import { useSettings } from '../settings/SettingsContext'
import Flag from '../components/Flag'
import Icon from '../components/Icon'
import Trophy from '../components/Trophy'
import './bracket.css'
import './pickems.css'

const LS_KEY = 'wc2026-pickems'
const HALF_KEY = 'wc2026-bracket-half'

// linear scoring: each round is worth a flat amount, rising toward the final.
// the third-place play-off (match 103) is pickable and scored too.
const WEIGHT: Record<string, number> = { r32: 5, r16: 10, qf: 15, sf: 20, third: 15, final: 25 }
// the W-feeder tree geometry only spans these (third place is not a feeder)
const MAIN_STAGES: Stage[] = ['r32', 'r16', 'qf', 'sf', 'final']
// rail / scoring order, third place slotted right before the final
const SCORED_STAGES: Stage[] = ['r32', 'r16', 'qf', 'sf', 'third', 'final']
// short round labels for the LoL-style score rail (en-only i18n keys)
const ROUND_LABEL_KEY: Record<string, string> = {
  r32: 'pkR32',
  r16: 'pkR16',
  qf: 'pkQf',
  sf: 'pkSf',
  third: 'pkThird',
  final: 'pkFinal',
}
const HEAD_COLS: { col: number; stage: Stage }[] = [
  { col: 1, stage: 'r32' },
  { col: 2, stage: 'r16' },
  { col: 3, stage: 'qf' },
  { col: 4, stage: 'sf' },
  { col: 5, stage: 'final' },
  { col: 6, stage: 'sf' },
  { col: 7, stage: 'qf' },
  { col: 8, stage: 'r16' },
  { col: 9, stage: 'r32' },
]

type Half = (Match | null)[][]
type Picks = Record<string, string> // key = match number, value = predicted winner code

/** real winner of a finished match (winner field, then score, then penalties) */
function realWinnerOf(m: Match): string | undefined {
  if (m.status !== 'finished' || !m.home || !m.away) return undefined
  if (m.winner) return m.winner
  const hs = m.home.score ?? 0
  const as = m.away.score ?? 0
  if (hs !== as) return hs > as ? m.home.code : m.away.code
  const hp = m.home.pen ?? 0
  const ap = m.away.pen ?? 0
  if (hp !== ap) return hp > ap ? m.home.code : m.away.code
  return undefined
}

function encodePicks(p: Picks): string {
  return Object.keys(p)
    .sort((a, b) => Number(a) - Number(b))
    .map((n) => `${n}:${p[n]}`)
    .join(',')
}

export default function PickEms() {
  const { t, pick } = useI18n()
  const { settings } = useSettings()
  const { simModel, loadSimModel } = useData()
  const { teams, matches, venues, standings } = useAppData()
  const [searchParams, setSearchParams] = useSearchParams()

  const [picks, setPicks] = useState<Picks>({})
  const [hydrated, setHydrated] = useState(false)
  const [copied, setCopied] = useState(false)
  const [half, setHalfState] = useState<'l' | 'r'>(() => {
    try {
      return localStorage.getItem(HALF_KEY) === 'r' ? 'r' : 'l'
    } catch {
      return 'l'
    }
  })
  const setHalf = (h: 'l' | 'r') => {
    setHalfState(h)
    try {
      localStorage.setItem(HALF_KEY, h)
    } catch {
      /* blocked storage */
    }
  }

  useEffect(() => {
    loadSimModel()
  }, [loadSimModel])

  // bracket geometry: the centre-converging half-trees, same walk as the Bracket page
  const bk = useMemo(() => {
    const ko = matches.filter((m) => m.stage !== 'group')
    const byN = new Map<number, Match>()
    for (const m of ko) byN.set(m.n, m)
    const stageOf = (s: Stage) => ko.filter((m) => m.stage === s).sort((a, b) => a.n - b.n)
    const final = stageOf('final')[0] ?? null
    const third = stageOf('third')[0] ?? null

    const feeder = (m: Match | null, ph: 'phA' | 'phB'): Match | null => {
      const p = m ? m[ph] : null
      if (p && /^W\d+$/.test(p)) return byN.get(Number(p.slice(1))) ?? null
      return null
    }
    const expand = (root: Match | null): Half => {
      const rounds: Half = [[root]]
      for (let i = 0; i < 3; i++) {
        rounds.push(rounds[i].flatMap((m) => [feeder(m, 'phA'), feeder(m, 'phB')]))
      }
      return rounds
    }
    let left = expand(feeder(final, 'phA'))
    let right = expand(feeder(final, 'phB'))

    const complete = (h: Half) => h.every((round) => round.every(Boolean))
    if (!complete(left) || !complete(right)) {
      const sf = stageOf('sf')
      const qf = stageOf('qf')
      const r16 = stageOf('r16')
      const r32 = stageOf('r32')
      const pad = (a: Match[], from: number, len: number): (Match | null)[] =>
        Array.from({ length: len }, (_, i) => a[from + i] ?? null)
      left = [pad(sf, 0, 1), pad(qf, 0, 2), pad(r16, 0, 4), pad(r32, 0, 8)]
      right = [pad(sf, 1, 1), pad(qf, 2, 2), pad(r16, 4, 4), pad(r32, 8, 8)]
    }

    const main = ko.filter((m) => MAIN_STAGES.includes(m.stage))
    const ordered = MAIN_STAGES.flatMap((s) => main.filter((m) => m.stage === s).sort((a, b) => a.n - b.n))
    // third place resolves after the SFs (its RU feeders need their winners set),
    // so append it to the resolve/score order; geometry (left/right) ignores it
    const scored = third ? [...main, third] : main
    const orderedAll = third ? [...ordered, third] : ordered
    return { left, right, final, third, byN, main, ordered, scored, orderedAll }
  }, [matches])

  const proj = useMemo(
    () => projectedBracket(simModel, matches, standings, teams, venues),
    [simModel, matches, standings, teams, venues],
  )

  // mathematical clinch/elimination per team, surfaced on each resolved slot
  const clinchMap = useMemo(() => {
    const m = new Map<string, QualState>()
    for (const team of Object.values(teams)) {
      m.set(team.code, clinchState(standings, matches, team.group, team.code))
    }
    return m
  }, [teams, standings, matches])

  const vc = useMemo(() => (m: Match) => (m.venueId ? venues[m.venueId]?.country : undefined), [venues])

  // resolve every main match's two sides + predicted winner for a given pick set.
  // sides cascade top-down (a slot fed by W{n} takes that match's winner); the
  // winner is the user's pick, else the model's pick between the live sides.
  // `cleaned` drops any stored pick whose match no longer contains that team.
  const resolveBracket = useMemo(() => {
    return (p: Picks) => {
      const sides = new Map<number, { home?: string; away?: string }>()
      const winner = new Map<number, string | undefined>()
      const cleaned: Picks = { ...p }
      const teamOn = (m: Match, side: 'A' | 'B'): string | undefined => {
        const ph = side === 'A' ? m.phA : m.phB
        const w = ph && /^W(\d+)$/.exec(ph)
        if (w) return winner.get(Number(w[1]))
        // RU{n} = the loser of match n (the third-place play-off's two feeders).
        // resolved here because 103 is processed after the SFs in orderedAll.
        const ru = ph && /^RU(\d+)$/.exec(ph)
        if (ru) {
          const n = Number(ru[1])
          const s = sides.get(n)
          const wn = winner.get(n)
          if (!s || !wn) return undefined
          return s.home === wn ? s.away : s.home
        }
        return side === 'A' ? proj[m.id]?.home : proj[m.id]?.away
      }
      for (const m of bk.orderedAll) {
        const home = teamOn(m, 'A')
        const away = teamOn(m, 'B')
        let w: string | undefined = p[m.n]
        if (w && w !== home && w !== away) {
          delete cleaned[m.n]
          w = undefined
        }
        if (!w && home && away && simModel) {
          w = advanceProb(simModel, home, away, vc(m)) >= 0.5 ? home : away
        }
        sides.set(m.n, { home, away })
        winner.set(m.n, w)
      }
      return { sides, winner, cleaned }
    }
  }, [bk.orderedAll, proj, simModel, vc])

  const view = useMemo(() => resolveBracket(picks), [resolveBracket, picks])

  const isTeam = useMemo(() => (c: string) => Object.hasOwn(teams, c), [teams])
  const isMatch = useMemo(() => {
    const ns = new Set(bk.scored.map((m) => m.n))
    return (n: number) => ns.has(n)
  }, [bk.scored])

  // restore from the share link first, then localStorage (once), normalizing both
  // biome-ignore lint/correctness/useExhaustiveDependencies: restore once on mount only
  useEffect(() => {
    const parse = (raw: string | null): Picks => {
      const out: Picks = {}
      if (!raw) return out
      for (const part of raw.split(',')) {
        const [n, c] = part.split(':')
        if (n && c && isMatch(Number(n)) && isTeam(c)) out[n] = c
      }
      return out
    }
    let initial: Picks = {}
    const fromUrl = searchParams.get('p')
    if (fromUrl) initial = parse(fromUrl)
    else {
      try {
        const saved = localStorage.getItem(LS_KEY)
        if (saved) initial = parse(saved)
      } catch {
        /* ignore corrupt storage */
      }
    }
    // store raw here — the bracket can't be cascade-normalized until the model
    // (and thus the projected field) is loaded; that happens in the effect below
    setPicks(initial)
    setHydrated(true)
  }, [])

  // once the model is loaded, normalize the restored picks once (drops any pick
  // whose match no longer contains that team in the current cascade)
  const normalizedRef = useRef(false)
  useEffect(() => {
    if (!simModel || !hydrated || normalizedRef.current) return
    normalizedRef.current = true
    setPicks((p) => resolveBracket(p).cleaned)
  }, [simModel, hydrated, resolveBracket])

  // persist + keep the URL in sync (shareable link)
  useEffect(() => {
    if (!hydrated) return
    const encoded = encodePicks(picks)
    try {
      localStorage.setItem(LS_KEY, encoded)
    } catch {
      /* private mode */
    }
    const next = new URLSearchParams()
    if (encoded) next.set('p', encoded)
    setSearchParams(next, { replace: true })
  }, [picks, hydrated, setSearchParams])

  const choose = (m: Match, code: string) => {
    setPicks((p) => resolveBracket({ ...p, [m.n]: code }).cleaned)
  }
  const useProjection = () => {
    const next: Picks = {}
    for (const m of bk.scored) {
      const w = proj[m.id]?.winner
      if (w) next[m.n] = w
    }
    setPicks(resolveBracket(next).cleaned)
  }
  const reset = () => setPicks({})

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked */
    }
  }

  // score: per finished main match, award the round weight if the predicted
  // winner matches the real winner. `available` = points already decidable.
  const score = useMemo(() => {
    const per: Record<string, { earned: number; available: number }> = {}
    for (const s of SCORED_STAGES) per[s] = { earned: 0, available: 0 }
    let earned = 0
    let available = 0
    for (const m of bk.scored) {
      const real = realWinnerOf(m)
      if (!real) continue
      const w = WEIGHT[m.stage]
      available += w
      per[m.stage].available += w
      if (view.winner.get(m.n) === real) {
        earned += w
        per[m.stage].earned += w
      }
    }
    return { earned, available, per }
  }, [bk.scored, view])

  const championCode = bk.final ? view.winner.get(bk.final.n) : undefined

  // the champion's actual route to the final: every main match they win (the
  // cascade guarantees exactly one per round). Drives the path highlight.
  const championPath = useMemo(() => {
    const set = new Set<number>()
    if (!championCode) return set
    for (const m of bk.ordered) {
      if (view.winner.get(m.n) === championCode) set.add(m.n)
    }
    return set
  }, [championCode, bk.ordered, view])

  const PickNode = ({ m, big = false }: { m: Match; big?: boolean }) => {
    const s = view.sides.get(m.n)
    const win = view.winner.get(m.n)
    const finished = m.status === 'finished'
    const real = finished ? realWinnerOf(m) : undefined
    const correct = finished && win && real ? win === real : null
    const stateCls = correct === true ? ' pk-correct' : correct === false ? ' pk-wrong' : ''
    const onPath = championPath.has(m.n)
    const late = m.stage === 'qf' || m.stage === 'sf' || m.stage === 'final'
    const pathCls = onPath ? ` pk-path${late ? ' pk-path-late' : ''}` : ''
    const row = (code: string | undefined, label: string) => {
      const sel = !!code && win === code
      const isReal = !!real && code === real
      // mute the unpicked side once a pick exists, so the advancing team pops
      const muted = !!win && !!code && !sel
      const rank = code ? teams[code]?.ranking : null
      // clinch state owns the flag/seed area only — never the opacity (pick) channel
      const status = code ? (clinchMap.get(code) ?? null) : null
      const qualCls = status === 'out' ? ' pk-elim' : status === 'through' ? ' pk-adv' : ''
      const qualTitle = status === 'through' ? t('qualAdvanced') : t('qualEliminated')
      return (
        <button
          type="button"
          className={`bk-row pk-row${code ? ' pk-slot' : ''}${sel ? ' pk-sel' : ''}${muted ? ' pk-mute' : ''}${isReal ? ' pk-real' : ''}${qualCls}`}
          disabled={!code}
          onClick={() => code && choose(m, code)}
        >
          {status === 'through' || status === 'out' ? (
            <span className={`pk-qual pk-qual-${status}`} role="img" title={qualTitle} aria-label={qualTitle}>
              {status === 'through' ? '✓' : '✕'}
            </span>
          ) : (
            rank != null && <span className="pk-seed tnum">{rank}</span>
          )}
          <Flag team={code ? teams[code] : undefined} size={big ? 20 : 16} />
          <span className={`bk-nm${code ? '' : ' bk-tbd'}`}>
            {code ? pick(teams[code]?.name, code) : label}
          </span>
          {code && <span className="bk-code tnum">{code}</span>}
          {sel && (
            <span className="pk-chev" aria-hidden="true">
              ›
            </span>
          )}
        </button>
      )
    }
    return (
      <div className={`bk-node pk-node${big ? ' bk-big' : ''}${stateCls}${pathCls}`}>
        {big && (
          <div className="bk-final-head">
            <span className="bk-cup" aria-hidden="true">
              <Trophy size={16} />
            </span>
            {t(STAGE_LABEL_KEY.final)}
          </div>
        )}
        <div className="bk-meta pk-meta">
          <span className="bk-n tnum">{m.n}</span>
          {finished && (
            <span className={`pk-badge ${correct ? 'ok' : 'no'}`}>
              {correct ? t('pickemCorrect') : t('pickemWrong')}
            </span>
          )}
        </div>
        {row(s?.home, t('pickemTbd'))}
        {row(s?.away, t('pickemTbd'))}
      </div>
    )
  }

  const halfCells = (rounds: Half, side: 'l' | 'r') => {
    const cols = side === 'l' ? [4, 3, 2, 1] : [6, 7, 8, 9]
    const roundCls = ['bk-rd-sf', 'bk-rd-qf', 'bk-rd-r16', 'bk-rd-r32']
    const cells: ReactNode[] = []
    rounds.forEach((round, ri) => {
      const span = 8 / round.length
      round.forEach((m, i) => {
        const feed = round.length === 1 ? 'bk-mid' : i % 2 === 0 ? 'bk-top' : 'bk-bot'
        const join = ri < 3 ? ' bk-join' : ''
        const path = m && championPath.has(m.n) ? ' pk-path' : ''
        cells.push(
          <div
            key={`${side}${ri}-${i}`}
            className={`bk-cell bk-${side} ${roundCls[ri]} ${feed}${join}${path}`}
            style={{ gridColumn: cols[ri], gridRow: `${2 + i * span} / span ${span}` }}
          >
            {m ? <PickNode m={m} /> : <div className="bk-ghost" />}
          </div>,
        )
      })
    })
    return cells
  }

  // real photographic trophy crowns the center column (design-system §7); one
  // element rendered in both the desktop and mobile centers.
  const trophyImg = (
    <img
      className="pk-trophy"
      src={`${import.meta.env.BASE_URL}icons/worldcuptrophy.png`}
      alt=""
      loading="lazy"
    />
  )

  const champAcc = championCode ? teamAccent(teams[championCode]?.colors, isDarkTheme(settings.theme)) : null
  const championCard = championCode && (
    <div
      className="bk-champion pk-champion"
      style={{ '--champ-ink': champAcc?.accentText ?? 'var(--accent-text)' } as CSSProperties}
    >
      <span className="pk-champ-name">
        <Flag team={teams[championCode]} size={34} />
        {pick(teams[championCode]?.name, championCode)}
      </span>
      <span className="bk-champ-label">{t('pickemChampion')}</span>
    </div>
  )

  return (
    <div className="bk-page pk-page">
      <div className="page-head">
        <h1>{t('pickemTitle')}</h1>
        <p>{t('pickemSub')}</p>
      </div>

      {!simModel ? (
        <div className="empty">
          <Icon name="target" size={30} />
          <div>{t('roadLoading')}</div>
        </div>
      ) : (
        <>
          <section className="card card-pad pk-scorecard">
            <div className="pk-sc-head">
              <span className="pk-sc-label">{t('pickemScoreHead')}</span>
              <span className="pk-sc-total tnum">
                {t('pickemScore', { earned: score.earned, available: score.available })}
              </span>
            </div>
            <ul className="pk-rail">
              {SCORED_STAGES.map((s) => {
                const { earned, available } = score.per[s]
                const filled = available ? Math.round((earned / available) * 4) : 0
                return (
                  <li key={s} className={`pk-rail-row${available ? ' on' : ''}`}>
                    <span className="pk-rail-name">{t(ROUND_LABEL_KEY[s])}</span>
                    <span className="pk-rail-pips" aria-hidden="true">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className={`pk-pip${i < filled ? ' fill' : ''}`} />
                      ))}
                    </span>
                    <span className="pk-rail-pts tnum">{t('pickemRoundScore', { earned, available })}</span>
                  </li>
                )
              })}
            </ul>
          </section>

          <p className="muted small pk-instructions">{t('pickemInstructions')}</p>

          <div className="pk-actions">
            <button type="button" className="btn btn-primary" onClick={useProjection}>
              <Icon name="target" size={16} />
              {t('pickemUseProjection')}
            </button>
            <button type="button" className="btn" onClick={reset}>
              {t('pickemReset')}
            </button>
            <button type="button" className="btn" onClick={copyLink}>
              {copied ? t('pickemCopied') : t('pickemShareLink')}
            </button>
          </div>

          <div className="bk-wrap">
            <div className="seg bk-half-seg">
              <button type="button" className={half === 'l' ? 'on' : ''} onClick={() => setHalf('l')}>
                {t('bkHalfL')}
              </button>
              <button type="button" className={half === 'r' ? 'on' : ''} onClick={() => setHalf('r')}>
                {t('bkHalfR')}
              </button>
            </div>
            <div className={`bk-grid bk-m-${half}`}>
              {HEAD_COLS.map(({ col, stage }) => (
                <div key={col} className="bk-head" style={{ gridColumn: col, gridRow: 1 }}>
                  <div className="bk-head-stage">{t(STAGE_LABEL_KEY[stage])}</div>
                </div>
              ))}

              {halfCells(bk.left, 'l')}
              {halfCells(bk.right, 'r')}

              <div className="bk-cell bk-center" style={{ gridColumn: 5, gridRow: '2 / span 8' }}>
                <div className="bk-center-top">
                  {trophyImg}
                  {championCard}
                </div>
                <div className="bk-center-mid">
                  {bk.final ? <PickNode m={bk.final} big /> : <div className="bk-ghost" />}
                </div>
                <div className="bk-center-bottom">
                  {bk.third && (
                    <div className="bk-third">
                      <div className="bk-third-label">{t(STAGE_LABEL_KEY.third)}</div>
                      <PickNode m={bk.third} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bk-mobile-center">
              {trophyImg}
              {championCard}
              {bk.final && <PickNode m={bk.final} big />}
              {bk.third && (
                <div className="bk-third">
                  <div className="bk-third-label">{t(STAGE_LABEL_KEY.third)}</div>
                  <PickNode m={bk.third} />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
