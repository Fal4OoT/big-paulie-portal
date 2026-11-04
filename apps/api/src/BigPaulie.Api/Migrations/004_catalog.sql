-- Catalogue de véhicules importé depuis le panel légal du serveur (noms uniformes + gammes).

-- Plaque : réglage par type, qui prend le pas sur la catégorie (NULL = comme la catégorie).
ALTER TABLE vehicle_types ADD COLUMN requires_plate boolean NULL;

-- Nouveau type : vélo (terrestre, sans permis, sans plaque).
INSERT INTO vehicle_types (label, category_id, permit_field_key, sort_order, requires_plate)
SELECT 'Vélo', id, NULL, 25, false FROM vehicle_categories WHERE label = 'Terrestre'
  AND NOT EXISTS (SELECT 1 FROM vehicle_types WHERE label = 'Vélo');

-- Gammes du panel (identifiées par leur emoji) et type de véhicule correspondant.
CREATE TABLE catalog_segments (
    emoji            text PRIMARY KEY,
    label            text NOT NULL,
    vehicle_type_id  uuid NULL REFERENCES vehicle_types(id),
    sort_order       int NOT NULL DEFAULT 0
);

INSERT INTO catalog_segments (emoji, label, vehicle_type_id, sort_order)
SELECT s.emoji, s.label, vt.id, s.ord
FROM (VALUES
  ('🚗',  'Compacte',     'Voiture',      10),
  ('✨🚗', 'Coupé',        'Voiture',      20),
  ('🚘',  'Berline',      'Voiture',      30),
  ('🚙',  'SUV',          'Voiture',      40),
  ('🚦',  'Muscle',       'Voiture',      50),
  ('🏁',  'Classique',    'Voiture',      60),
  ('🏎️', 'Sportive',     'Voiture',      70),
  ('🚀',  'Super',        'Voiture',      80),
  ('🛞',  'Tout-terrain', 'Voiture',      90),
  ('🚐',  'Van',          'Voiture',     100),
  ('🏆',  'Spécial',      'Voiture',     110),
  ('🏍️', 'Moto',         'Moto',        120),
  ('🚲',  'Vélo',         'Vélo',        130),
  ('🛥️', 'Bateau',       'Bateau',      140),
  ('🚁',  'Hélicoptère',  'Hélicoptère', 150),
  ('✈️',  'Avion',        'Avion',       160)
) AS s(emoji, label, type_label, ord)
LEFT JOIN vehicle_types vt ON vt.label = s.type_label;

CREATE TABLE catalog_vehicles (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id    text NOT NULL UNIQUE,          -- identifiant du produit dans le panel
    name           text NOT NULL,
    segment_emoji  text NULL REFERENCES catalog_segments(emoji) ON UPDATE CASCADE,
    sort_order     int NOT NULL DEFAULT 0,
    active         boolean NOT NULL DEFAULT true,
    imported_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_catalog_active ON catalog_vehicles (active, name);

ALTER TABLE sales ADD COLUMN catalog_vehicle_id uuid NULL REFERENCES catalog_vehicles(id);
CREATE INDEX ix_sales_catalog ON sales (catalog_vehicle_id);
CREATE INDEX ix_sales_created ON sales (created_at);

-- Nouvelle permission : onglet Analyse (Patron et Chef de service par défaut).
UPDATE grades SET permissions = array_append(permissions, 'stats.view')
WHERE name IN ('Patron', 'Chef de service') AND NOT ('stats.view' = ANY(permissions));
