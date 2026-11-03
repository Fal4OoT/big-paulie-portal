-- Big Paulie Portal : schéma initial
-- Exécuté automatiquement au démarrage de l'API (table schema_migrations).

CREATE TABLE users (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id       text NOT NULL UNIQUE,
    username         text NOT NULL,
    display_name     text NOT NULL,
    avatar           text NULL,
    role_ids         text[] NOT NULL DEFAULT '{}',
    roles_synced_at  timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    last_login_at    timestamptz NOT NULL DEFAULT now()
);

-- Grades de la concession (et rôle Staff), liés à un rôle Discord.
CREATE TABLE grades (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name             text NOT NULL,
    discord_role_id  text NULL,
    priority         int  NOT NULL DEFAULT 0,      -- plus grand = plus haut
    is_staff         boolean NOT NULL DEFAULT false,
    permissions      text[] NOT NULL DEFAULT '{}',
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- Modèles configurables (fiche client, vente).
CREATE TABLE field_definitions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity      text NOT NULL CHECK (entity IN ('client','sale')),
    key         text NOT NULL,
    label       text NOT NULL,
    type        text NOT NULL CHECK (type IN ('text','textarea','phone','date','number','checkbox','select','image')),
    required    boolean NOT NULL DEFAULT false,
    sort_order  int NOT NULL DEFAULT 0,
    is_system   boolean NOT NULL DEFAULT false,
    options     text[] NOT NULL DEFAULT '{}',
    help        text NULL,
    UNIQUE (entity, key)
);

CREATE TABLE vehicle_categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    label       text NOT NULL,
    sort_order  int NOT NULL DEFAULT 0,
    active      boolean NOT NULL DEFAULT true
);

CREATE TABLE vehicle_types (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    label            text NOT NULL,
    category_id      uuid NOT NULL REFERENCES vehicle_categories(id),
    permit_field_key text NULL,     -- clé du champ client (image) correspondant au permis requis
    sort_order       int NOT NULL DEFAULT 0,
    active           boolean NOT NULL DEFAULT true
);

CREATE TABLE files (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type  text NOT NULL,
    size          int  NOT NULL,
    data          bytea NOT NULL,
    created_by    uuid NULL REFERENCES users(id),
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clients (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    data         jsonb NOT NULL DEFAULT '{}'::jsonb,
    search_text  text NOT NULL DEFAULT '',
    created_by   uuid NULL REFERENCES users(id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_by   uuid NULL REFERENCES users(id),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz NULL
);
CREATE INDEX ix_clients_search ON clients (search_text);

CREATE TABLE sales (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number           bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    client_id        uuid NOT NULL REFERENCES clients(id),
    vehicle_name     text NOT NULL,
    vehicle_type_id  uuid NOT NULL REFERENCES vehicle_types(id),
    price            numeric(14,2) NOT NULL CHECK (price >= 0),
    immediate        boolean NOT NULL DEFAULT false,
    plate            text NULL,
    status           text NOT NULL CHECK (status IN ('TO_ORDER','TO_FETCH','RECEIVED','DELIVERED','CANCELLED')),
    permit_warning   boolean NOT NULL DEFAULT false,
    data             jsonb NOT NULL DEFAULT '{}'::jsonb,
    seller_id        uuid NOT NULL REFERENCES users(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    delivered_at     timestamptz NULL
);
CREATE INDEX ix_sales_status ON sales (status);
CREATE INDEX ix_sales_client ON sales (client_id);
-- Une plaque ne peut être attribuée qu'à une seule vente active.
CREATE UNIQUE INDEX ux_sales_plate ON sales (plate) WHERE plate IS NOT NULL AND status <> 'CANCELLED';

-- Historique : qui a fait quoi à chaque étape.
CREATE TABLE sale_events (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id      uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    action       text NOT NULL,            -- CREATED, STATUS, EDITED, CANCELLED, RESTORED
    from_status  text NULL,
    to_status    text NULL,
    note         text NULL,
    actor_id     uuid NULL REFERENCES users(id),
    at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_sale_events_sale ON sale_events (sale_id, at);

CREATE TABLE audit_logs (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id    uuid NULL REFERENCES users(id),
    actor_name  text NOT NULL,
    action      text NOT NULL,
    entity      text NOT NULL,
    entity_id   text NULL,
    summary     text NOT NULL,
    at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_at ON audit_logs (at DESC);

CREATE TABLE settings (
    key    text PRIMARY KEY,
    value  jsonb NOT NULL
);

-- ---------------------------------------------------------------------------
-- Données par défaut (toutes modifiables depuis la page Configuration)
-- ---------------------------------------------------------------------------

INSERT INTO grades (name, priority, is_staff, permissions) VALUES
 ('Patron', 400, false, ARRAY['clients.view','clients.create','clients.edit','clients.delete','sales.view','sales.create','sales.advance','sales.revert','sales.edit','sales.cancel','tour.view','logs.view','config.manage']),
 ('Chef de service', 300, false, ARRAY['clients.view','clients.create','clients.edit','sales.view','sales.create','sales.advance','sales.revert','sales.edit','sales.cancel','tour.view','logs.view']),
 ('Confirmé', 200, false, ARRAY['clients.view','clients.create','clients.edit','sales.view','sales.create','sales.advance','sales.revert','tour.view']),
 ('Employé', 100, false, ARRAY['clients.view','clients.create','clients.edit','sales.view','sales.create','sales.advance','tour.view']),
 ('Staff', 50, true, ARRAY['clients.view','sales.view','tour.view','logs.view']);

INSERT INTO field_definitions (entity, key, label, type, required, sort_order, is_system) VALUES
 ('client','prenom','Prénom','text',true,10,true),
 ('client','nom','Nom','text',true,20,true),
 ('client','telephone','Téléphone','phone',true,30,true),
 ('client','date_naissance','Date de naissance','date',true,40,true),
 ('client','permis_voiture','Permis voiture','image',false,50,false),
 ('client','permis_moto','Permis moto','image',false,60,false),
 ('client','permis_bateau','Permis bateau','image',false,70,false),
 ('client','permis_helico','Permis hélicoptère','image',false,80,false),
 ('client','permis_avion','Permis avion','image',false,90,false),
 ('sale','remarques','Remarques','textarea',false,10,false);

WITH c AS (
  INSERT INTO vehicle_categories (label, sort_order) VALUES
   ('Terrestre',10), ('Maritime',20), ('Aérien',30)
  RETURNING id, label
)
INSERT INTO vehicle_types (label, category_id, permit_field_key, sort_order)
SELECT t.label, c.id, t.permit, t.ord
FROM (VALUES
  ('Voiture','Terrestre','permis_voiture',10),
  ('Moto','Terrestre','permis_moto',20),
  ('Bateau','Maritime','permis_bateau',30),
  ('Hélicoptère','Aérien','permis_helico',40),
  ('Avion','Aérien','permis_avion',50)
) AS t(label, cat, permit, ord)
JOIN c ON c.label = t.cat;

INSERT INTO settings (key, value) VALUES ('portal', '{
  "logChannelId": null,
  "tourChannelId": null,
  "tourPingRoleId": null,
  "immediatePingRoleId": null,
  "tourEnabled": true,
  "tourSkipEmpty": true,
  "statuses": [
    {"code":"TO_ORDER","label":"À commander","color":"#E07A2F"},
    {"code":"TO_FETCH","label":"À chercher","color":"#D9A441"},
    {"code":"RECEIVED","label":"Réceptionné · à livrer","color":"#3C8D5E"},
    {"code":"DELIVERED","label":"Livré","color":"#7C8A99"},
    {"code":"CANCELLED","label":"Annulé","color":"#9E1B1E"}
  ]
}'::jsonb);
