import { useEffect } from 'react'
import { useSettings } from '../settings/SettingsContext'
import { useData } from '../data/DataContext'
import { isDarkTheme, teamAccent } from '../utils/teamAccent'

/**
 * Applies the picked champion's colors to --accent / --accent-text / --live on
 * <html>, recoloring the whole app. Clears the inline vars when no champion is
 * picked, falling back to the hunter-green default from index.css. Lives inside
 * both providers (mounted in App) since SettingsContext can't read `teams`.
 */
export default function ChampionAccent() {
  const { settings } = useSettings()
  const { data } = useData()
  const champion = settings.champion
  const theme = settings.theme

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const team = champion ? data?.teams[champion] : null
      const acc = team ? teamAccent(team.colors, isDarkTheme(theme)) : null
      if (acc) {
        root.style.setProperty('--accent', acc.accent)
        root.style.setProperty('--accent-text', acc.accentText)
        root.style.setProperty('--live', acc.accent)
      } else {
        root.style.removeProperty('--accent')
        root.style.removeProperty('--accent-text')
        root.style.removeProperty('--live')
      }
    }
    apply()
    // 'auto' theme follows the OS — re-resolve contrast when it flips
    if (theme === 'auto' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [champion, data, theme])

  return null
}
