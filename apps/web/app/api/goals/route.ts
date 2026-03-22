import { NextResponse } from "next/server"
import { z } from "zod"

import {
  createFinancialGoal,
  getFinancialGoalById,
  updateFinancialGoal,
} from "@workspace/db"

import { triggerUserAdviceRefresh } from "@/lib/advice"
import { requireSession } from "@/lib/session"

const createGoalSchema = z.object({
  action: z.literal("create"),
  goalType: z.enum([
    "emergency_fund",
    "target_purchase",
    "travel",
    "debt_payoff",
    "custom",
  ]),
  name: z.string().min(2).max(120),
  targetAmountMinor: z.number().int().positive(),
  startingAmountMinor: z.number().int().min(0).default(0),
  currency: z.string().length(3),
  targetDate: z.string().date(),
  linkedCategoryId: z.string().uuid().optional(),
  notes: z.string().max(600).optional(),
  redirectTo: z.string().min(1).optional(),
})

const updateGoalSchema = z.object({
  action: z.enum(["update", "archive", "complete"]),
  goalId: z.string().uuid(),
  goalType: z
    .enum(["emergency_fund", "target_purchase", "travel", "debt_payoff", "custom"])
    .optional(),
  name: z.string().min(2).max(120).optional(),
  targetAmountMinor: z.number().int().positive().optional(),
  startingAmountMinor: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  targetDate: z.string().date().optional(),
  linkedCategoryId: z.string().uuid().optional().nullable(),
  notes: z.string().max(600).optional().nullable(),
  redirectTo: z.string().min(1).optional(),
})

function toMinorUnits(value: FormDataEntryValue | null) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return null
  }

  return Math.round(numeric * 100)
}

function redirectTo(path: string, status: string) {
  const url = new URL(path, "http://localhost")
  url.searchParams.set("goals", status)
  return NextResponse.redirect(url)
}

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const action = formData.get("action")

  if (action === "create") {
    const parsed = createGoalSchema.parse({
      action,
      goalType: formData.get("goalType"),
      name: formData.get("name"),
      targetAmountMinor: toMinorUnits(formData.get("targetAmount")),
      startingAmountMinor: toMinorUnits(formData.get("startingAmount")) ?? 0,
      currency: (formData.get("currency") ?? "INR").toString().toUpperCase(),
      targetDate: formData.get("targetDate"),
      linkedCategoryId: formData.get("linkedCategoryId") || undefined,
      notes: formData.get("notes") || undefined,
      redirectTo: formData.get("redirectTo") || undefined,
    })

    const goal = await createFinancialGoal({
      userId: session.user.id,
      goalType: parsed.goalType,
      status: "active",
      name: parsed.name,
      targetAmountMinor: parsed.targetAmountMinor,
      startingAmountMinor: parsed.startingAmountMinor,
      currency: parsed.currency,
      targetDate: parsed.targetDate,
      linkedCategoryId: parsed.linkedCategoryId ?? null,
      contributionRuleJson: parsed.linkedCategoryId
        ? { linkedCategoryId: parsed.linkedCategoryId }
        : {},
      notes: parsed.notes ?? null,
    })

    await triggerUserAdviceRefresh({
      userId: session.user.id,
      reason: "goals_changed",
    })

    return redirectTo(parsed.redirectTo ?? `/goals/${goal.id}`, "created")
  }

  const parsed = updateGoalSchema.parse({
    action,
    goalId: formData.get("goalId"),
    goalType: formData.get("goalType") || undefined,
    name: formData.get("name") || undefined,
    targetAmountMinor: toMinorUnits(formData.get("targetAmount")) ?? undefined,
    startingAmountMinor: toMinorUnits(formData.get("startingAmount")) ?? undefined,
    currency:
      formData.get("currency")?.toString().toUpperCase() || undefined,
    targetDate: formData.get("targetDate") || undefined,
    linkedCategoryId:
      formData.get("linkedCategoryId") === ""
        ? null
        : (formData.get("linkedCategoryId") ?? undefined),
    notes:
      formData.get("notes") === ""
        ? null
        : (formData.get("notes") ?? undefined),
    redirectTo: formData.get("redirectTo") || undefined,
  })

  const existing = await getFinancialGoalById(parsed.goalId)
  if (!existing || existing.goal.userId !== session.user.id) {
    return redirectTo(parsed.redirectTo ?? "/goals", "missing")
  }

  if (parsed.action === "archive") {
    await updateFinancialGoal(parsed.goalId, {
      status: "archived",
      archivedAt: new Date(),
      completedAt: null,
    })
  } else if (parsed.action === "complete") {
    await updateFinancialGoal(parsed.goalId, {
      status: "completed",
      completedAt: new Date(),
      archivedAt: null,
    })
  } else {
    await updateFinancialGoal(parsed.goalId, {
      goalType: parsed.goalType,
      name: parsed.name,
      targetAmountMinor: parsed.targetAmountMinor,
      startingAmountMinor: parsed.startingAmountMinor,
      currency: parsed.currency,
      targetDate: parsed.targetDate,
      linkedCategoryId:
        parsed.linkedCategoryId === undefined
          ? undefined
          : parsed.linkedCategoryId,
      contributionRuleJson:
        parsed.linkedCategoryId === undefined
          ? undefined
          : parsed.linkedCategoryId
            ? { linkedCategoryId: parsed.linkedCategoryId }
            : {},
      notes: parsed.notes === undefined ? undefined : parsed.notes,
      status: "active",
      completedAt: null,
      archivedAt: null,
    })
  }

  await triggerUserAdviceRefresh({
    userId: session.user.id,
    reason: "goals_changed",
  })

  return redirectTo(parsed.redirectTo ?? `/goals/${parsed.goalId}`, parsed.action)
}
