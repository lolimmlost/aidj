CREATE TABLE "navidrome_users" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"navidrome_username" text NOT NULL,
	"navidrome_password" text NOT NULL,
	"navidrome_salt" text NOT NULL,
	"navidrome_token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "navidrome_users_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "navidrome_users_navidrome_username_unique" UNIQUE("navidrome_username")
);
--> statement-breakpoint
ALTER TABLE "navidrome_users" ADD CONSTRAINT "navidrome_users_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;