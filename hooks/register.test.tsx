import { expect, mock, test } from 'claude-code/testing'

import { countFreezerItems, formatTonightsDinner, localDateString, parseDinnersForDate, tagSvg, currentMenuOrEmpty, formatDayLabel, groupByCuisine, averageStars, parseMenuItems, parseWeekSchedule, parseWeekThumbnails, readMcpText, thumbnailSvg } from './register'

const PANE = {
  plugin: 'FtF-mod',
  component: 'Pane',
  requestId: 'FtF-mod',
  props: {
    title: 'FeedTheFamily',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const WEEK_TEXT = [
  '2026-11-02:',
  '  Breakfast: (empty)',
  '  Lunch: (empty)',
  '  Dinner: [12] Tacos | [13] Side Salad',
  '',
  '2026-11-03:',
  '  Breakfast: [14] Oatmeal',
  '  Lunch: (empty)',
  '  Dinner: (empty)',
].join('\n')

const FREEZER_TEXT = '[3] Lasagna — qty: 2, frozen: 2026-10-01\n[4] Chili — qty: 1, frozen: 2026-10-05\n  Notes: spicy'

const MENU_TEXT = [
  '3 meal(s) found:',
  '[12] Tacos | $ | 4.5★ | Gluten-Free | Mexican',
  '  Nutrition: 500 cal | 20g protein',
  '[15] Plain Rice',
  '[16] Burrito Bowl | $$ | Mexican, Tex-Mex',
].join('\n')

const THUMBNAIL_JSON = JSON.stringify({
  start_date: '2026-11-02',
  days: [
    {
      date: '2026-11-02',
      slots: {
        Breakfast: [],
        Lunch: [],
        Dinner: [
          { entry_id: 1, menu_item_id: 12, name: 'Tacos', my_rating: 4, thumbnail: { mime: 'image/jpeg', base64: 'AAAA' } },
          { entry_id: 2, menu_item_id: 13, name: 'Side Salad', thumbnail: null },
        ],
      },
    },
  ],
})

// Each engine test loads the mod and mounts the pane; on a busy machine that alone can pass 5 s.
const ENGINE_TEST = { timeoutMs: 30000 }

function asEventStream(text: string, isError = false): string {
  const message = { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text }], ...(isError ? { isError } : {}) } }
  return `event: message\ndata: ${JSON.stringify(message)}\n\n`
}

test('parses dinners and their dish ids from the week schedule, dropping other meals', () => {
  const days = parseWeekSchedule(WEEK_TEXT)
  expect(days).toEqual([
    {
      date: '2026-11-02',
      dinner: [
        { id: 12, name: 'Tacos', thumbnail: null, myRating: null },
        { id: 13, name: 'Side Salad', thumbnail: null, myRating: null },
      ],
    },
    { date: '2026-11-03', dinner: [] },
  ])
})

test('reads the thumbnail tool, keeping a dish with no picture', () => {
  expect(parseWeekThumbnails(THUMBNAIL_JSON)).toEqual([
    {
      date: '2026-11-02',
      dinner: [
        { id: 12, name: 'Tacos', thumbnail: 'AAAA', myRating: 4 },
        { id: 13, name: 'Side Salad', thumbnail: null, myRating: null },
      ],
    },
  ])
})

test('a picture too large for an Svg is left out', () => {
  expect(thumbnailSvg('AAAA')).toContain('data:image/jpeg;base64,AAAA')
  expect(thumbnailSvg('A'.repeat(140000))).toBeNull()
})

test('parses menu dishes and their ids, dropping nutrition lines', () => {
  expect(parseMenuItems(MENU_TEXT)).toEqual([
    { id: 12, name: 'Tacos', price: '$', rating: 4.5, dietaryTags: ['Gluten-Free'], cuisines: ['Mexican'] },
    { id: 15, name: 'Plain Rice', price: null, rating: null, dietaryTags: [], cuisines: [] },
    { id: 16, name: 'Burrito Bowl', price: '$$', rating: null, dietaryTags: [], cuisines: ['Mexican', 'Tex-Mex'] },
  ])
  expect(parseMenuItems('No meals found matching those filters.')).toEqual([])
})

test('a lone list is dietary tags only when every entry is a built-in tag', () => {
  expect(parseMenuItems('[1] Salad | Vegan, Healthy')[0]).toMatchObject({ dietaryTags: ['Vegan', 'Healthy'], cuisines: [] })
  expect(parseMenuItems('[2] Curry | Vegan, Thai')[0]).toMatchObject({ dietaryTags: [], cuisines: ['Vegan', 'Thai'] })
  expect(parseMenuItems('[3] Pad Thai | Spicy, Vegan | Thai')[0]).toMatchObject({ dietaryTags: ['Spicy', 'Vegan'], cuisines: ['Thai'] })
})

test('groups dishes under their first cuisine, Other last', () => {
  const groups = groupByCuisine(parseMenuItems(MENU_TEXT))
  expect(groups.map(group => [group.cuisine, group.dishes.map(dish => dish.name)])).toEqual([
    ['Mexican', ['Tacos', 'Burrito Bowl']],
    ['Other', ['Plain Rice']],
  ])
})

test('a dish shows two tags, then a count of the rest', ENGINE_TEST, async ($, on) => {
  mock.env(on, { FTF_MCP_TOKEN: 'test-token' })
  on('http.fetch', (_, e) => {
    const { name } = JSON.parse(e.init?.body ?? '{}').params
    const text =
      name === 'list_menu_items'
        ? '[20] Grain Bowl | Healthy, Vegan, Gluten-Free, Dairy-Free | Korean'
        : name === 'get_week_schedule_thumbnails' ? THUMBNAIL_JSON : FREEZER_TEXT
    return { value: { status: 200, ok: true, headers: {}, text: asEventStream(text) } }
  })
  on('clock.now', () => ({ value: 0 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.run', () => ({ text: '' }))

  await $.command.run({ command: 'this-week', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-menu' })
  const pills = (await ui.findAll({ type: 'Svg' })).map(svg => svg.props.alt)
  expect(pills).toContain('Healthy')
  expect(pills).toContain('Vegan')
  expect(pills).not.toContain('Gluten-Free')
  expect(await ui.find({ type: 'Text', text: '+2' })).toBeDefined()
  await ui.unmount()
})

test('a tag pill escapes its text and fits it', () => {
  const pill = tagSvg('Mac & Cheese <3')
  expect(pill.source).toContain('Mac &amp; Cheese &lt;3')
  expect(pill.width).toBeGreaterThan(tagSvg('Vegan').width)
})

test('draws an average as whole and half stars', () => {
  expect(averageStars(4.5)).toBe('★★★★½')
  expect(averageStars(4.2)).toBe('★★★★')
  expect(averageStars(3.8)).toBe('★★★★')
  expect(averageStars(1)).toBe('★')
})

test('counts freezer items, not their note lines', () => {
  expect(countFreezerItems(FREEZER_TEXT)).toBe(2)
  expect(countFreezerItems('Freezer is empty.')).toBe(0)
})

test('reads both JSON and event-stream MCP answers', () => {
  const json = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'hi' }] } })
  expect(readMcpText(json)).toBe('hi')
  expect(readMcpText(asEventStream('hi'))).toBe('hi')
})

test('labels a date with its weekday', () => {
  expect(formatDayLabel('2026-11-02')).toBe('Mon, Nov 2')
})

test('the pane shows the week fetched with the token', ENGINE_TEST, async ($, on) => {
  mock.env(on, { FTF_MCP_TOKEN: 'test-token', FTF_API_URL: 'http://localhost:3001' })
  const requests: { url: string; auth?: string; tool: string }[] = []
  on('http.fetch', (_, e) => {
    const tool = JSON.parse(e.init?.body ?? '{}').params.name
    requests.push({ url: e.url, auth: e.init?.headers?.Authorization, tool })
    const text = tool === 'get_week_schedule_thumbnails' ? THUMBNAIL_JSON : FREEZER_TEXT
    return { value: { status: 200, ok: true, headers: {}, text: asEventStream(text) } }
  })
  on('clock.now', () => ({ value: 0 }))
  on('clock.every', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'this-week' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.run', () => ({ text: '' }))

  await $.command.run({ command: 'this-week', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

  expect(requests.map(r => r.url)).toEqual(['http://localhost:3001/api/mcp', 'http://localhost:3001/api/mcp'])
  expect(requests.every(r => r.auth === 'Bearer test-token')).toBe(true)

  expect(requests.map(r => r.tool)).toEqual(['get_week_schedule_thumbnails', 'list_freezer_items'])

  // The terminal has no Svg, so it keeps one line per day, each dish a link into the local app.
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await terminal.find({ type: 'Link', text: 'Tacos' }))?.props.href).toBe('http://localhost:3000/menu/12')
  expect((await terminal.find({ type: 'Link', text: 'Side Salad' }))?.props.href).toBe('http://localhost:3000/menu/13')
  expect((await terminal.find({ type: 'Link', text: 'Open calendar' }))?.props.href).toBe('http://localhost:3000/calendar')
  expect(await terminal.find({ type: 'Text', text: /^Mon, Nov 2$/ })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: /TODAY/ })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: /2 in the freezer/ })).toBeDefined()
  await terminal.unmount()

  // The desktop draws a row per dish, the name beside its picture.
  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await desktop.find({ type: 'Link', text: 'Tacos' }))?.props.href).toBe('http://localhost:3000/menu/12')
  expect((await desktop.find({ type: 'Link', text: 'Side Salad' }))?.props.href).toBe('http://localhost:3000/menu/13')
  expect(await desktop.find({ type: 'Text', text: /Tacos · Side Salad/ })).toBeUndefined()
  // The header carries the app's logo and wordmark.
  expect(await desktop.find({ type: 'Text', text: 'Take the mental load off your plate' })).toBeDefined()
  expect((await desktop.findAll({ type: 'Svg' })).map(svg => svg.props.alt)).toContain('Feed The Family')
  // Desktop draws the title as a picture, so it can be larger than the pane's text.
  expect(await desktop.find({ type: 'Text', text: 'Feed The Family' })).toBeUndefined()
  await desktop.unmount()
})

test('a server without the thumbnail tool gets the text schedule', ENGINE_TEST, async ($, on) => {
  mock.env(on, { FTF_MCP_TOKEN: 'test-token' })
  const tools: string[] = []
  on('http.fetch', (_, e) => {
    const tool = JSON.parse(e.init?.body ?? '{}').params.name
    tools.push(tool)
    const text =
      tool === 'get_week_schedule_thumbnails'
        ? asEventStream(`Unknown tool: ${tool}`, true)
        : asEventStream(tool === 'get_week_schedule' ? WEEK_TEXT : FREEZER_TEXT)
    return { value: { status: 200, ok: true, headers: {}, text } }
  })
  on('clock.now', () => ({ value: 0 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.run', () => ({ text: '' }))

  await $.command.run({ command: 'this-week', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

  expect(tools).toContain('get_week_schedule')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Link', text: 'Tacos' }))?.props.href).toBe('https://feedthefamily.app/menu/12')
  // Breakfast and lunch are not shown, and a day with no dinner says so.
  expect(await ui.find({ type: 'Text', text: /Oatmeal/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Nothing planned/ })).toBeDefined()
  await ui.unmount()
})

test('without a token the pane says how to set one', ENGINE_TEST, async ($, on) => {
  mock.env(on, {})
  on('clock.now', () => ({ value: 0 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.run', () => ({ text: '' }))

  await $.command.run({ command: 'this-week', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Set FTF_MCP_TOKEN/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Updated / })).toBeDefined()
  await ui.unmount()
})

test('the Menu tab lists and searches dishes', ENGINE_TEST, async ($, on) => {
  mock.env(on, { FTF_MCP_TOKEN: 'test-token', FTF_APP_URL: 'https://app.example/' })
  const menuCalls: Record<string, unknown>[] = []
  on('http.fetch', (_, e) => {
    const { name, arguments: args } = JSON.parse(e.init?.body ?? '{}').params
    if (name === 'list_menu_items') {
      menuCalls.push(args)
      const text = args.search ? 'No meals found matching those filters.' : MENU_TEXT
      return { value: { status: 200, ok: true, headers: {}, text: asEventStream(text) } }
    }
    const text = name === 'get_week_schedule_thumbnails' ? THUMBNAIL_JSON : FREEZER_TEXT
    return { value: { status: 200, ok: true, headers: {}, text: asEventStream(text) } }
  })
  on('clock.now', () => ({ value: 0 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.run', () => ({ text: '' }))

  await $.command.run({ command: 'this-week', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // The week is the first tab; the menu loads only when its tab opens.
  expect(await ui.find({ type: 'Text', text: /Mon, Nov 2/ })).toBeDefined()
  expect(menuCalls).toEqual([])

  await ui.press({ key: 'tab-menu' })
  expect(menuCalls).toEqual([{ limit: 100 }])
  expect((await ui.find({ type: 'Link', text: 'Tacos' }))?.props.href).toBe('https://app.example/menu/12')
  expect((await ui.find({ type: 'Link', text: 'Open menu' }))?.props.href).toBe('https://app.example/menu')
  // Each dish is a card under its cuisine heading: stars, price, a chip per dietary tag, and
  // any cuisine beyond the heading.
  expect(await ui.find({ type: 'Text', text: 'Mexican · 2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Other · 1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '★★★★½ 4.5' })).toBeDefined()
  // On desktop a tag is a small rounded pill: green text on pale green.
  const pill = (await ui.findAll({ type: 'Svg' })).find(svg => svg.props.alt === 'Gluten-Free')
  expect(pill?.props.source).toContain('fill="#f0fdf4"')
  expect(pill?.props.source).toContain('fill="#15803d"')
  expect(pill?.props.height).toBe(20)
  expect(await ui.find({ type: 'Text', text: 'Take the mental load off your plate' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '$$' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Tex-Mex' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^3 dishes$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Mon, Nov 2/ })).toBeUndefined()

  await ui.input({ key: 'menu-search', text: 'pizza' })
  expect(menuCalls[1]).toEqual({ limit: 100, search: 'pizza' })
  expect(await ui.find({ type: 'Text', text: 'No dishes match "pizza"' })).toBeDefined()

  await ui.press({ key: 'tab-week' })
  expect(await ui.find({ type: 'Text', text: /Mon, Nov 2/ })).toBeDefined()
  await ui.unmount()
})

test('a dinner shows my stars, and a press changes them', ENGINE_TEST, async ($, on) => {
  mock.env(on, { FTF_MCP_TOKEN: 'test-token' })
  const ratings: Record<string, unknown>[] = []
  let refuseRating = false
  on('http.fetch', (_, e) => {
    const { name, arguments: args } = JSON.parse(e.init?.body ?? '{}').params
    if (name === 'rate_menu_item') {
      ratings.push(args)
      const text = refuseRating ? asEventStream('Menu item not found in your family', true) : asEventStream('Rated.')
      return { value: { status: 200, ok: true, headers: {}, text } }
    }
    const text = name === 'get_week_schedule_thumbnails' ? THUMBNAIL_JSON : FREEZER_TEXT
    return { value: { status: 200, ok: true, headers: {}, text: asEventStream(text) } }
  })
  on('clock.now', () => ({ value: 0 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.run', () => ({ text: '' }))

  await $.command.run({ command: 'this-week', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const star = async (dish: number, stars: number) =>
    (await ui.find({ type: 'Button', key: `2026-11-02-${dish}-star-${stars}` }))?.props.label

  // Tacos is rated 4; Side Salad is unrated.
  expect([await star(0, 4), await star(0, 5)]).toEqual(['★', '☆'])
  expect(await star(1, 1)).toBe('☆')

  await ui.press({ key: '2026-11-02-1-star-2' })
  expect(ratings).toEqual([{ menu_item_id: 13, stars: 2 }])
  expect([await star(1, 2), await star(1, 3)]).toEqual(['★', '☆'])

  // A refused rating puts the old stars back and says so.
  refuseRating = true
  await ui.press({ key: '2026-11-02-0-star-1' })
  expect([await star(0, 4), await star(0, 5)]).toEqual(['★', '☆'])
  expect(await ui.find({ type: 'Text', text: /Could not save the rating/ })).toBeDefined()
  await ui.unmount()
})

test('a menu saved by an older pane counts as never loaded', () => {
  // The shape the menu had before dishes carried their cuisines and tags.
  const oldMenu = { status: 'ok', query: '', dishes: [{ id: 12, name: 'Tacos', details: ['$', 'Mexican'] }], message: null }
  expect(currentMenuOrEmpty(oldMenu as never)).toEqual({ status: 'idle', query: '', dishes: [], message: null })
  const menu = { status: 'ok' as const, query: 'taco', dishes: parseMenuItems(MENU_TEXT), message: null }
  expect(currentMenuOrEmpty(menu)).toBe(menu)
})

test('reads only the dinners from a day of meals', () => {
  const text = 'Meals for 2026-11-03:\nBreakfast: [1] Oatmeal\nDinner: [7] Tacos\nDinner: [8] Side Salad'
  expect(parseDinnersForDate(text)).toEqual(['Tacos', 'Side Salad'])
  expect(parseDinnersForDate('No meals scheduled for 2026-11-03.')).toEqual([])
  expect(formatTonightsDinner(['Tacos', 'Side Salad'])).toBe("Tonight's dinner: Tacos, Side Salad")
  expect(formatTonightsDinner([])).toBe('Nothing is planned for dinner tonight.')
})

test('today is the local date, not the UTC one', () => {
  // 02:30 UTC on Nov 4 is still the evening of Nov 3 in New York.
  const lateEvening = Date.UTC(2026, 10, 4, 2, 30)
  expect(localDateString(lateEvening, 'America/New_York')).toBe('2026-11-03')
  expect(localDateString(lateEvening, 'UTC')).toBe('2026-11-04')
})

for (const command of ['wfd', 'whats-for-dinner']) {
  test(`/${command} answers with tonight's dinner and nothing else`, ENGINE_TEST, async ($, on) => {
    mock.env(on, { FTF_MCP_TOKEN: 'test-token', FTF_TIMEZONE: 'America/New_York' })
    const calls: { name: string; args: Record<string, unknown> }[] = []
    on('http.fetch', (_, e) => {
      const { name, arguments: args } = JSON.parse(e.init?.body ?? '{}').params
      calls.push({ name, args })
      const text = name === 'get_meals_for_date' ? 'Meals for 2026-11-03:\nLunch: [5] Soup\nDinner: [7] Tacos' : FREEZER_TEXT
      return { value: { status: 200, ok: true, headers: {}, text: asEventStream(text) } }
    })
    on('clock.now', () => ({ value: Date.UTC(2026, 10, 4, 2, 30) }))

    const result = await $.command.run({ command, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
    expect(result).toMatchObject({ text: "Tonight's dinner: Tacos" })
    expect(calls).toEqual([{ name: 'get_meals_for_date', args: { date: '2026-11-03' } }])
  })
}

test('/wfd says why when it cannot reach FeedTheFamily', ENGINE_TEST, async ($, on) => {
  mock.env(on, {})
  on('clock.now', () => ({ value: 0 }))
  const result = await $.command.run({ command: 'wfd', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  expect(result).toMatchObject({ text: expect.stringMatching(/^Could not get tonight's dinner: Set FTF_MCP_TOKEN/) })
})
