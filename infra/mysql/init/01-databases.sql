-- One database per service (database-per-service pattern, single MySQL instance locally).
-- Boundaries are enforced in code: no service queries another service's schema.
CREATE DATABASE IF NOT EXISTS chowdeck_identity;
CREATE DATABASE IF NOT EXISTS chowdeck_catalog;
CREATE DATABASE IF NOT EXISTS chowdeck_order;
CREATE DATABASE IF NOT EXISTS chowdeck_dispatch;
CREATE DATABASE IF NOT EXISTS chowdeck_payments;
CREATE DATABASE IF NOT EXISTS chowdeck_ledger;
CREATE DATABASE IF NOT EXISTS chowdeck_settlement;
CREATE DATABASE IF NOT EXISTS chowdeck_promotions;
CREATE DATABASE IF NOT EXISTS chowdeck_ratings;
CREATE DATABASE IF NOT EXISTS chowdeck_notifications;
