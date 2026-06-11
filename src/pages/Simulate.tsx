import { useEffect, useMemo, useRef, useState } from 'react'
import type { Match } from '../types'
import { useI18n } from '../i18n'
import { useAppData, useData } from '../data/DataContext'
import { runTournament } from '../sim/engine'
import type { SimRun, SimScore } from '../sim/engine'
import Flag from '../components/Flag'
import Icon from '../components/Icon'
import './simulate.css'

const STAGES: { key: string; stages: string[] }[] = [
  { key: 'stageR32', stages: ['r32'] },
  { key: 'stageR16', stages: ['r16'] },
  { key: 'stageQf', stages: ['qf'] },
  { key: 'stageSf', stages: ['sf'] },
  { key: 'stageThird', stages: ['third'] },
  { key: 'stageFinal', stages: ['final'] },
]

export default function Simulate() {
  const { t, pick } = useI18n()
  const { matches, teams, venues } = useAppData()
  const { simModel, loadSimModel } = useData()
  useEffect(() => {
    loadSimModel()
  })

  const anyFinished = useMemo(() => matches.some((m) => m.status === 'finished'), [matches])
  const [mode, setMode] = useState<'continue' | 'fresh'>('continue')
  const [runs, setRuns] = useState(100)

  // slider uses a piecewise-log scale: 1/4 travel -> 100, midpoint -> 1000, end -> 10000
  const posToRuns = (p: number) =>
    Math.round(
      p <= 250 ? 10 ** (p / 125) : p <= 500 ? 10 ** (2 + (p - 250) / 250) : 10 ** (3 + (p - 500) / 500),
    )
  const runsToPos = (v: number) => {
    const lg = Math.log10(Math.min(Math.max(v, 1), 10000))
    return Math.round(lg <= 2 ? lg * 125 : lg <= 3 ? 250 + (lg - 2) * 250 : 500 + (lg - 3) * 500)
  }
  const [last, setLast] = useState<SimRun | null>(null)
  const [odds, setOdds] = useState<{ code: string; wins: number }[] | null>(null)
  const [ranToCount, setRanToCount] = useState(0)
  const [progress, setProgress] = useState<number | null>(null)

  // wheel over the runs input nudges the value by 1 instead of scrolling the page
  // (native non-passive listener: React's onWheel can't preventDefault reliably)
  const runsRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = runsRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setRuns((v) => Math.min(Math.max(v + (e.deltaY < 0 ? 1 : -1), 1), 10000))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const run = async () => {
    if (!simModel || progress !== null) return
    const n = Math.min(Math.max(runs, 1), 10000)
    const champs = new Map<string, number>()
    let lastRun: SimRun | null = null
    setProgress(0)
    const BATCH = 250 // keep the UI thread responsive on big runs
    for (let done = 0; done < n; done += BATCH) {
      const upto = Math.min(done + BATCH, n)
      for (let i = done; i < upto; i++) {
        lastRun = runTournament(simModel, matches, venues, teams, anyFinished ? mode : 'fresh')
        champs.set(lastRun.champion, (champs.get(lastRun.champion) ?? 0) + 1)
      }
      setProgress(upto)
      await new Promise((r) => requestAnimationFrame(r))
    }
    setLast(lastRun)
    setRanToCount(n)
    setOdds(
      n > 1
        ? [...champs.entries()].map(([code, wins]) => ({ code, wins })).sort((a, b) => b.wins - a.wins)
        : null,
    )
    setProgress(null)
  }

  const koMatches = useMemo(
    () => matches.filter((m) => m.stage !== 'group').sort((a, b) => a.n - b.n),
    [matches],
  )

  return (
    <div className="sim-page">
      <div className="page-head">
        <h1>{t('simTitle')}</h1>
        <p>{t('simSub')}</p>
      </div>

      <div className="card card-pad sim-controls">
        {anyFinished && (
          <div className="sim-mode">
            <label className="sim-radio">
              <input
                type="radio"
                name="simmode"
                checked={mode === 'continue'}
                onChange={() => setMode('continue')}
              />
              {t('simContinue')}
            </label>
            <label className="sim-radio">
              <input
                type="radio"
                name="simmode"
                checked={mode === 'fresh'}
                onChange={() => setMode('fresh')}
              />
              {t('simFresh')}
            </label>
          </div>
        )}
        <div className="sim-runs">
          <label htmlFor="sim-n">{t('simRuns')}</label>
          <input
            id="sim-n"
            type="range"
            min={0}
            max={1000}
            value={runsToPos(runs)}
            onChange={(e) => setRuns(posToRuns(Number(e.target.value)))}
          />
          <input
            ref={runsRef}
            className="input sim-n tnum"
            type="number"
            min={1}
            max={10000}
            value={runs}
            onChange={(e) => setRuns(Math.min(Math.max(Number(e.target.value) || 1, 1), 10000))}
            aria-label={t('simRuns')}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={run}
          disabled={!simModel || progress !== null}
        >
          <Icon name="target" size={16} />
          {progress !== null ? (
            <span className="tnum">
              {progress}/{Math.min(Math.max(runs, 1), 10000)}
            </span>
          ) : (
            t('simRunBtn')
          )}
        </button>
        <p className="muted small sim-note">{t('probNote')}</p>
      </div>

      {odds && (
        <section className="card card-pad sim-odds">
          <h2>{t('simOdds', { n: ranToCount })}</h2>
          <div className="sim-odds-list">
            {odds.slice(0, 12).map(({ code, wins }) => (
              <div key={code} className="sim-odds-row">
                <Flag team={teams[code]} size={20} />
                <span className="sim-odds-name">{pick(teams[code]?.name, code)}</span>
                <span className="sim-odds-bar">
                  <span style={{ width: `${(wins / ranToCount) * 100}%` }} />
                </span>
                <span className="sim-odds-pct tnum">{((wins / ranToCount) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {last && (
        <>
          <section className="card card-pad sim-champ">
            {ranToCount > 1 && <div className="muted small">{t('simSample')}</div>}
            <div className="sim-champ-row">
              <Flag team={teams[last.champion]} size={44} />
              <div>
                <div className="sim-champ-label">🏆 {t('simChampion')}</div>
                <div className="sim-champ-name">{pick(teams[last.champion]?.name, last.champion)}</div>
              </div>
            </div>
            <div className="sim-podium">
              {(
                [
                  ['🥈', t('podium2'), last.runnerUp],
                  ['🥉', t('podium3'), last.third],
                  ['', t('podium4'), last.fourth],
                ] as const
              ).map(([medal, label, code]) =>
                code ? (
                  <div key={label} className="sim-podium-item">
                    <span className="sim-podium-label">
                      {medal} {label}
                    </span>
                    <Flag team={teams[code]} size={20} />
                    <span className="sim-podium-name">{pick(teams[code]?.name, code)}</span>
                  </div>
                ) : null,
              )}
            </div>
          </section>

          <section className="sim-groups">
            <h2 className="section-title-h">{t('navGroups')}</h2>
            <div className="sim-groups-grid">
              {Object.entries(last.groupTables)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([g, rows]) => (
                  <div key={g} className="card sim-group">
                    <div className="sim-group-head">{t('groupX', { x: g })}</div>
                    {rows.map((r, i) => {
                      const third = i === 2
                      const q = i < 2 || (third && last.thirds.find((x) => x.code === r.code)?.qualifies)
                      return (
                        <div key={r.code} className={`sim-group-row${q ? ' q' : ''}`}>
                          <span className="tnum sim-pos">{i + 1}</span>
                          <Flag team={teams[r.code]} size={16} />
                          <span className="sim-team">{r.code}</span>
                          <span className="tnum sim-gd">{r.gd > 0 ? `+${r.gd}` : r.gd}</span>
                          <span className="tnum sim-pts">{r.pts}</span>
                        </div>
                      )
                    })}
                    <div className="sim-group-matches">
                      {matches
                        .filter((m) => m.stage === 'group' && m.group === g && last.results[m.id])
                        .sort((a, b) => a.n - b.n)
                        .map((m) => {
                          const r = last.results[m.id]
                          return (
                            <div key={m.id} className="sim-gm tnum">
                              <span className={r.winner === r.homeCode ? 'win' : ''}>{r.homeCode}</span>
                              <span className="sim-gm-score">
                                {r.h}–{r.a}
                              </span>
                              <span className={r.winner === r.awayCode ? 'win' : ''}>{r.awayCode}</span>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                ))}
            </div>
          </section>

          <section className="sim-ko">
            <h2 className="section-title-h">{t('navBracket')}</h2>
            {STAGES.map(({ key, stages }) => {
              const ms = koMatches.filter((m) => stages.includes(m.stage) && last.results[m.id])
              if (!ms.length) return null
              return (
                <div key={key} className="sim-stage">
                  <h3>{t(key)}</h3>
                  <div className="sim-stage-grid">
                    {ms.map((m) => (
                      <KoRow key={m.id} m={m} r={last.results[m.id]} />
                    ))}
                  </div>
                </div>
              )
            })}
          </section>
        </>
      )}
    </div>
  )
}

function KoRow({ m, r }: { m: Match; r: SimScore }) {
  const { teams } = useAppData()
  const { pick, t } = useI18n()
  // reconstruct sides from the result winner + scores direction is ambiguous;
  // sides were resolved at sim time — store codes on the result? derive: winner +
  // the match's resolved opponents are not persisted, so render via winner/loser.
  const home = r.homeCode ?? m.home?.code
  const away = r.awayCode ?? m.away?.code
  return (
    <div className="sim-ko-row">
      <span className={`sim-ko-team${r.winner === home ? ' win' : ''}`}>
        <Flag team={home ? teams[home] : undefined} size={16} />
        {home ? pick(teams[home]?.name, home) : '—'}
      </span>
      <span className="sim-ko-score tnum">
        {r.et ? (
          <>
            {r.et.h}–{r.et.a} <small className="sim-aet">{t('simAet')}</small>
          </>
        ) : (
          <>
            {r.h}–{r.a}
          </>
        )}
        {r.et && (
          <span className="sim-ko-sub">
            90′ {r.h}–{r.a}
            {r.pens && (
              <>
                {' '}
                · {t('pens')} {r.pens.h}–{r.pens.a}
              </>
            )}
          </span>
        )}
      </span>
      <span className={`sim-ko-team away${r.winner === away ? ' win' : ''}`}>
        {away ? pick(teams[away]?.name, away) : '—'}
        <Flag team={away ? teams[away] : undefined} size={16} />
      </span>
    </div>
  )
}
