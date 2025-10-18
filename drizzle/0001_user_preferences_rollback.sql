-- Rollback migration for user_preferences table (0001_user_preferences.sql)
-- This migration drops the user_preferences table and all associated data
-- WARNING: This will permanently delete all user preference data

-- Drop the user_preferences table
-- The CASCADE option is not needed because no other tables depend on user_preferences
DROP TABLE IF EXISTS "user_preferences";
