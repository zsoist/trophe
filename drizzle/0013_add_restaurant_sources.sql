-- Migration 0013: Add restaurant/chain food sources
-- Enables MenuStat (US fast food) and Colombian chain data

ALTER TYPE "food_source" ADD VALUE IF NOT EXISTS 'menustat';
ALTER TYPE "food_source" ADD VALUE IF NOT EXISTS 'chain_co';
