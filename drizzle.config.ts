import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Uses DATABASE_URL from the environment (with a local fallback for development).
// For production deploys, set DATABASE_URL to your hosted Postgres connection
// string, then run:  npx drizzle-kit push
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});
