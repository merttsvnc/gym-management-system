-- First-time deployment: Reset database for clean baseline migration
-- WARNING: This DROPS all data. Use only for initial setup.
-- Run via: ./deploy.sh reset-db

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO gym_api;
GRANT ALL ON SCHEMA public TO public;
