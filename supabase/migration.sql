-- ============================================================================
-- Resonate Environmental Noise Screening Tool — Supabase migration
-- ============================================================================
-- Paste this whole file into Supabase Studio → SQL Editor → Run.
-- It is idempotent: running it twice is safe (every CREATE/ALTER is guarded).
--
-- What this does:
--   1. Extends reference_noise_sources with source_kind / height_m / display_group.
--   2. Backfills existing 81 rows with source_kind='point' and display_group
--      hints based on their current category.
--   3. Creates the new reference_constructions table for Rw building elements.
--   4. Creates the app_admins table used by RLS to gate writes.
--   5. Enables RLS + policies (anon read, admin write) on all library tables.
--   6. Seeds the library entries that are currently hard-coded in index.html
--      but missing from Supabase:
--        • 34 Mechanical units point sources
--        • 2 Forklift (typical activity) point sources
--        • 1 Car wash (manual) point source
--        • 10 Line sources (Lw/m)
--        • 5 Area sources (Lw/m²)
--        • 13 Construction (Rw) rows
--   7. Fixes the "Gynmasium" typo in the existing DB row.
--
-- After running this, add your admin email:
--     INSERT INTO public.app_admins (email) VALUES ('you@resonate.com.au');
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Schema changes on reference_noise_sources
-- ---------------------------------------------------------------------------
ALTER TABLE public.reference_noise_sources
  ADD COLUMN IF NOT EXISTS source_kind   text,
  ADD COLUMN IF NOT EXISTS height_m      numeric,
  ADD COLUMN IF NOT EXISTS display_group text;

UPDATE public.reference_noise_sources
   SET source_kind = 'point'
 WHERE source_kind IS NULL;

ALTER TABLE public.reference_noise_sources
  ALTER COLUMN source_kind SET NOT NULL;

-- Drop and recreate the source_kind CHECK constraint to allow 'building'
-- (older deployments may have it without 'building'; the IF EXISTS makes
-- the recreate safe on fresh installs too).
ALTER TABLE public.reference_noise_sources
  DROP CONSTRAINT IF EXISTS reference_noise_sources_source_kind_check;
DO $$ BEGIN
  ALTER TABLE public.reference_noise_sources
    ADD CONSTRAINT reference_noise_sources_source_kind_check
    CHECK (source_kind IN ('point','line','area','building'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.reference_noise_sources
    ADD CONSTRAINT reference_noise_sources_name_kind_key
    UNIQUE (name, source_kind);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fix the existing "Gynmasium" typo (if present)
UPDATE public.reference_noise_sources
   SET name = 'Gymnasium - general sporting activity, overall reverberant level'
 WHERE name = 'Gynmasium - general sporting activity, overall reverberant level';

-- Best-effort display_group backfill for existing 81 point-source rows
UPDATE public.reference_noise_sources r
   SET display_group = 'Trucks'
 WHERE display_group IS NULL
   AND category_id = (SELECT id FROM public.reference_noise_source_categories WHERE name='traffic');

UPDATE public.reference_noise_sources r
   SET display_group = 'Industrial (forklifts / warehouse)'
 WHERE display_group IS NULL
   AND category_id = (SELECT id FROM public.reference_noise_source_categories WHERE name='industrial');

UPDATE public.reference_noise_sources r
   SET display_group = 'Patrons'
 WHERE display_group IS NULL
   AND category_id = (SELECT id FROM public.reference_noise_source_categories WHERE name='human-voice');

UPDATE public.reference_noise_sources r
   SET display_group = 'Dog wash'
 WHERE display_group IS NULL
   AND category_id = (SELECT id FROM public.reference_noise_source_categories WHERE name='animal');

UPDATE public.reference_noise_sources r
   SET display_group = 'Fast food outlets'
 WHERE display_group IS NULL
   AND category_id = (SELECT id FROM public.reference_noise_source_categories WHERE name='car-park');

UPDATE public.reference_noise_sources r
   SET display_group = 'Music'
 WHERE display_group IS NULL
   AND category_id = (SELECT id FROM public.reference_noise_source_categories WHERE name='entertainment')
   AND name ILIKE '%music%';

UPDATE public.reference_noise_sources r
   SET display_group = 'Gymnasium'
 WHERE display_group IS NULL
   AND category_id = (SELECT id FROM public.reference_noise_source_categories WHERE name='entertainment')
   AND name ILIKE '%ymnasium%';

UPDATE public.reference_noise_sources r
   SET display_group = 'Patrons'
 WHERE display_group IS NULL
   AND category_id = (SELECT id FROM public.reference_noise_source_categories WHERE name='entertainment');

-- Carve out Childcare + Gymnasium from the human-voice / entertainment buckets
-- so they show as their own groups in the point-source dropdown (matching the
-- pre-migration hard-coded library structure). These overwrite any prior
-- display_group set by the backfill above.
UPDATE public.reference_noise_sources
   SET display_group = 'Childcare'
 WHERE name ILIKE 'Children per 10%';

UPDATE public.reference_noise_sources
   SET display_group = 'Gymnasium'
 WHERE name ILIKE '%ymnasium%';

-- ---------------------------------------------------------------------------
-- 2. New categories (only if missing)
-- ---------------------------------------------------------------------------
INSERT INTO public.reference_noise_source_categories (name, notes) VALUES
  ('mechanical',   'HVAC fans, chillers, condensers, cooling towers, generators, firepumps'),
  ('construction', 'Construction activities, loading/unloading, heavy equipment')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. New table: reference_constructions (Rw building elements)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reference_constructions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN ('walls','roof','openings')),
  name       text NOT NULL,
  rw         numeric NOT NULL,
  octave_r   jsonb NOT NULL,   -- {"63":n,"125":n,"250":n,"500":n,"1000":n,"2000":n,"4000":n,"8000":n}
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, name)
);

-- ---------------------------------------------------------------------------
-- 4. New table: app_admins (email allowlist for write access)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_admins (
  email      text PRIMARY KEY,
  notes      text,
  added_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5. updated_at trigger on reference_constructions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resonate_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN new.updated_at := now(); RETURN new; END $$;

DO $$ BEGIN
  CREATE TRIGGER reference_constructions_touch_updated_at
    BEFORE UPDATE ON public.reference_constructions
    FOR EACH ROW EXECUTE FUNCTION public.resonate_touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Row-level security
-- ---------------------------------------------------------------------------
ALTER TABLE public.reference_noise_sources            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reference_noise_source_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reference_constructions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_admins                         ENABLE ROW LEVEL SECURITY;

-- Public read policies (anon can SELECT)
DO $$ BEGIN
  CREATE POLICY "resonate_rns_anon_read" ON public.reference_noise_sources
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "resonate_rnsc_anon_read" ON public.reference_noise_source_categories
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "resonate_rc_anon_read" ON public.reference_constructions
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Admin write policies (authenticated user whose JWT email is in app_admins)
DO $$ BEGIN
  CREATE POLICY "resonate_rns_admin_write" ON public.reference_noise_sources
    FOR ALL
    USING     (EXISTS (SELECT 1 FROM public.app_admins a WHERE a.email = auth.jwt() ->> 'email'))
    WITH CHECK(EXISTS (SELECT 1 FROM public.app_admins a WHERE a.email = auth.jwt() ->> 'email'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "resonate_rnsc_admin_write" ON public.reference_noise_source_categories
    FOR ALL
    USING     (EXISTS (SELECT 1 FROM public.app_admins a WHERE a.email = auth.jwt() ->> 'email'))
    WITH CHECK(EXISTS (SELECT 1 FROM public.app_admins a WHERE a.email = auth.jwt() ->> 'email'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "resonate_rc_admin_write" ON public.reference_constructions
    FOR ALL
    USING     (EXISTS (SELECT 1 FROM public.app_admins a WHERE a.email = auth.jwt() ->> 'email'))
    WITH CHECK(EXISTS (SELECT 1 FROM public.app_admins a WHERE a.email = auth.jwt() ->> 'email'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- app_admins itself: only admins can see and modify the allowlist.
DO $$ BEGIN
  CREATE POLICY "resonate_admins_self_all" ON public.app_admins
    FOR ALL
    USING     (EXISTS (SELECT 1 FROM public.app_admins a WHERE a.email = auth.jwt() ->> 'email'))
    WITH CHECK(EXISTS (SELECT 1 FROM public.app_admins a WHERE a.email = auth.jwt() ->> 'email'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 7. Seed: Mechanical units (34 point sources) + forklifts (2) + car wash (1)
--    All inserted into reference_noise_sources as source_kind='point'.
--    Name-kind uniqueness guarantees idempotency.
-- ---------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM public.reference_noise_source_categories WHERE name='mechanical'
)
INSERT INTO public.reference_noise_sources
  (name, category_id, data_type, level_descriptor, per_unit, height_m,
   hz_63, hz_125, hz_250, hz_500, hz_1000, hz_2000, hz_4000, hz_8000,
   review_status, source_description, import_source, source_kind, display_group)
SELECT v.name, (SELECT id FROM cat), 'sound-power', NULL, NULL, v.h,
       v.h63, v.h125, v.h250, v.h500, v.h1000, v.h2000, v.h4000, v.h8000,
       'reviewed', 'Resonate in-app hard-coded library (pre-Supabase)', 'resonate-app', 'point', 'Mechanical units'
FROM (VALUES
  ('Small exhaust fan (toilet, garbage room)—Lw 60 dB(A)',                                                              1.00, 37::numeric, 43, 48, 53, 56, 54, 51, 43),
  ('Small kitchen exhaust fan—Lw 70 dB(A)',                                                                             1.00, 47::numeric, 53, 58, 63, 66, 64, 61, 53),
  ('Carpark exhaust fan—outlet—Lw 85 dB(A)',                                                                            1.00, 64::numeric, 72, 77, 79, 79, 78, 74, 66),
  ('Large General exhaust fan—Lw 94 dB(A)',                                                                             1.00, 67::numeric, 76, 83, 85, 88, 90, 84, NULL),
  ('Smoke Spill Fans—outlet—Lw 95 dB(A)',                                                                               1.00, 72::numeric, 77, 86, 88, 90, 90, 85, 79),
  ('Large Dust Extractor—Lw 97 dB(A)',                                                                                  1.00, 65::numeric, 80, 87, 92, 92, 88, 80, 72),
  ('Medium Dust Extractor—Lw 91 dB(A)',                                                                                 1.00, 59::numeric, 74, 81, 86, 86, 82, 74, 66),
  ('Condenser—small single fan outdoor unit—Lw 65 dB(A)',                                                               1.00, 42::numeric, 54, 59, 61, 60, 54, 52, NULL),
  ('Condenser—medium double fan outdoor unit—Lw 70 dB(A)',                                                              1.00, 47::numeric, 59, 64, 66, 65, 59, 57, NULL),
  ('Condenser—large double fan outdoor unit—Lw 76 dB(A)',                                                               1.00, 52::numeric, 64, 69, 71, 70, 64, 62, NULL),
  ('Air Conditioning Condenser (High Fan Speed)—Supermarket—Lw 85 dB(A)',                                               1.00, NULL::numeric, 69, 73, 79, 80, 78, 71, NULL),
  ('Refrigeration Condenser (High Fan Speed)—Supermarket—Lw 88 dB(A)',                                                  1.00, NULL::numeric, 70, 77, 80, 84, 81, 75, NULL),
  ('Evaporative cooler—Braemar RPB600 Radiated—Lw 80 dB(A)',                                                            1.52, 54::numeric, 64, 69, 71, 74, 76, 72, 60),
  ('Evaporative cooler—Braemar RPB700 Radiated—Lw 78 dB(A)',                                                            1.52, 52::numeric, 62, 67, 69, 71, 74, 69, 57),
  ('Evaporative cooler—Braemar RPB900 Radiated—Lw 84 dB(A)',                                                            1.52, 56::numeric, 66, 70, 74, 78, 81, 77, 65),
  ('Evaporative cooler—Braemar RPB1000 Radiated—Lw 89 dB(A)',                                                           1.52, 62::numeric, 72, 77, 82, 85, 85, 80, 70),
  ('Evaporative cooler—Braemar RPB1200 Radiated—Lw 88 dB(A)',                                                           1.52, 63::numeric, 73, 77, 82, 84, 83, 79, 71),
  ('Evaporative cooler—Braemar RPB1300 Radiated—Lw 89 dB(A)',                                                           1.52, 64::numeric, 74, 78, 83, 85, 84, 80, 72),
  ('Evaporative cooler—Braemar RPB1400 Radiated—Lw 93 dB(A)',                                                           1.52, 67::numeric, 77, 81, 86, 88, 87, 83, 75),
  ('Evaporative cooler—Braemar RPB1500 Radiated—Lw 94 dB(A)',                                                           1.52, 69::numeric, 79, 83, 88, 89, 88, 85, 77),
  ('Evaporative cooler—Braemar RPB1800 Radiated—Lw 96 dB(A)',                                                           1.52, 71::numeric, 81, 85, 90, 91, 90, 88, 81),
  ('Carrier air cooled chillers (screw fixed speed)—30XBE 500 Standard—Lw 99 dB(A)',                                    2.30, NULL::numeric, 78, 84, 92, 96, 92, 87, NULL),
  ('Carrier air cooled chillers (screw fixed speed)—30XBE 500 Standard+Option15—Lw 95 dB(A)',                           2.30, NULL::numeric, 78, 83, 90, 91, 87, 81, NULL),
  ('Carrier air cooled chillers (screw fixed speed)—30XBE 500 Standard+Option15LS—Lw 91 dB(A)',                         2.30, NULL::numeric, 74, 84, 85, 87, 82, 70, NULL),
  ('Carrier air cooled chillers (screw fixed speed)—30XBE 500 Standard+Option15LS+—Lw 89 dB(A)',                        2.30, NULL::numeric, 71, 83, 82, 85, 78, 68, NULL),
  ('Carrier air cooled chillers (screw fixed speed)—30XBE 350 Standard—Lw 99 dB(A)',                                    2.30, NULL::numeric, 79, 85, 89, 98, 87, 81, NULL),
  ('Carrier air cooled chillers (screw fixed speed)—30XBE 350 Standard+Option15—Lw 94 dB(A)',                           2.30, NULL::numeric, 78, 84, 88, 91, 84, 79, NULL),
  ('Carrier air cooled chillers (screw fixed speed)—30XBE 350 Standard+Option15LS—Lw 87 dB(A)',                         2.30, NULL::numeric, 69, 80, 80, 84, 77, 66, NULL),
  ('Daikin air cooled single screw chiller / heat pump—Lw 102 dB(A)',                                                   2.30, 64::numeric, 78, 87, 94, 99, 97, 93, 88),
  ('Cooling Tower (single unit, 5.5kW, 2.28x2.28x3.25mm)—Lw 87 dB(A)',                                                  1.00, 58::numeric, 62, 72, 79, 80, 82, 81, 78),
  ('Enclosed Generator Set 220kVA—Cummins C220 D5e 50 Hz (enclosed with genset mounted muffler)—@75% load—Lw 96 dB(A)', 1.00, 77::numeric, 83, 91, 88, 88, 88, 86, 78),
  ('Enclosed Generator Set 220kVA—Cummins C220 D5e 50 Hz (enclosed with genset mounted muffler)—@100% load—Lw 97 dB(A)',1.00, 79::numeric, 85, 92, 89, 89, 89, 87, 78),
  ('Enclosed Generator Set 220kVA—Cummins C220 D5e 50 Hz (enclosed with genset mounted muffler)—@110% load—Lw 97 dB(A)',1.00, 78::numeric, 85, 92, 89, 89, 89, 88, 81),
  ('Open Generator—Cummins C1100 D5 QST30-G4 50 Hz Diesel (100% Prime—engine, no exhaust no muffler)—Lw 117 dB(A)',     1.00, 82::numeric, 98,105,107,111,112,109,108),
  ('Open Generator—Cummins C1100 D5 QST30-G4 50 Hz Diesel (100% Prime—open exhaust)—Lw 126 dB(A)',                      1.00,108::numeric,115,112,119,117,119,121,113),
  ('Firepump PowerMaXX DP4400N 2400 RPM—Lw 112 dB(A)',                                                                  1.00, 87::numeric, 92,100,104,107,107,100, 88)
) AS v(name, h, h63, h125, h250, h500, h1000, h2000, h4000, h8000)
ON CONFLICT (name, source_kind) DO NOTHING;

-- Two additional forklift point sources (typical activity) not currently in DB
WITH cat AS (SELECT id FROM public.reference_noise_source_categories WHERE name='industrial')
INSERT INTO public.reference_noise_sources
  (name, category_id, data_type, level_descriptor, per_unit, height_m,
   hz_63, hz_125, hz_250, hz_500, hz_1000, hz_2000, hz_4000, hz_8000,
   review_status, source_description, import_source, source_kind, display_group)
SELECT v.name, (SELECT id FROM cat), 'sound-power', NULL, NULL, v.h,
       v.h63, v.h125, v.h250, v.h500, v.h1000, v.h2000, v.h4000, v.h8000,
       'reviewed', 'Resonate in-app hard-coded library (pre-Supabase)', 'resonate-app', 'point', 'Industrial (forklifts / warehouse)'
FROM (VALUES
  ('Gas forklift - typical activity',    1.50, 68::numeric, 76, 84, 84, 87, 85, 83, 72),
  ('Diesel forklift - typical activity', 1.50, 82::numeric, 86, 89, 93, 96, 93, 89, NULL)
) AS v(name, h, h63, h125, h250, h500, h1000, h2000, h4000, h8000)
ON CONFLICT (name, source_kind) DO NOTHING;

-- Car wash (manual) not in DB
WITH cat AS (SELECT id FROM public.reference_noise_source_categories WHERE name='industrial')
INSERT INTO public.reference_noise_sources
  (name, category_id, data_type, level_descriptor, per_unit, height_m,
   hz_63, hz_125, hz_250, hz_500, hz_1000, hz_2000, hz_4000, hz_8000,
   review_status, source_description, import_source, source_kind, display_group)
VALUES
  ('Car wash - manual', (SELECT id FROM cat), 'sound-power', NULL, NULL, 0.50,
   40, 61, 75, 82, 87, 92, 91, 88,
   'reviewed', 'Resonate in-app hard-coded library (pre-Supabase)', 'resonate-app', 'point', 'Car wash')
ON CONFLICT (name, source_kind) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. Seed: Line sources (10) — source_kind='line', per_unit='per m'
-- ---------------------------------------------------------------------------
INSERT INTO public.reference_noise_sources
  (name, category_id, data_type, level_descriptor, per_unit, height_m,
   hz_63, hz_125, hz_250, hz_500, hz_1000, hz_2000, hz_4000, hz_8000,
   review_status, source_description, import_source, source_kind, display_group)
SELECT v.name,
       (SELECT id FROM public.reference_noise_source_categories WHERE name = v.cat),
       'sound-power', NULL, 'per m', v.h,
       v.h63, v.h125, v.h250, v.h500, v.h1000, v.h2000, v.h4000, v.h8000,
       'reviewed', 'Resonate in-app hard-coded line-source library (pre-Supabase)', 'resonate-app',
       'line', v.dg
FROM (VALUES
  ('Small truck driving slowly',       'traffic',    'Trucks',          1.50, 66::numeric, 65, 62, 61, 61, 59, 52, 42),
  ('Small truck exhaust',              'traffic',    'Trucks',          3.60, 58::numeric, 57, 54, 53, 53, 51, 44, 34),
  ('Medium truck driving slowly',      'traffic',    'Trucks',          1.50, 69::numeric, 68, 65, 64, 64, 62, 55, 45),
  ('Medium truck exhaust',             'traffic',    'Trucks',          3.60, 61::numeric, 60, 57, 56, 56, 54, 47, 37),
  ('Large truck driving slowly',       'traffic',    'Trucks',          1.00, 72::numeric, 71, 68, 67, 67, 65, 58, 48),
  ('Large truck exhaust',              'traffic',    'Trucks',          3.60, 64::numeric, 63, 60, 59, 59, 57, 50, 40),
  ('Car driving slowly < 30 km/h',     'traffic',    'Light vehicles',  0.50, 55::numeric, 49, 45, 43, 43, 39, 35, 32),
  ('Electric forklift - driving',      'industrial', 'Industrial',      1.00, 46::numeric, 46, 46, 46, 46, 46, 46, 46),
  ('Gas forklift - driving',           'industrial', 'Industrial',      1.00, 70::numeric, 64, 60, 58, 58, 54, 50, 47),
  ('Diesel forklift - driving',        'industrial', 'Industrial',      1.00, 70::numeric, 64, 60, 58, 58, 54, 50, 47)
) AS v(name, cat, dg, h, h63, h125, h250, h500, h1000, h2000, h4000, h8000)
ON CONFLICT (name, source_kind) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9. Seed: Area sources (5) — source_kind='area', per_unit='per m²'
-- ---------------------------------------------------------------------------
INSERT INTO public.reference_noise_sources
  (name, category_id, data_type, level_descriptor, per_unit, height_m,
   hz_63, hz_125, hz_250, hz_500, hz_1000, hz_2000, hz_4000, hz_8000,
   review_status, source_description, import_source, source_kind, display_group)
SELECT v.name,
       (SELECT id FROM public.reference_noise_source_categories WHERE name = v.cat),
       'sound-power', NULL, 'per m²', v.h,
       v.h63, v.h125, v.h250, v.h500, v.h1000, v.h2000, v.h4000, v.h8000,
       'reviewed', 'Resonate in-app hard-coded area-source library (pre-Supabase)', 'resonate-app',
       'area', v.dg
FROM (VALUES
  ('Light vehicle movements',            'car-park',     'Car parks',              0.50, 55::numeric, 49, 45, 43, 43, 39, 35, 32),
  ('Car park with trolley collection',   'car-park',     'Car parks',              0.50, 58::numeric, 52, 48, 46, 46, 42, 38, 35),
  ('Restaurant/cafe outdoor area',       'entertainment','Outdoor dining',         1.20, 60::numeric, 57, 55, 53, 51, 48, 44, 40),
  ('General loading/unloading activity', 'industrial',   'Loading / Industrial',   1.50, 72::numeric, 68, 65, 63, 61, 58, 54, 50),
  ('General construction activity',      'construction', 'Construction',           2.00, 77::numeric, 73, 70, 68, 66, 63, 59, 55)
) AS v(name, cat, dg, h, h63, h125, h250, h500, h1000, h2000, h4000, h8000)
ON CONFLICT (name, source_kind) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10. Seed: Constructions (13 Rw entries)
-- ---------------------------------------------------------------------------
INSERT INTO public.reference_constructions (kind, name, rw, octave_r) VALUES
  ('walls',    'Colorbond steel (single skin)',      25, '{"63":12,"125":15,"250":18,"500":22,"1000":25,"2000":28,"4000":30,"8000":28}'),
  ('walls',    'Double skin insulated metal wall',   35, '{"63":18,"125":22,"250":28,"500":32,"1000":35,"2000":38,"4000":40,"8000":38}'),
  ('walls',    '200mm concrete block',               45, '{"63":30,"125":33,"250":38,"500":42,"1000":45,"2000":48,"4000":50,"8000":48}'),
  ('walls',    '150mm precast concrete',             42, '{"63":28,"125":30,"250":35,"500":40,"1000":42,"2000":45,"4000":47,"8000":45}'),
  ('walls',    'Lightweight timber frame',           30, '{"63":15,"125":18,"250":22,"500":28,"1000":30,"2000":33,"4000":35,"8000":33}'),
  ('roof',     'Metal deck (single skin)',           20, '{"63":10,"125":12,"250":15,"500":18,"1000":20,"2000":23,"4000":25,"8000":23}'),
  ('roof',     'Metal deck with insulation',         30, '{"63":16,"125":20,"250":24,"500":28,"1000":30,"2000":33,"4000":35,"8000":33}'),
  ('roof',     'Concrete slab roof',                 45, '{"63":30,"125":33,"250":38,"500":42,"1000":45,"2000":48,"4000":50,"8000":48}'),
  ('openings', 'Roller door (steel)',                15, '{"63":8,"125":10,"250":12,"500":14,"1000":15,"2000":18,"4000":20,"8000":18}'),
  ('openings', 'Louvre (open)',                       5, '{"63":3,"125":4,"250":5,"500":5,"1000":5,"2000":5,"4000":5,"8000":5}'),
  ('openings', 'Louvre (with attenuator)',           15, '{"63":8,"125":10,"250":12,"500":14,"1000":15,"2000":18,"4000":20,"8000":18}'),
  ('openings', 'Single glazed window (6mm)',         28, '{"63":15,"125":18,"250":22,"500":26,"1000":28,"2000":30,"4000":32,"8000":28}'),
  ('openings', 'Open door/window',                    0, '{"63":0,"125":0,"250":0,"500":0,"1000":0,"2000":0,"4000":0,"8000":0}')
ON CONFLICT (kind, name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 11. Seed: Building interior Lp presets (12) — source_kind='building'.
--     These store interior sound pressure level (Lp) spectra inside the
--     building. The app converts Lp → radiated Lw via the wall/roof Rw.
--     Reuses the existing reference_noise_sources table; uniqueness on
--     (name, source_kind) makes this idempotent.
-- ---------------------------------------------------------------------------
INSERT INTO public.reference_noise_sources
  (name, category_id, data_type, level_descriptor, per_unit, height_m,
   hz_63, hz_125, hz_250, hz_500, hz_1000, hz_2000, hz_4000, hz_8000,
   review_status, source_description, import_source, source_kind, display_group)
SELECT v.name,
       (SELECT id FROM public.reference_noise_source_categories WHERE name = v.cat),
       'sound-pressure', NULL, NULL, NULL,
       v.h63, v.h125, v.h250, v.h500, v.h1000, v.h2000, v.h4000, v.h8000,
       'reviewed', 'Resonate in-app hard-coded building Lp library (pre-Supabase)', 'resonate-app',
       'building', v.dg
FROM (VALUES
  ('Gymnasium - general sporting activity', 'entertainment', 'Recreation',  72, 75, 78, 80, 82, 79, 74, 68),
  ('Gymnasium - amplified music event',     'entertainment', 'Recreation',  88, 90, 92, 93, 91, 88, 82, 75),
  ('Restaurant / cafe - dining',            'entertainment', 'Hospitality', 58, 62, 66, 70, 72, 69, 63, 55),
  ('Bar / pub - live music',                'entertainment', 'Hospitality', 88, 90, 92, 93, 91, 88, 82, 75),
  ('Nightclub - amplified music',           'entertainment', 'Hospitality', 93, 95, 97, 98, 96, 93, 87, 80),
  ('Workshop - light manufacturing',        'industrial',    'Industrial',  77, 80, 83, 85, 87, 84, 78, 72),
  ('Workshop - heavy manufacturing',        'industrial',    'Industrial',  82, 85, 88, 90, 92, 89, 83, 77),
  ('Warehouse - forklift operations',       'industrial',    'Industrial',  72, 75, 78, 80, 82, 79, 73, 67),
  ('Childcare centre - indoor play',        'human-voice',   'Childcare',   60, 65, 70, 75, 77, 74, 68, 60),
  ('Church - amplified service',            'entertainment', 'Community',   78, 80, 82, 83, 81, 78, 72, 65),
  ('Office - open plan',                    'human-voice',   'Commercial',  50, 54, 57, 60, 62, 59, 53, 45),
  ('Supermarket - general',                 'human-voice',   'Commercial',  55, 59, 62, 65, 67, 64, 58, 50)
) AS v(name, cat, dg, h63, h125, h250, h500, h1000, h2000, h4000, h8000)
ON CONFLICT (name, source_kind) DO NOTHING;

-- ---------------------------------------------------------------------------
-- DONE.
--
-- Next steps:
--   1. Run `SELECT count(*) FROM public.reference_noise_sources;` — should be ≥ 130
--   2. Run `SELECT count(*) FROM public.reference_constructions;` — should be 13
--   3. Run `SELECT count(*) FROM public.reference_noise_sources WHERE source_kind='building';`
--      — should be ≥ 12
--   4. Insert your admin email:
--        INSERT INTO public.app_admins (email) VALUES ('you@resonate.com.au');
-- ---------------------------------------------------------------------------
