import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { useAppData } from '../data/DataContext'
import { useSettings } from '../settings/SettingsContext'
import Flag from './Flag'
import './onboarding.css'

/**
 * First-run "choose your top 4" gate. Renders a full-screen modal only when the
 * user has not been onboarded; Save stores an ordered top-4 (whose #1 pick also
 * becomes the champion accent), Skip just dismisses. Mounted in App next to
 * ChampionAccent so `teams` is available. Re-openable from Road/Settings by
 * calling setOnboarded(false) — the inner Gate remounts and pre-fills from top4.
 */
export default function OnboardingGate() {
  const { settings } = useSettings()
  if (settings.onboarded) return null
  return <Gate />
}

function Gate() {
  const { t, pick } = useI18n()
  const { teams } = useAppData()
  const { settings, setTop4, setOnboarded } = useSettings()

  // ordered selection, pre-seeded from any previous top-4 (remounts on re-open)
  const [selection, setSelection] = useState<string[]>(() => settings.top4.slice(0, 4))

  const teamList = useMemo(
    () =>
      Object.values(teams)
        .map((tm) => ({ code: tm.code, team: tm, name: pick(tm.name, tm.code) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [teams, pick],
  )

  const save = () => {
    setTop4(selection)
    setOnboarded(true)
  }
  const skip = () => setOnboarded(true)

  // Esc dismisses (= Skip), mirroring the LangMenu outside-click/Esc pattern
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOnboarded(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [setOnboarded])

  const toggle = (code: string) => {
    setSelection((sel) => {
      if (sel.includes(code)) return sel.filter((c) => c !== code)
      if (sel.length >= 4) return sel
      return [...sel, code]
    })
  }

  return (
    // backdrop click (target === overlay) dismisses; clicks inside the panel don't bubble out.
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse convenience — Esc dismisses for keyboard users (handled on document)
    <div
      className="ob-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('onboardTitle')}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOnboarded(true)
      }}
    >
      <div className="ob-panel">
        <div className="ob-head">
          <h1>{t('onboardTitle')}</h1>
          <p>{t('onboardSub')}</p>
          <p className="ob-instruction">{t('onboardInstruction')}</p>
        </div>

        <div className="ob-grid">
          {teamList.map(({ code, team, name }) => {
            const rank = selection.indexOf(code) + 1
            return (
              <button
                key={code}
                type="button"
                aria-pressed={rank > 0}
                className={`ob-card${rank > 0 ? ' on' : ''}`}
                onClick={() => toggle(code)}
              >
                {rank > 0 && <span className="ob-rank">{rank}</span>}
                <Flag team={team} size={34} />
                <span className="ob-name">{name}</span>
              </button>
            )
          })}
        </div>

        <div className="ob-actions">
          <button type="button" className="btn" onClick={skip}>
            {t('onboardSkip')}
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={selection.length === 0}>
            {t('onboardSave')}
          </button>
        </div>
      </div>
    </div>
  )
}
