# Additional Schema Files Needed

Based on the architecture document, we need to create additional schema files for the music application:

## music.schema.ts

This file should contain the Drizzle ORM schema definitions for:

1. **user_preferences** table:
   - id: text (primary key)
   - user_id: text (foreign key to users table)
   - recommendation_settings: text (JSON)
   - playback_settings: text (JSON)
   - download_settings: text (JSON)

2. **download_requests** table:
   - id: text (primary key)
   - user_id: text (foreign key to users table)
   - title: text
   - artist: text
   - status: text (enum: requested, downloading, completed, failed)
   - requested_at: timestamp
   - completed_at: timestamp (nullable)

The schema/index.ts file should also be updated to export these new schemas:

```typescript
export * from "./auth.schema";
export * from "./music.schema";