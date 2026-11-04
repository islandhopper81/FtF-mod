import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CuisineGroup, Day, Dish, Menu, MenuDish, Tab, Week } from '../types'

const PANE = 'FtF-mod'
const DEFAULT_API_URL = 'https://feedthefamily.app'
// Locally the API runs on :3001 and the app on Vite's :3000; in production they share a host.
const LOCAL_API_ORIGIN = 'http://localhost:3001'
const LOCAL_APP_ORIGIN = 'http://localhost:3000'
const REFRESH_EVERY_MS = 15 * 60 * 1000
// list_menu_items answers at most 100 dishes.
const MENU_LIMIT = 100
// Searching waits for a pause in the typing, so each keystroke is not a request.
const SEARCH_DELAY_MS = 400
const STAR_VALUES = [1, 2, 3, 4, 5]
// The app's built-in dietary tags.
const DEFAULT_DIETARY_TAGS = ['Healthy', 'Vegetarian', 'Gluten-Free', 'Dairy-Free', 'Vegan']
const OTHER_CUISINE = 'Other'
// The app's Menu cards show two dietary tags, then "+N" for the rest.
const SHOWN_TAG_COUNT = 2
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// FeedTheFamily's colors: the logo's, and the green the app uses for text and buttons.
const BRAND = {
  green: '#15803d', // action text, primary-700: the Navbar wordmark
  greenFill: '#1c8545', // action fill, carries white text
  orange: '#D97838', // BRAND_ORANGE, the logo's
  orangeLight: '#F2AB58', // the logo gradient's light end
  cream: '#FFF8F1', // BRAND_CREAM, the logo's steam and bowl
  amber: '#d97706', // amber-600
  placeholderGray: '#f3f4f6', // gray-100, behind the no-photo picture
  // A Menu card's dietary tag in the app: text-green-700 on bg-green-50, and a gray-400 "+N".
  tagFill: '#f0fdf4', // green-50
  mutedGray: '#9ca3af', // gray-400
}

// The FeedTheFamily logo, as the app draws it; update it here when the app's logo changes.
const BRAND_MARK_PATHS = [
  'M15.2 11 C21.2 17 11.4 20.1 16.3 26 C8.2 21.1 18.4 16.9 15.2 11 Z',
  'M23.4 5.5 C30.9 13.9 18.8 18.8 25 26 C15.3 19.7 27.4 13.1 23.4 5.5 Z',
  'M31.2 11 C37.2 17 27.4 20.1 32.3 26 C24.2 21.1 34.4 16.9 31.2 11 Z',
  'M6.3 27 Q24 29.6 41.7 27 Q43 26.8 42.4 28.6 C40.2 34 35.5 37.4 31.7 38.7 L31.7 40 Q31.7 40.8 30.8 40.8 H17.2 Q16.3 40.8 16.3 40 V38.7 C12.5 37.4 7.8 34 5.6 28.6 Q5 26.8 6.3 27 Z',
]
const LOGO_SIZE = 32
const LOGO_SVG = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${LOGO_SIZE}" height="${LOGO_SIZE}">`,
  '<defs>',
  `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${BRAND.orangeLight}"/><stop offset="1" stop-color="${BRAND.orange}"/></linearGradient>`,
  '<clipPath id="c"><rect width="48" height="48" rx="12"/></clipPath>',
  '</defs>',
  '<g clip-path="url(#c)">',
  '<rect width="48" height="48" fill="url(#g)"/>',
  '<path d="M0 0 H35 C24 10 12 17 0 27 Z" fill="#fff" opacity="0.07"/>',
  '<path d="M48 5 V14 C34 24 16 33 0 43 V36 C17 26 34 17 48 5 Z" fill="#fff" opacity="0.05"/>',
  `<g fill="${BRAND.cream}">${BRAND_MARK_PATHS.map(d => `<path d="${d}"/>`).join('')}</g>`,
  '</g>',
  '</svg>',
].join('')

const THUMBNAIL_SIZE = 40
const THUMBNAIL_RADIUS = 8
// An Svg's markup may be at most 131072 characters; a larger picture is left out.
const MAX_SVG_CHARS = 131072

function roundedSvg(content: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMBNAIL_SIZE}" height="${THUMBNAIL_SIZE}">`,
    `<defs><clipPath id="r"><rect width="${THUMBNAIL_SIZE}" height="${THUMBNAIL_SIZE}" rx="${THUMBNAIL_RADIUS}"/></clipPath></defs>`,
    `<g clip-path="url(#r)">${content}</g>`,
    '</svg>',
  ].join('')
}

// The pane's Text has no size, and a Box's round border adds a cell of space on every side, so
// on desktop the title and the tag chips are drawn as pictures. Widths are estimated from the
// letters, at about 0.55em each in the system sans-serif.
const SANS = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
const TITLE_FONT_SIZE = 20 // the app's Navbar wordmark is text-lg (18px), bold
const TAG_FONT_SIZE = 12 // text-xs
const TAG_HEIGHT = 20
const TAG_PADDING_X = 6 // px-1.5

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function estimateTextWidth(text: string, fontSize: number): number {
  return Math.ceil(text.length * fontSize * 0.55)
}

export function wordmarkSvg(): { source: string; width: number; height: number } {
  const title = 'Feed The Family'
  const width = estimateTextWidth(title, TITLE_FONT_SIZE) + 8
  const height = Math.round(TITLE_FONT_SIZE * 1.4)
  const source = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<text x="0" y="50%" dominant-baseline="central" font-family="${SANS}" font-size="${TITLE_FONT_SIZE}" font-weight="700" fill="${BRAND.green}">${title}</text>`,
    '</svg>',
  ].join('')
  return { source, width, height }
}

// A Menu card's dietary tag as the app draws it: green-700 text on a green-50 pill.
export function tagSvg(tag: string): { source: string; width: number; height: number } {
  const width = estimateTextWidth(tag, TAG_FONT_SIZE) + TAG_PADDING_X * 2
  const source = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${TAG_HEIGHT}">`,
    `<rect width="${width}" height="${TAG_HEIGHT}" rx="${TAG_HEIGHT / 2}" fill="${BRAND.tagFill}"/>`,
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="${SANS}" font-size="${TAG_FONT_SIZE}" fill="${BRAND.green}">${escapeXml(tag)}</text>`,
    '</svg>',
  ].join('')
  return { source, width, height: TAG_HEIGHT }
}

export function thumbnailSvg(base64: string): string | null {
  const svg = roundedSvg(
    `<image width="${THUMBNAIL_SIZE}" height="${THUMBNAIL_SIZE}" preserveAspectRatio="xMidYMid slice" href="data:image/jpeg;base64,${base64}"/>`,
  )
  return svg.length <= MAX_SVG_CHARS ? svg : null
}

// A dish with no picture gets the fork, knife and plate the app's Menu cards show, so every row lines up.
const PLACEHOLDER_SVG = roundedSvg(
  [
    `<rect width="${THUMBNAIL_SIZE}" height="${THUMBNAIL_SIZE}" fill="${BRAND.placeholderGray}"/>`,
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="24">🍽️</text>`,
  ].join(''),
)

const EMPTY_WEEK: Week = { status: 'idle', days: [], freezerCount: null, message: null, fetchedAt: null, checkedAt: null }
const week = atom({ plugin: 'FtF-mod', key: 'week' } as const, EMPTY_WEEK)
const tab = atom({ plugin: 'FtF-mod', key: 'tab' } as const, 'week' as Tab)
const EMPTY_MENU: Menu = { status: 'idle', query: '', dishes: [], message: null }
const menu = atom({ plugin: 'FtF-mod', key: 'menu' } as const, EMPTY_MENU)

// The MCP route is stateless, so each tools/call is a request of its own. The SDK answers
// either plain JSON or a one-message event stream, depending on what it chooses to send.
export function readMcpText(body: string): string {
  const dataLine = body.split('\n').find(line => line.startsWith('data:'))
  const message = JSON.parse(dataLine ? dataLine.slice('data:'.length) : body)
  if (message.error) throw new Error(message.error.message ?? 'MCP error')
  const text = (message.result?.content ?? []).map((part: { text?: string }) => part.text ?? '').join('\n')
  if (message.result?.isError) throw new Error(text || 'Tool error')
  return text
}

// get_week_schedule returns "YYYY-MM-DD:" lines, each followed by "  Slot: [id] Dish | [id] Dish".
// The pane shows dinners only.
export function parseWeekSchedule(text: string): Day[] {
  const days: Day[] = []
  for (const line of text.split('\n')) {
    const date = line.match(/^(\d{4}-\d{2}-\d{2}):\s*$/)?.[1]
    if (date) {
      days.push({ date, dinner: [] })
      continue
    }
    const dishList = line.match(/^\s+Dinner:\s*(.*)$/)?.[1]
    const day = days[days.length - 1]
    if (dishList === undefined || !day || dishList === '(empty)') continue
    day.dinner = dishList
      .split(' | ')
      .map((dish): Dish => {
        const [, id, name = dish] = dish.match(/^\[(\d+)\]\s*(.*)$/) ?? []
        return { id: id ? Number(id) : null, name: name.trim(), thumbnail: null, myRating: null }
      })
      .filter(dish => dish.name !== '')
  }
  return days
}

type ThumbnailEntry = { menu_item_id?: number | null; my_rating?: number | null; name?: string; thumbnail?: { base64?: string } | null }
type ThumbnailDay = { date: string; slots: { Dinner?: ThumbnailEntry[] } }

// get_week_schedule_thumbnails (unlisted) returns JSON: { start_date, days: [{ date, slots }] }.
export function parseWeekThumbnails(text: string): Day[] {
  const { days } = JSON.parse(text) as { days: ThumbnailDay[] }
  return days.map(day => ({
    date: day.date,
    dinner: (day.slots.Dinner ?? []).map(entry => ({
      id: entry.menu_item_id ?? null,
      name: entry.name ?? 'Unnamed dish',
      thumbnail: entry.thumbnail?.base64 ?? null,
      myRating: entry.my_rating ?? null,
    })),
  }))
}

// A server without the thumbnail tool (production until a release carries it) gets the text one.
async function fetchWeekDays($: EngineInterface, args: Record<string, string>): Promise<Day[]> {
  try {
    return parseWeekThumbnails(await callTool($, 'get_week_schedule_thumbnails', args))
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith('Unknown tool'))) throw error
    return parseWeekSchedule(await callTool($, 'get_week_schedule', args))
  }
}

// list_menu_items returns "[id] Dish | $$ | 4.5★ | Tag, Tag | Cuisine, Cuisine" lines, each part
// after the name only when the dish has it, some followed by an indented "Nutrition:" line, or
// "No meals found ...". The two lists look alike, so a lone list counts as dietary tags only
// when every entry is one of the app's built-in tags.
export function parseMenuItems(text: string): MenuDish[] {
  return text
    .split('\n')
    .map(line => line.match(/^\[(\d+)\]\s+(.*)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map(([, id, rest = '']): MenuDish => {
      const [name = '', ...parts] = rest.split(' | ').map(part => part.trim())
      const dish: MenuDish = { id: Number(id), name, price: null, rating: null, dietaryTags: [], cuisines: [] }
      const lists: string[][] = []
      for (const part of parts) {
        if (/^\$+$/.test(part)) dish.price = part
        else if (/^\d+(\.\d+)?★$/.test(part)) dish.rating = Number(part.slice(0, -1))
        else if (part !== '') lists.push(part.split(',').map(entry => entry.trim()).filter(Boolean))
      }
      const [first = [], second] = lists
      if (second) {
        dish.dietaryTags = first
        dish.cuisines = second
      } else if (first.every(entry => DEFAULT_DIETARY_TAGS.includes(entry))) {
        dish.dietaryTags = first
      } else {
        dish.cuisines = first
      }
      return dish
    })
}

// Headings in alphabetical order with OTHER_CUISINE last; each dish sits under its first
// cuisine and keeps the server's order.
export function groupByCuisine(dishes: MenuDish[]): CuisineGroup[] {
  const groups = new Map<string, MenuDish[]>()
  for (const dish of dishes) {
    const cuisine = dish.cuisines[0] ?? OTHER_CUISINE
    groups.set(cuisine, [...(groups.get(cuisine) ?? []), dish])
  }
  return [...groups.entries()]
    .map(([cuisine, groupDishes]) => ({ cuisine, dishes: groupDishes }))
    .sort((a, b) => {
      if (a.cuisine === OTHER_CUISINE) return 1
      if (b.cuisine === OTHER_CUISINE) return -1
      return a.cuisine.localeCompare(b.cuisine)
    })
}

// 4.5 → "★★★★½": whole stars, then a half when the average rounds to one.
export function averageStars(rating: number): string {
  const halves = Math.round(rating * 2)
  return '★'.repeat(Math.floor(halves / 2)) + (halves % 2 === 1 ? '½' : '')
}

// list_freezer_items returns one "[id] Dish — qty: N, ..." line per item, or "Freezer is empty."
export function countFreezerItems(text: string): number {
  return text.split('\n').filter(line => /^\[\d+\]/.test(line)).length
}

export function formatDayLabel(date: string): string {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return `${WEEKDAYS[weekday]}, ${MONTHS[month - 1]} ${day}`
}

export function formatCheckedTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// Where the pane's links open. FTF_APP_URL wins; otherwise the API's own address, with the
// local API swapped for the local app.
export async function appBaseUrl($: EngineInterface): Promise<string> {
  const appUrl = await $.env.get('FTF_APP_URL')
  if (appUrl) return appUrl.replace(/\/$/, '')
  const apiUrl = ((await $.env.get('FTF_API_URL')) ?? DEFAULT_API_URL).replace(/\/$/, '')
  return apiUrl === LOCAL_API_ORIGIN ? LOCAL_APP_ORIGIN : apiUrl
}

async function callTool($: EngineInterface, name: string, args: Record<string, unknown>): Promise<string> {
  const token = await $.env.get('FTF_MCP_TOKEN')
  if (!token) {
    throw new Error(
      'Set FTF_MCP_TOKEN to your MCP token (Integrations page), then fully quit Claude (including the tray icon) and reopen it.',
    )
  }
  const apiUrl = (await $.env.get('FTF_API_URL')) ?? DEFAULT_API_URL

  const response = await $.http.fetch(`${apiUrl.replace(/\/$/, '')}/api/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  })
  if (response.status === 401) throw new Error('FeedTheFamily refused the token. Make a new one on the Integrations page.')
  if (!response.ok) throw new Error(`FeedTheFamily answered ${response.status}.`)
  return readMcpText(response.text)
}

async function refreshWeek($: EngineInterface): Promise<void> {
  await update($, week, (current): Week => ({ ...current, status: 'loading', message: null }))
  try {
    const timezone = await $.env.get('FTF_TIMEZONE')
    const args: Record<string, string> = timezone ? { timezone } : {}
    const [days, freezerText] = await Promise.all([fetchWeekDays($, args), callTool($, 'list_freezer_items', {})])
    const fetchedAt = await $.clock.now()
    await update($, week, (): Week => ({
      status: 'ok',
      days,
      freezerCount: countFreezerItems(freezerText),
      message: null,
      fetchedAt,
      checkedAt: fetchedAt,
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const checkedAt = await $.clock.now()
    await update($, week, (current): Week => ({ ...current, status: 'error', message, checkedAt }))
  }
}

// Only the newest search may write its answer; an older one still in flight is dropped.
let latestSearch = 0
let pendingSearch: { cancel: () => void } | null = null

async function searchMenu($: EngineInterface, query: string): Promise<void> {
  pendingSearch?.cancel()
  pendingSearch = null
  const search = ++latestSearch
  await update($, menu, (current): Menu => ({ ...current, status: 'loading', query, message: null }))
  try {
    const args: Record<string, unknown> = { limit: MENU_LIMIT }
    if (query.trim()) args.search = query.trim()
    const dishes = parseMenuItems(await callTool($, 'list_menu_items', args))
    if (search !== latestSearch) return
    await update($, menu, (): Menu => ({ status: 'ok', query, dishes, message: null }))
  } catch (error) {
    if (search !== latestSearch) return
    const message = error instanceof Error ? error.message : String(error)
    await update($, menu, (current): Menu => ({ ...current, status: 'error', message }))
  }
}

function searchMenuSoon($: EngineInterface, query: string): void {
  pendingSearch?.cancel()
  pendingSearch = $.clock.after(SEARCH_DELAY_MS, () => void searchMenu($, query))
}

// $.state outlives a reload, so a menu saved by an older version of the pane can lack fields
// this one reads; such a menu counts as never loaded, and the tab fetches it again.
export function currentMenuOrEmpty(saved: Menu): Menu {
  const current = saved.dishes.every(dish => Array.isArray(dish.cuisines) && Array.isArray(dish.dietaryTags))
  return current ? saved : EMPTY_MENU
}

async function readMenu($: EngineInterface): Promise<Menu> {
  return currentMenuOrEmpty(await read($, menu))
}

async function showTab($: EngineInterface, next: Tab): Promise<void> {
  await update($, tab, (): Tab => next)
  if (next === 'menu' && (await readMenu($)).status === 'idle') await searchMenu($, '')
}

function withRating(days: Day[], menuItemId: number, myRating: number | null): Day[] {
  return days.map(day => ({
    ...day,
    dinner: day.dinner.map(dish => (dish.id === menuItemId ? { ...dish, myRating } : dish)),
  }))
}

// The stars change at once; a refused rating puts the old one back and says why.
async function rateDish($: EngineInterface, menuItemId: number, stars: number, previous: number | null): Promise<void> {
  await update($, week, (current): Week => ({ ...current, days: withRating(current.days, menuItemId, stars), message: null }))
  try {
    await callTool($, 'rate_menu_item', { menu_item_id: menuItemId, stars })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await update($, week, (current): Week => ({
      ...current,
      days: withRating(current.days, menuItemId, previous),
      message: `Could not save the rating: ${reason}`,
    }))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'this-week',
      description: "Show this week's FeedTheFamily dinners and your menu in a pane",
    })
    void $.ui.open({ id: PANE, title: 'FeedTheFamily' })
    void refreshWeek($)
    $.clock.every(REFRESH_EVERY_MS, () => refreshWeek($))

    return next(e)
  })

  on('command.run', { command: 'this-week' }, async $ => {
    await $.ui.open({ id: PANE, title: 'FeedTheFamily' })
    await refreshWeek($)

    return { text: 'This week pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Link, Text } = elements
    const appUrl = await appBaseUrl($)
    const dishLink = (dish: { id: number | null; name: string }) =>
      dish.id === null ? <Text>{dish.name}</Text> : <Link href={`${appUrl}/menu/${dish.id}`} label={dish.name} />
    // Five one-glyph Buttons; a press sets that many stars. A deleted dish has nothing to rate.
    const ratingStars = (dish: Dish, keyPrefix: string) => {
      const menuItemId = dish.id
      if (menuItemId === null) return null
      const filled = dish.myRating ?? 0
      return (
        <Box flexDirection="row" gap={0}>
          {STAR_VALUES.map(stars => (
            <Button
              key={`${keyPrefix}-star-${stars}`}
              label={stars <= filled ? '★' : '☆'}
              plain
              dimColor={stars > filled || undefined}
              onPress={() => rateDish($, menuItemId, stars, dish.myRating)}
            />
          ))}
        </Box>
      )
    }
    // The mobile app draws no text field yet; there the Menu tab lists the whole library.
    const Input = 'Input' in elements ? elements.Input : null
    const currentTab = await read($, tab)
    const current = await read($, week)
    const currentMenu = await readMenu($)

    // `in` only narrows the type: every surface's table answers it, so the surface decides.
    const Svg = e.surface === 'desktop' && 'Svg' in elements ? elements.Svg : null
    const wordmark = wordmarkSvg()

    const status =
      current.status === 'loading'
        ? 'Refreshing…'
        : current.checkedAt !== null
          ? `Updated ${formatCheckedTime(current.checkedAt)}`
          : ''

    // A Button takes a plain label only (no colored Text inside), so the open tab is marked with a dot
    // and the other drawn dim.
    const tabButton = (id: Tab, label: string, hotkey: string) => {
      const isActive = currentTab === id
      return (
        <Button
          key={`tab-${id}`}
          label={isActive ? `● ${label}` : label}
          hotkey={hotkey}
          dimColor={!isActive || undefined}
          onPress={() => showTab($, id)}
        />
      )
    }

    const weekView = (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          <Link href={`${appUrl}/calendar`} label="Open calendar" />
          <Link href={`${appUrl}/freezer`} label="Freezer" />
        </Box>
        <Box flexDirection="row" gap={1}>
          {status !== '' && (
            <Text color="subtle">
              {status}
            </Text>
          )}
          {current.freezerCount !== null && (
            <Text color={BRAND.amber}>
              ❄ {current.freezerCount} in the freezer
            </Text>
          )}
        </Box>
        {current.message && <Text color="error">{current.message}</Text>}
        {current.days.length === 0 && current.status !== 'error' && <Text color="subtle">Loading this week…</Text>}
        {current.days.map((day, index) => {
          const isToday = index === 0
          return (
            <Box
              key={day.date}
              flexDirection="column"
              gap={0}
              borderStyle="round"
              borderColor={isToday ? BRAND.green : 'subtle'}
              paddingX={1}
            >
              <Box flexDirection="row" alignItems="center" gap={1}>
                <Text color={BRAND.green} bold>
                  {formatDayLabel(day.date)}
                </Text>
                {isToday && (
                  <Text color="white" backgroundColor={BRAND.greenFill} bold>
                    {' TODAY '}
                  </Text>
                )}
              </Box>
              {day.dinner.length === 0 && (
                <Text color="subtle" italic>
                  Nothing planned
                </Text>
              )}
              {!Svg &&
                day.dinner.map((dish, dishIndex) => (
                  <Box key={`${day.date}-${dishIndex}`} flexDirection="row" gap={1}>
                    {dishLink(dish)}
                    {ratingStars(dish, `${day.date}-${dishIndex}`)}
                  </Box>
                ))}
              {Svg &&
                day.dinner.map((dish, dishIndex) => {
                  const picture = (dish.thumbnail && thumbnailSvg(dish.thumbnail)) || PLACEHOLDER_SVG
                  return (
                    <Box key={`${day.date}-${dishIndex}`} flexDirection="row" alignItems="center" gap={1}>
                      <Svg
                        key={`${day.date}-${dishIndex}-picture`}
                        source={picture}
                        alt={dish.name}
                        width={THUMBNAIL_SIZE}
                        height={THUMBNAIL_SIZE}
                      />
                      <Box flexDirection="column" gap={0}>
                        {dishLink(dish)}
                        {ratingStars(dish, `${day.date}-${dishIndex}`)}
                      </Box>
                    </Box>
                  )
                })}
            </Box>
          )
        })}
      </Box>
    )

    const searchedFor = currentMenu.query.trim()
    const dishCount = currentMenu.dishes.length
    const menuSummary =
      currentMenu.status === 'loading'
        ? 'Searching…'
        : currentMenu.status !== 'ok'
          ? ''
          : dishCount === 0
            ? searchedFor
              ? `No dishes match "${searchedFor}"`
              : 'No dishes in your menu yet'
            : dishCount >= MENU_LIMIT
              ? `Showing the first ${MENU_LIMIT} dishes. Search to narrow it down.`
              : `${dishCount} ${dishCount === 1 ? 'dish' : 'dishes'}`

    // One card per dish: the 🍽️ picture on desktop, the name, then stars, price, tag chips and
    // any cuisines beyond the heading the card sits under.
    const menuCard = (dish: MenuDish, heading: string) => {
      const otherCuisines = dish.cuisines.filter(cuisine => cuisine !== heading)
      const hasFacts = dish.rating !== null || dish.price !== null || otherCuisines.length > 0
      const shownTags = dish.dietaryTags.slice(0, SHOWN_TAG_COUNT)
      const hiddenTagCount = dish.dietaryTags.length - shownTags.length
      return (
        <Box
          key={`menu-dish-${dish.id}`}
          flexDirection="row"
          alignItems="center"
          gap={1}
          borderStyle="round"
          borderColor="subtle"
          paddingX={1}
        >
          {Svg && <Svg source={PLACEHOLDER_SVG} alt="" width={THUMBNAIL_SIZE} height={THUMBNAIL_SIZE} />}
          <Box flexDirection="column" gap={0}>
            {dishLink(dish)}
            {hasFacts && (
              <Box flexDirection="row" gap={1}>
                {dish.rating !== null && <Text color={BRAND.amber}>{`${averageStars(dish.rating)} ${dish.rating}`}</Text>}
                {dish.price !== null && <Text color="subtle">{dish.price}</Text>}
                {otherCuisines.length > 0 && <Text color="subtle">{otherCuisines.join(', ')}</Text>}
              </Box>
            )}
            {shownTags.length > 0 && (
              <Box flexDirection="row" gap={1}>
                {shownTags.map(tag => {
                  if (Svg) {
                    const pill = tagSvg(tag)
                    return <Svg key={`tag-${tag}`} source={pill.source} alt={tag} width={pill.width} height={pill.height} />
                  }
                  return (
                    <Text key={`tag-${tag}`} color={BRAND.green} backgroundColor={BRAND.tagFill}>
                      {` ${tag} `}
                    </Text>
                  )
                })}
                {hiddenTagCount > 0 && <Text color={BRAND.mutedGray}>{`+${hiddenTagCount}`}</Text>}
              </Box>
            )}
          </Box>
        </Box>
      )
    }

    const menuView = (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          <Link href={`${appUrl}/menu`} label="Open menu" />
          <Link href={`${appUrl}/menu/new`} label="Add a dish" />
        </Box>
        {Input && (
          <Input
            key="menu-search"
            placeholder="Search dishes"
            value={currentMenu.query}
            submitLabel="search"
            onInput={(value: string) => searchMenuSoon($, value)}
            onSubmit={(value: string) => void searchMenu($, value)}
          />
        )}
        {menuSummary !== '' && <Text color="subtle">{menuSummary}</Text>}
        {currentMenu.message && <Text color="error">{currentMenu.message}</Text>}
        {groupByCuisine(currentMenu.dishes).map(group => (
          <Box key={`cuisine-${group.cuisine}`} flexDirection="column" gap={0}>
            <Text color={BRAND.green} bold>
              {`${group.cuisine} · ${group.dishes.length}`}
            </Text>
            {group.dishes.map(dish => menuCard(dish, group.cuisine))}
          </Box>
        ))}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" alignItems="center" justifyContent="space-between">
          <Box flexDirection="row" alignItems="center" gap={1}>
            {Svg && <Svg key="logo" source={LOGO_SVG} alt="" width={LOGO_SIZE} height={LOGO_SIZE} />}
            <Box flexDirection="column">
              {Svg ? (
                <Svg key="wordmark" source={wordmark.source} alt="Feed The Family" width={wordmark.width} height={wordmark.height} />
              ) : (
                <Text color={BRAND.green} bold>
                  Feed The Family
                </Text>
              )}
              <Text color="subtle">
                {currentTab === 'week' ? "This week's dinners" : 'Take the mental load off your plate'}
              </Text>
            </Box>
          </Box>
          <Button
            key="refresh"
            label="Refresh"
            onPress={() => (currentTab === 'week' ? refreshWeek($) : searchMenu($, currentMenu.query))}
          />
        </Box>
        <Box flexDirection="row" gap={2}>
          {tabButton('week', 'This week', 'w')}
          {tabButton('menu', 'Menu', 'm')}
        </Box>
        {currentTab === 'week' ? weekView : menuView}
      </Box>
    )
  })
}
