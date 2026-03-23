import React from "react"
import {
  RiBankCardLine,
  RiBillLine,
  RiBus2Line,
  RiCarLine,
  RiCoinsLine,
  RiDownloadCloud2Line,
  RiExchangeDollarLine,
  RiFileList3Line,
  RiFlightTakeoffLine,
  RiGamepadLine,
  RiGiftLine,
  RiGraduationCapLine,
  RiHeadphoneLine,
  RiHomeGearLine,
  RiHotelBedLine,
  RiLightbulbFlashLine,
  RiMoneyRupeeCircleLine,
  RiMovie2Line,
  RiQuestionLine,
  RiReceiptLine,
  RiRefund2Line,
  RiRefreshLine,
  RiRepeatLine,
  RiRestaurant2Line,
  RiShoppingBag4Line,
  RiSmartphoneLine,
  RiStethoscopeLine,
  RiTrainLine,
  RiWallet3Line,
  RiWifiLine,
  type RemixiconComponentType,
} from "@remixicon/react"
import {
  DEFAULT_CATEGORY_COLOR_TOKEN,
  DEFAULT_CATEGORY_ICON_NAME,
  type CategoryColorToken,
  type CategoryIconName,
} from "@workspace/config/category-presentation"

const CATEGORY_ICON_REGISTRY: Record<CategoryIconName, RemixiconComponentType> =
  {
    "wallet-3-line": RiWallet3Line,
    "shopping-bag-4-line": RiShoppingBag4Line,
    "restaurant-2-line": RiRestaurant2Line,
    "car-line": RiCarLine,
    "bus-2-line": RiBus2Line,
    "train-line": RiTrainLine,
    "flight-takeoff-line": RiFlightTakeoffLine,
    "hotel-bed-line": RiHotelBedLine,
    "home-gear-line": RiHomeGearLine,
    "lightbulb-flash-line": RiLightbulbFlashLine,
    "wifi-line": RiWifiLine,
    "smartphone-line": RiSmartphoneLine,
    "download-cloud-2-line": RiDownloadCloud2Line,
    "bank-card-line": RiBankCardLine,
    "bill-line": RiBillLine,
    "receipt-line": RiReceiptLine,
    "file-list-3-line": RiFileList3Line,
    "repeat-line": RiRepeatLine,
    "refresh-line": RiRefreshLine,
    "coins-line": RiCoinsLine,
    "money-rupee-circle-line": RiMoneyRupeeCircleLine,
    "exchange-dollar-line": RiExchangeDollarLine,
    "refund-2-line": RiRefund2Line,
    "gamepad-line": RiGamepadLine,
    "movie-2-line": RiMovie2Line,
    "headphone-line": RiHeadphoneLine,
    "gift-line": RiGiftLine,
    "graduation-cap-line": RiGraduationCapLine,
    "stethoscope-line": RiStethoscopeLine,
    "question-line": RiQuestionLine,
  }

const CATEGORY_BADGE_TONE_CLASSNAMES: Record<CategoryColorToken, string> = {
  graphite:
    "text-[#c7d2ff] drop-shadow-[0_0_12px_rgba(126,157,255,0.48)]",
  cream:
    "text-[#fff1a8] drop-shadow-[0_0_14px_rgba(255,241,168,0.58)]",
  yellow:
    "text-[#ffe94d] drop-shadow-[0_0_16px_rgba(255,233,77,0.72)]",
  green:
    "text-[#4dffb8] drop-shadow-[0_0_16px_rgba(77,255,184,0.66)]",
  violet:
    "text-[#9c6bff] drop-shadow-[0_0_16px_rgba(156,107,255,0.68)]",
  blue:
    "text-[#53b7ff] drop-shadow-[0_0_16px_rgba(83,183,255,0.68)]",
  coral:
    "text-[#ff7a5c] drop-shadow-[0_0_16px_rgba(255,122,92,0.68)]",
}

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ")
}

export function resolveCategoryBadgeToneClassName(
  colorToken: CategoryColorToken | null | undefined
) {
  return CATEGORY_BADGE_TONE_CLASSNAMES[
    colorToken ?? DEFAULT_CATEGORY_COLOR_TOKEN
  ]
}

export function resolveCategoryIconComponent(
  iconName: CategoryIconName | null | undefined
) {
  return (
    CATEGORY_ICON_REGISTRY[iconName ?? DEFAULT_CATEGORY_ICON_NAME] ??
    RiQuestionLine
  )
}

export function CategoryBadge({
  categoryName,
  iconName,
  colorToken,
  className,
}: {
  categoryName: string
  iconName: CategoryIconName | null | undefined
  colorToken: CategoryColorToken | null | undefined
  className?: string
}) {
  const Icon = resolveCategoryIconComponent(iconName)

  return (
    <span
      aria-label={`${categoryName} category`}
      className={cn(
        "inline-flex size-3.5 shrink-0 items-center justify-center",
        resolveCategoryBadgeToneClassName(colorToken),
        className
      )}
    >
      <Icon className="size-5" />
    </span>
  )
}
