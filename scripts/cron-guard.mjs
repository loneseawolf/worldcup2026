// Gate for the 15-minute cron grid: exit with run=true only when "now" is
// inside a match window (kickoff-25min .. kickoff+3h45min) or in the daily
// full-refresh slot (04:00-04:14 UTC). The dense generated cron table proved
// unreliable: GitHub's scheduler drops entries from very long schedule lists,
// so the workflow now fires on a coarse grid and decides here, cheaply.
import fs from 'node:fs'

const now = process.env.CRON_GUARD_NOW ? Date.parse(process.env.CRON_GUARD_NOW) : Date.now()
const PRE = 25 * 60 * 1000
const POST = 225 * 60 * 1000

const d = new Date(now)
const daily = d.getUTCHours() === 4 && d.getUTCMinutes() < 15

const { matches } = JSON.parse(fs.readFileSync('public/data/matches.json', 'utf8'))
const inWindow = matches.some((m) => {
  const ko = Date.parse(m.date)
  return now >= ko - PRE && now <= ko + POST && m.status !== 'finished'
})

const run = daily || inWindow

// bridge: keep the chain warm across overnight gaps. If the next unfinished
// match opens within MAX_GAP (12h), report how long to sleep — capped at HOP
// (4h) so a single Actions job never approaches the 6h job limit; the
// re-dispatched bridge chains the remaining distance in further ≤4h hops.
const MAX_GAP = 12 * 3600 * 1000
const HOP = 4 * 3600 * 1000
let wait = ''
if (!run) {
  const starts = matches
    .filter((m) => m.status !== 'finished')
    .map((m) => Date.parse(m.date) - PRE)
    .filter((t) => t > now && t - now <= MAX_GAP)
  if (starts.length) wait = String(Math.ceil(Math.min(Math.min(...starts) - now, HOP) / 1000) + 15)
}

console.log(
  `cron-guard: now=${d.toISOString()} daily=${daily} inWindow=${inWindow} -> run=${run} wait=${wait || '-'}`,
)
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\nwait=${wait}\n`)
