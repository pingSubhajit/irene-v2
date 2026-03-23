import { randomUUID } from "node:crypto"

import { getRuntimeEnv } from "@workspace/config/server"

const levelWeights = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} as const

export type LogLevel = keyof typeof levelWeights
export type LogContext = Record<string, unknown>

export function createCorrelationId() {
  return randomUUID()
}

function shouldLog(level: LogLevel) {
  const configuredLevel = getRuntimeEnv().LOG_LEVEL as LogLevel

  return levelWeights[level] >= levelWeights[configuredLevel]
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return error
}

function writeLog(level: LogLevel, scope: string, message: string, context?: LogContext) {
  if (!shouldLog(level)) {
    return
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    ...(context ? { context } : {}),
  }

  const line = JSON.stringify(payload)

  if (level === "error") {
    console.error(line)
    return
  }

  if (level === "warn") {
    console.warn(line)
    return
  }

  console.log(line)
}

export function createLogger(scope: string, baseContext: LogContext = {}) {
  return {
    child(childContext: LogContext) {
      return createLogger(scope, {
        ...baseContext,
        ...childContext,
      })
    },
    debug(message: string, context?: LogContext) {
      writeLog("debug", scope, message, {
        ...baseContext,
        ...context,
      })
    },
    info(message: string, context?: LogContext) {
      writeLog("info", scope, message, {
        ...baseContext,
        ...context,
      })
    },
    warn(message: string, context?: LogContext) {
      writeLog("warn", scope, message, {
        ...baseContext,
        ...context,
      })
    },
    warnWithCause(message: string, error: unknown, context?: LogContext) {
      writeLog("warn", scope, message, {
        ...baseContext,
        ...context,
        error: serializeError(error),
      })
    },
    error(message: string, context?: LogContext) {
      writeLog("error", scope, message, {
        ...baseContext,
        ...context,
      })
    },
    errorWithCause(message: string, error: unknown, context?: LogContext) {
      writeLog("error", scope, message, {
        ...baseContext,
        ...context,
        error: serializeError(error),
      })
    },
  }
}
