CREATE TYPE "public"."card_column" AS ENUM('went_well', 'to_improve', 'action_item');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('participant', 'admin');--> statement-breakpoint
CREATE TYPE "public"."persona_kind" AS ENUM('named', 'anonymous');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('writing', 'voting', 'closed');--> statement-breakpoint
CREATE TYPE "public"."vote_kind" AS ENUM('like', 'dislike');--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"author_participant_id" uuid NOT NULL,
	"column" "card_column" NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"rich_text" jsonb,
	"pushed_to_clickup_at" timestamp with time zone,
	"clickup_task_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"author_participant_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"persona_kind" "persona_kind" NOT NULL,
	"persona_slug" text,
	"anonymous_number" integer,
	"role" "participant_role" DEFAULT 'participant' NOT NULL,
	"is_done_writing" boolean DEFAULT false NOT NULL,
	"is_done_voting" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persona_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"persona_slug" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"status" "session_status" DEFAULT 'writing' NOT NULL,
	"admin_client_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"voter_participant_id" uuid NOT NULL,
	"kind" "vote_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_author_participant_id_participants_id_fk" FOREIGN KEY ("author_participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_participant_id_participants_id_fk" FOREIGN KEY ("author_participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_reservations" ADD CONSTRAINT "persona_reservations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_reservations" ADD CONSTRAINT "persona_reservations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_client_id_clients_id_fk" FOREIGN KEY ("admin_client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_voter_participant_id_participants_id_fk" FOREIGN KEY ("voter_participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cards_session_idx" ON "cards" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "comments_card_idx" ON "comments" USING btree ("card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_session_client_uq" ON "participants" USING btree ("session_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_session_persona_uq" ON "participants" USING btree ("session_id","persona_slug") WHERE "participants"."persona_slug" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "participants_session_anon_uq" ON "participants" USING btree ("session_id","anonymous_number") WHERE "participants"."anonymous_number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_session_persona_uq" ON "persona_reservations" USING btree ("session_id","persona_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_session_client_uq" ON "persona_reservations" USING btree ("session_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_card_voter_uq" ON "votes" USING btree ("card_id","voter_participant_id");