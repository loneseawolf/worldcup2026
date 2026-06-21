import type { StandingRow } from '../types'
import { useI18n } from '../i18n'
import { useAppData } from '../data/DataContext'
import { qualState } from '../utils/helpers'
import TeamName from './TeamName'
import '../pages/groups.css'

export function fmtGd(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

export function rowQualClass(state: ReturnType<typeof qualState>): string {
  if (state === 'through') return ' gp-tr-through'
  if (state === 'third') return ' gp-tr-third'
  if (state === 'out') return ' gp-tr-out'
  return ''
}

/** P W D L GF GA GD Pts header cells (shared by group + thirds tables) */
export function NumHeads() {
  const { t } = useI18n()
  return (
    <>
      <th className="tnum">{t('colP')}</th>
      <th className="tnum gp-hxxs">{t('colW')}</th>
      <th className="tnum gp-hxxs">{t('colD')}</th>
      <th className="tnum gp-hxxs">{t('colL')}</th>
      <th className="tnum gp-hxs">{t('colGF')}</th>
      <th className="tnum gp-hxs">{t('colGA')}</th>
      <th className="tnum">{t('colGD')}</th>
      <th className="tnum">{t('colPts')}</th>
    </>
  )
}

export function NumCells({ r }: { r: StandingRow }) {
  return (
    <>
      <td className="tnum">{r.p}</td>
      <td className="tnum gp-hxxs">{r.w}</td>
      <td className="tnum gp-hxxs">{r.d}</td>
      <td className="tnum gp-hxxs">{r.l}</td>
      <td className="tnum gp-hxs">{r.gf}</td>
      <td className="tnum gp-hxs">{r.ga}</td>
      <td className="tnum">{fmtGd(r.gd)}</td>
      <td className="tnum gp-pts">{r.pts}</td>
    </>
  )
}

/** compact standings table for a single group (shared by the Groups page and the
 * Live page's standings card). Renders nothing when the group has no rows. */
export default function GroupStandings({ group }: { group: string }) {
  const { t } = useI18n()
  const { standings } = useAppData()
  const rows = standings.groups[group] ?? []
  if (!rows.length) return null
  return (
    <table className="gp-table" aria-label={t('groupX', { x: group })}>
      <thead>
        <tr>
          <th className="gp-rank" />
          <th className="gp-team">{t('filterTeams')}</th>
          <NumHeads />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.code} className={`gp-tr${rowQualClass(qualState(standings, group, r.rank, r.code))}`}>
            <td className="gp-rank tnum">{r.rank}</td>
            <td className="gp-team">
              <TeamName code={r.code} flagSize={20} />
            </td>
            <NumCells r={r} />
          </tr>
        ))}
      </tbody>
    </table>
  )
}
