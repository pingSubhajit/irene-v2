"use client"

import { useMemo, useState } from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"

type ProfileAvatarProps = {
  name: string
  image?: string | null
  className?: string
}

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.slice(0, 1))
      .join("") || "I"
  )
}

export function ProfileAvatar({
  name,
  image,
  className,
}: ProfileAvatarProps) {
  const [hasImageError, setHasImageError] = useState(false)
  const [hasImageLoaded, setHasImageLoaded] = useState(false)
  const initials = useMemo(() => getInitials(name), [name])
  const showImage = Boolean(image) && !hasImageError

  return (
    <Avatar className={className}>
      <AvatarFallback className={showImage && hasImageLoaded ? "opacity-0" : undefined}>
        {initials}
      </AvatarFallback>
      {showImage ? (
        <AvatarImage
          src={image ?? undefined}
          alt={name}
          referrerPolicy="no-referrer"
          className={[
            "absolute inset-0 duration-150"
          ].join(" ")}
          onLoad={() => setHasImageLoaded(true)}
          onError={() => {
            setHasImageError(true)
            setHasImageLoaded(false)
          }}
        />
      ) : null}
    </Avatar>
  )
}
