"use client"

import { useRef } from "react"

import { RiArrowRightSLine } from "@remixicon/react"

import { getTimeZoneOptions } from "@/lib/time-zone-options"

type TimeZoneRowProps = {
  currentTimeZone: string
}

export function TimeZoneRow({ currentTimeZone }: TimeZoneRowProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const timeZones = getTimeZoneOptions(currentTimeZone)

  return (
    <form
      ref={formRef}
      action="/api/settings/time-zone"
      method="post"
      className="flex items-center justify-between py-4"
    >
      <span className="text-[15px] text-white">time zone</span>
      <div className="flex items-center gap-1">
        <select
          name="timeZone"
          defaultValue={currentTimeZone}
          onChange={() => formRef.current?.submit()}
          className="max-w-[12rem] cursor-pointer appearance-none border-none bg-transparent text-right text-[15px] text-white/40 outline-none"
        >
          {timeZones.map((timeZone) => (
            <option key={timeZone} value={timeZone}>
              {timeZone}
            </option>
          ))}
        </select>
        <RiArrowRightSLine className="size-5 text-white/16" />
      </div>
    </form>
  )
}
