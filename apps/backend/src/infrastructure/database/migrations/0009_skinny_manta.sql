ALTER TABLE "users" ADD COLUMN "username" varchar(30);--> statement-breakpoint
UPDATE "users" SET "username" = 'user_' || left(replace("id"::text, '-', ''), 24);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");
