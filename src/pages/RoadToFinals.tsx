import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData, useAppData } from '../data/DataContext'
import { useI18n } from '../i18n'
import TeamName from '../components/TeamName'
import Flag from '../components/Flag'
import Icon from '../components/Icon'
import { STAGE_LABEL_KEY } from '../utils/helpers'
import { buildRoadPath, ROUND_KEYS } from '../utils/roadPath'
import type { Difficulty, RoundKey } from '../utils/roadPath'
import './road.css'

const LS_KEY = 'wc2026-road'

const DIFF_KEY: Record<Difficulty, string> = {
  easy: 'roadDiffEasy',
  tough: 'roadDiffTough',
  brutal: 'roadDiffBrutal',
}

type Overrides = Partial<Record<RoundKey, string>>

function parseOverrides(raw: string | null, valid: (c: string) => boolean): Overrides {
  const out: Overrides = {}
  if (!raw) return out
  for (const part of raw.split(',')) {
    const [r, c] = part.split(':')
    if (ROUND_KEYS.includes(r as RoundKey) && c && valid(c)) out[r as RoundKey] = c
  }
  return out
}

function encodeOverrides(o: Overrides): string {
  return ROUND_KEYS.filter((r) => o[r])
    .map((r) => `${r}:${o[r]}`)
    .join(',')
}

export default function RoadToFinals() {
  const { t, pick } = useI18n()
  const { simModel, loadSimModel } = useData()
  const { teams, matches, venues, standings } = useAppData()
  const [searchParams, setSearchParams] = useSearchParams()

  const [champion, setChampion] = useState('')
  const [overrides, setOverrides] = useState<Overrides>({})
  const [editing, setEditing] = useState<RoundKey | null>(null)
  const [copied, setCopied] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // the forecast model is loaded lazily — request it on mount
  useEffect(() => {
    loadSimModel()
  }, [loadSimModel])

  const isTeam = useMemo(() => (c: string) => Object.hasOwn(teams, c), [teams])

  // restore from the share link first, then from localStorage (once)
  // biome-ignore lint/correctness/useExhaustiveDependencies: restore once on mount only
  useEffect(() => {
    const c = searchParams.get('c')
    if (c && isTeam(c)) {
      setChampion(c)
      setOverrides(parseOverrides(searchParams.get('o'), isTeam))
    } else {
      try {
        const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
        if (saved?.champion && isTeam(saved.champion)) {
          setChampion(saved.champion)
          setOverrides(parseOverrides(encodeOverrides(saved.overrides || {}), isTeam))
        }
      } catch {
        /* ignore corrupt storage */
      }
    }
    setHydrated(true)
  }, [])

  // persist to localStorage and keep the URL in sync (shareable link)
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ champion, overrides }))
    } catch {
      /* private mode */
    }
    const next = new URLSearchParams()
    if (champion) next.set('c', champion)
    const o = encodeOverrides(overrides)
    if (o) next.set('o', o)
    setSearchParams(next, { replace: true })
  }, [champion, overrides, hydrated, setSearchParams])

  const teamList = useMemo(
    () =>
      Object.values(teams)
        .map((tm) => ({ code: tm.code, name: pick(tm.name, tm.code) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [teams, pick],
  )

  const path = useMemo(
    () =>
      champion && simModel
        ? buildRoadPath(champion, simModel, matches, standings, teams, venues, overrides)
        : null,
    [champion, simModel, matches, standings, teams, venues, overrides],
  )

  const venueCity = (venueId: string | null) => {
    const v = venueId ? venues[venueId] : null
    return v ? pick(v.cityName, v.city) : ''
  }

  const onPickChampion = (code: string) => {
    setChampion(code)
    setOverrides({}) // a new champion means a brand-new bracket path
    setEditing(null)
  }

  const setOpponent = (round: RoundKey, code: string, projected: string) => {
    setOverrides((o) => {
      const next = { ...o }
      if (!code || code === projected) delete next[round]
      else next[round] = code
      return next
    })
    setEditing(null)
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>{t('roadTitle')}</h1>
        <p>{t('roadSub')}</p>
      </div>

      <div className="road-pick">
        <label htmlFor="road-champ">{t('roadPick')}</label>
        {champion && <Flag iso2={teams[champion]?.iso2} size={26} />}
        <select
          id="road-champ"
          className="road-select"
          value={champion}
          onChange={(e) => onPickChampion(e.target.value)}
        >
          <option value="">{t('roadPickPlaceholder')}</option>
          {teamList.map((tm) => (
            <option key={tm.code} value={tm.code}>
              {tm.name}
            </option>
          ))}
        </select>
      </div>

      {!champion && <p className="muted">{t('roadPickHint')}</p>}

      {champion && !simModel && (
        <div className="empty">
          <Icon name="target" size={30} />
          <div>{t('roadLoading')}</div>
        </div>
      )}

      {champion && simModel && !path?.ok && <p className="muted">{t('roadNoPath')}</p>}

      {path?.ok && (
        <>
          <div className="card road-odds">
            <Icon name="trophy" size={30} />
            <div>
              <div className="road-odds-big">{(path.titleOdds * 100).toFixed(1)}%</div>
              <div className="road-odds-cap">{t('roadTitleOdds')}</div>
            </div>
          </div>

          <div className="road-steps">
            {path.steps.map((s) => (
              <section className="card road-step" key={s.round}>
                <div className="road-step-top">
                  <span className="road-stage">{t(STAGE_LABEL_KEY[s.round])}</span>
                  <span className="chip">{t('matchN', { n: s.matchN })}</span>
                  {venueCity(s.venueId) && <span className="road-venue">{venueCity(s.venueId)}</span>}
                </div>

                <div className="road-step-mid">
                  <span className="road-vs">{t('vs')}</span>
                  {s.opponent ? <TeamName code={s.opponent} /> : <span className="muted">{t('tbd')}</span>}
                  {s.opponent && (
                    <span className={`chip road-diff-${s.difficulty}`}>{t(DIFF_KEY[s.difficulty])}</span>
                  )}
                  {s.overridden && <span className="chip chip-accent">{t('roadCustom')}</span>}
                  <span className="road-prob">
                    <span className="road-prob-pct">{(s.winProb * 100).toFixed(0)}%</span>
                    <span className="road-prob-cap">{t('roadAdvance')}</span>
                  </span>
                </div>

                <div className="road-step-actions">
                  {editing === s.round ? (
                    <select
                      className="road-select"
                      value={s.opponent}
                      onChange={(e) => setOpponent(s.round, e.target.value, s.projectedOpponent)}
                    >
                      <option value={s.projectedOpponent}>
                        {t('roadUseProjected')}
                        {s.projectedOpponent
                          ? ` (${pick(teams[s.projectedOpponent]?.name, s.projectedOpponent)})`
                          : ''}
                      </option>
                      {teamList
                        .filter((tm) => tm.code !== champion)
                        .map((tm) => (
                          <option key={tm.code} value={tm.code}>
                            {tm.name}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <button type="button" className="road-link-btn" onClick={() => setEditing(s.round)}>
                      {t('roadEdit')}
                    </button>
                  )}
                  {s.overridden && editing !== s.round && (
                    <button
                      type="button"
                      className="road-link-btn"
                      onClick={() => setOpponent(s.round, '', s.projectedOpponent)}
                    >
                      {t('roadUseProjected')}
                    </button>
                  )}
                </div>
              </section>
            ))}
          </div>

          <div className="road-actions">
            <button type="button" className="btn btn-primary" onClick={copyLink}>
              {copied ? t('roadCopied') : t('roadCopyLink')}
            </button>
            <button type="button" className="btn" onClick={() => onPickChampion('')}>
              {t('roadReset')}
            </button>
          </div>

          <p className="muted small road-disclaimer">{t('roadDisclaimer')}</p>
        </>
      )}
    </div>
  )
}
