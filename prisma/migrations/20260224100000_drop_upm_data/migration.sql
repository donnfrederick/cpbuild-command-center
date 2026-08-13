-- Drop legacy upmData column from Project (data now stored in project_rows table)
ALTER TABLE "Project" DROP COLUMN IF EXISTS "upmData";
