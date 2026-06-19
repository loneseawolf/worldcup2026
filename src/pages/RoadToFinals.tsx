import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData, useAppData } from '../data/DataContext'
import { useI18n } from '../i18n'
import { useSettings } from '../settings/SettingsContext'
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
  const { settings, setChampion, setOnboarded } = useSettings()
  const { teams, matches, venues, standings } = useAppData()
  const [searchParams, setSearchParams] = useSearchParams()

  // champion is global state (recolors the whole app via ChampionAccent); the
  // bracket overrides + share link stay local (wc2026-road / URL) as before
  const champion = settings.champion ?? ''
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
      // a shared/typed link always wins
      setChampion(c)
      setOverrides(parseOverrides(searchParams.get('o'), isTeam))
    } else {
      try {
        const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
        // champion now persists globally in settings; only adopt the legacy
        // wc2026-road champion when settings has none yet (one-time migration)
        if (!settings.champion && saved?.champion && isTeam(saved.champion)) {
          setChampion(saved.champion)
        }
        if (saved?.overrides) {
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
    setChampion(code || null) // '' (placeholder / reset) clears the accent
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

  const championName = champion ? pick(teams[champion]?.name, champion) : ''

  return (
    <div>
      <div className="page-head">
        <h1>{t('roadTitle')}</h1>
        <p>{t('roadSub')}</p>
      </div>

      {/* "Your Top 4" strip — ordered picks, re-openable onboarding */}
      <section className="card road-top4">
        <div className="road-top4-head">
          <h2>{t('top4Title')}</h2>
          <button type="button" className="btn road-top4-edit" onClick={() => setOnboarded(false)}>
            <Icon name="star" size={15} />
            {t('top4Edit')}
          </button>
        </div>
        {settings.top4.length ? (
          <div className="road-top4-list">
            {settings.top4.map((code, i) => (
              <button
                key={code}
                type="button"
                className={`road-top4-chip${code === champion ? ' on' : ''}`}
                onClick={() => onPickChampion(code)}
                title={pick(teams[code]?.name, code)}
              >
                <span className="road-top4-rank">{i + 1}</span>
                <Flag iso2={teams[code]?.iso2} team={teams[code]} size={22} />
                <span className="road-top4-name">{pick(teams[code]?.name, code)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">{t('top4Empty')}</p>
        )}
      </section>

      {/* champion banner: crest + name + title odds, with the picker built in */}
      <section className={`card road-banner${path?.ok ? ' has-champ' : ''}`}>
        {path?.ok && (
          <div className="road-banner-hero">
            <Flag iso2={teams[champion]?.iso2} team={teams[champion]} size={72} className="road-crest" />
            <div className="road-banner-meta">
              <div className="road-banner-name">{championName}</div>
              <div className="road-odds-big">{(path.titleOdds * 100).toFixed(1)}%</div>
              <div className="road-odds-cap">{t('roadTitleOdds')}</div>
            </div>
            <Icon name="trophy" size={30} className="road-banner-trophy" />
          </div>
        )}
        <div className="road-pick">
          <label htmlFor="road-champ">{t('roadPick')}</label>
          {champion && !path?.ok && <Flag iso2={teams[champion]?.iso2} team={teams[champion]} size={26} />}
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
      </section>

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
          <div className="road-timeline">
            {path.steps.map((s) => (
              <div className="road-round" key={s.round}>
                <span className="road-node" aria-hidden="true" />
                <section className="card road-round-card">
                  <div className="road-round-head">
                    <span className="road-stage">{t(STAGE_LABEL_KEY[s.round])}</span>
                    <span className="chip">{t('matchN', { n: s.matchN })}</span>
                    {venueCity(s.venueId) && <span className="road-venue">{venueCity(s.venueId)}</span>}
                  </div>

                  <div className="road-round-body">
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

                  <div className="road-round-actions">
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
              </div>
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
