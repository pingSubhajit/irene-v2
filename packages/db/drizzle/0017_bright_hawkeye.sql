ALTER TABLE "category" ADD COLUMN "icon_name" text;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "color_token" text;--> statement-breakpoint

UPDATE "category"
SET
  "icon_name" = CASE "slug"
    WHEN 'income' THEN 'money-rupee-circle-line'
    WHEN 'salary' THEN 'wallet-3-line'
    WHEN 'shopping' THEN 'shopping-bag-4-line'
    WHEN 'food' THEN 'restaurant-2-line'
    WHEN 'transport' THEN 'car-line'
    WHEN 'subscriptions' THEN 'repeat-line'
    WHEN 'bills' THEN 'bill-line'
    WHEN 'gaming' THEN 'gamepad-line'
    WHEN 'software' THEN 'file-list-3-line'
    WHEN 'digital_goods' THEN 'download-cloud-2-line'
    WHEN 'entertainment' THEN 'movie-2-line'
    WHEN 'travel' THEN 'flight-takeoff-line'
    WHEN 'utilities' THEN 'lightbulb-flash-line'
    WHEN 'debt' THEN 'bank-card-line'
    WHEN 'transfers' THEN 'exchange-dollar-line'
    WHEN 'refunds' THEN 'refund-2-line'
    WHEN 'uncategorized' THEN 'question-line'
    ELSE 'question-line'
  END,
  "color_token" = CASE "slug"
    WHEN 'income' THEN 'green'
    WHEN 'salary' THEN 'green'
    WHEN 'shopping' THEN 'blue'
    WHEN 'food' THEN 'coral'
    WHEN 'transport' THEN 'blue'
    WHEN 'subscriptions' THEN 'violet'
    WHEN 'bills' THEN 'yellow'
    WHEN 'gaming' THEN 'violet'
    WHEN 'software' THEN 'blue'
    WHEN 'digital_goods' THEN 'blue'
    WHEN 'entertainment' THEN 'coral'
    WHEN 'travel' THEN 'blue'
    WHEN 'utilities' THEN 'yellow'
    WHEN 'debt' THEN 'coral'
    WHEN 'transfers' THEN 'blue'
    WHEN 'refunds' THEN 'green'
    WHEN 'uncategorized' THEN 'graphite'
    ELSE 'graphite'
  END,
  "is_system" = CASE
    WHEN "slug" IN (
      'income',
      'salary',
      'shopping',
      'food',
      'transport',
      'subscriptions',
      'bills',
      'gaming',
      'software',
      'digital_goods',
      'entertainment',
      'travel',
      'utilities',
      'debt',
      'transfers',
      'refunds',
      'uncategorized'
    ) THEN true
    ELSE "is_system"
  END;--> statement-breakpoint

ALTER TABLE "category" ALTER COLUMN "icon_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "category" ALTER COLUMN "color_token" SET NOT NULL;
