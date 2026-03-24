# `@workspace/assets`

Shared static assets for monorepo apps.

## Images

Place reusable image files under `images/`.

Example import from Next.js:

```tsx
import Image from "next/image"
import heroImage from "@workspace/assets/images/hero.png"

export function Hero() {
  return <Image src={heroImage} alt="Hero" priority />
}
```

## Web-only assets

Assets that must be served by URL, such as `favicon.ico` or `robots.txt`, should
stay in the web app's `public/` directory.
