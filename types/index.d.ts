export type Dish = {
  // The menu item's id, for its link in the app; null for an entry whose dish was deleted.
  id: number | null
  name: string
  // A small JPEG, base64, when the server sent one.
  thumbnail: string | null
  // The person's own stars, 1 to 5; null when unrated or the server does not send it yet.
  myRating: number | null
}

// The pane shows dinners only.
export type Day = {
  date: string
  dinner: Dish[]
}

export type Week = {
  status: 'idle' | 'loading' | 'ok' | 'error'
  days: Day[]
  freezerCount: number | null
  message: string | null
  fetchedAt: number | null
  checkedAt: number | null
}

export type Tab = 'week' | 'menu'

export type MenuDish = {
  id: number
  name: string
  // '$', '$$' or '$$$'; null when the dish has no price point.
  price: string | null
  // The family's average stars, e.g. 4.5; null when nobody has rated it.
  rating: number | null
  dietaryTags: string[]
  cuisines: string[]
}

// The menu tab's headings: dishes under their first cuisine, the rest under OTHER_CUISINE.
export type CuisineGroup = {
  cuisine: string
  dishes: MenuDish[]
}

export type Menu = {
  status: 'idle' | 'loading' | 'ok' | 'error'
  // The search the shown dishes answer; '' is the whole library.
  query: string
  dishes: MenuDish[]
  message: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'FtF-mod': { week: Week; tab: Tab; menu: Menu }
  }
}
