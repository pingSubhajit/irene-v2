import { z } from "zod"

export const CATEGORY_ICON_NAME_VALUES = [
  "wallet-3-line",
  "shopping-bag-4-line",
  "restaurant-2-line",
  "car-line",
  "bus-2-line",
  "train-line",
  "flight-takeoff-line",
  "hotel-bed-line",
  "home-gear-line",
  "lightbulb-flash-line",
  "wifi-line",
  "smartphone-line",
  "download-cloud-2-line",
  "bank-card-line",
  "bill-line",
  "receipt-line",
  "file-list-3-line",
  "repeat-line",
  "refresh-line",
  "coins-line",
  "money-rupee-circle-line",
  "exchange-dollar-line",
  "refund-2-line",
  "gamepad-line",
  "movie-2-line",
  "headphone-line",
  "gift-line",
  "graduation-cap-line",
  "stethoscope-line",
  "question-line",
] as const

export const CATEGORY_COLOR_TOKEN_VALUES = [
  "graphite",
  "cream",
  "yellow",
  "green",
  "violet",
  "blue",
  "coral",
] as const

export const SYSTEM_CATEGORY_SLUG_VALUES = [
  "income",
  "salary",
  "shopping",
  "food",
  "transport",
  "subscriptions",
  "bills",
  "gaming",
  "software",
  "digital_goods",
  "entertainment",
  "travel",
  "utilities",
  "debt",
  "transfers",
  "refunds",
  "uncategorized",
] as const

export type CategoryIconName = (typeof CATEGORY_ICON_NAME_VALUES)[number]
export type CategoryColorToken = (typeof CATEGORY_COLOR_TOKEN_VALUES)[number]
export type SystemCategorySlug = (typeof SYSTEM_CATEGORY_SLUG_VALUES)[number]

export const CATEGORY_ICON_NAME_SCHEMA = z.enum(CATEGORY_ICON_NAME_VALUES)
export const CATEGORY_COLOR_TOKEN_SCHEMA = z.enum(CATEGORY_COLOR_TOKEN_VALUES)

export const DEFAULT_CATEGORY_ICON_NAME: CategoryIconName = "question-line"
export const DEFAULT_CATEGORY_COLOR_TOKEN: CategoryColorToken = "graphite"

export const SYSTEM_CATEGORY_PRESENTATION: Record<
  SystemCategorySlug,
  { iconName: CategoryIconName; colorToken: CategoryColorToken }
> = {
  income: {
    iconName: "money-rupee-circle-line",
    colorToken: "green",
  },
  salary: {
    iconName: "wallet-3-line",
    colorToken: "green",
  },
  shopping: {
    iconName: "shopping-bag-4-line",
    colorToken: "yellow",
  },
  food: {
    iconName: "restaurant-2-line",
    colorToken: "coral",
  },
  transport: {
    iconName: "car-line",
    colorToken: "blue",
  },
  subscriptions: {
    iconName: "repeat-line",
    colorToken: "violet",
  },
  bills: {
    iconName: "bill-line",
    colorToken: "cream",
  },
  gaming: {
    iconName: "gamepad-line",
    colorToken: "violet",
  },
  software: {
    iconName: "file-list-3-line",
    colorToken: "blue",
  },
  digital_goods: {
    iconName: "download-cloud-2-line",
    colorToken: "cream",
  },
  entertainment: {
    iconName: "movie-2-line",
    colorToken: "coral",
  },
  travel: {
    iconName: "flight-takeoff-line",
    colorToken: "blue",
  },
  utilities: {
    iconName: "lightbulb-flash-line",
    colorToken: "yellow",
  },
  debt: {
    iconName: "bank-card-line",
    colorToken: "coral",
  },
  transfers: {
    iconName: "exchange-dollar-line",
    colorToken: "cream",
  },
  refunds: {
    iconName: "refund-2-line",
    colorToken: "green",
  },
  uncategorized: {
    iconName: DEFAULT_CATEGORY_ICON_NAME,
    colorToken: DEFAULT_CATEGORY_COLOR_TOKEN,
  },
}
