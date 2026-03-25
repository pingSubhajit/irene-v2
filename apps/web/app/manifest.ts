import type { MetadataRoute } from "next"

import {
  pwaIcon192Url,
  pwaIcon512Url,
  pwaIconMaskable512Url,
  pwaShortcut96Url,
} from "@/lib/pwa/icon-urls"

export default function manifest(): MetadataRoute.Manifest {
  const shortcutIcon = [
    {
      src: pwaShortcut96Url,
      sizes: "96x96",
      type: "image/png",
    },
  ]

  return {
    name: "Irene",
    short_name: "Irene",
    description: "Calm money clarity from your inbox.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0c0c0e",
    theme_color: "#0c0c0e",
    orientation: "portrait",
    icons: [
      {
        src: pwaIcon192Url,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: pwaIcon512Url,
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: pwaIconMaskable512Url,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        url: "/dashboard",
        icons: shortcutIcon,
      },
      {
        name: "Activity",
        short_name: "Activity",
        url: "/activity",
        icons: shortcutIcon,
      },
      {
        name: "Review",
        short_name: "Review",
        url: "/review",
        icons: shortcutIcon,
      },
      {
        name: "Goals",
        short_name: "Goals",
        url: "/goals",
        icons: shortcutIcon,
      },
      {
        name: "Settings",
        short_name: "Settings",
        url: "/settings",
        icons: shortcutIcon,
      },
    ],
  }
}
