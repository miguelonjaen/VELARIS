-- ==========================================================
-- VELARIS DATABASE SCHEMA
-- Migration 001
-- ==========================================================

create extension if not exists "pgcrypto";

-- ==========================================================
-- ENUMS
-- ==========================================================

create type user_role as enum (
  'admin',
  'almirante',
  'capitan'
);

create type plan_nivel as enum (
  'gratis',
  'plata',
  'oro'
);

create type plan_tactico as enum (
  'basico',
  'capitan',
  'almirante'
);

create type maintenance_status as enum (
  'ok',
  'warning',
  'danger'
);

create type inventory_category as enum (
  'Técnico',
  'Seguridad',
  'Botiquín',
  'Víveres',
  'General'
);