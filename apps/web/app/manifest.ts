import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  const shortcutIcon = [
    {
      src: "/pwa-icons/shortcut-96.png",
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
        src: "/pwa-icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/pwa-icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/pwa-icons/icon-maskable-512.png",
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
