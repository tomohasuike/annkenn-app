ALTER TABLE "public"."assignments"
ADD COLUMN "assigned_by" uuid REFERENCES "public"."worker_master"("id") ON DELETE SET NULL;
