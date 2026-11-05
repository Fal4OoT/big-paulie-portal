-- 1. Prénom / nom : première lettre de chaque partie en majuscule (le reste n'est pas modifié).
CREATE FUNCTION bp_capitalize_parts(t text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    result text := '';
    ch text;
    prev text := ' ';
BEGIN
    IF t IS NULL THEN RETURN NULL; END IF;
    FOR i IN 1..char_length(t) LOOP
        ch := substr(t, i, 1);
        IF prev IN (' ', '-', '''', '’') THEN ch := upper(ch); END IF;
        result := result || ch;
        prev := ch;
    END LOOP;
    RETURN result;
END $$;

UPDATE clients
SET data = data
    || CASE WHEN jsonb_typeof(data->'prenom') = 'string'
            THEN jsonb_build_object('prenom', bp_capitalize_parts(data->>'prenom')) ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(data->'nom') = 'string'
            THEN jsonb_build_object('nom', bp_capitalize_parts(data->>'nom')) ELSE '{}'::jsonb END
WHERE (jsonb_typeof(data->'prenom') = 'string' AND data->>'prenom' <> bp_capitalize_parts(data->>'prenom'))
   OR (jsonb_typeof(data->'nom') = 'string' AND data->>'nom' <> bp_capitalize_parts(data->>'nom'));

DROP FUNCTION bp_capitalize_parts(text);

-- 2. Coupons de promotion (pourcentage), manuels ou de fidélité.
CREATE TABLE coupons (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number          bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    client_id       uuid NOT NULL REFERENCES clients(id),
    percent         int  NOT NULL CHECK (percent BETWEEN 1 AND 100),
    reason          text NOT NULL,
    expires_on      date NULL,                          -- valable jusqu'à ce jour inclus (heure de Paris)
    source          text NOT NULL CHECK (source IN ('MANUAL', 'LOYALTY')),
    source_sale_id  uuid NULL REFERENCES sales(id),     -- vente qui a déclenché un coupon de fidélité
    created_by      uuid NULL REFERENCES users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    used_sale_id    uuid NULL UNIQUE REFERENCES sales(id),
    used_by         uuid NULL REFERENCES users(id),
    used_at         timestamptz NULL,
    cancelled_by    uuid NULL REFERENCES users(id),
    cancelled_at    timestamptz NULL,
    cancel_reason   text NULL,
    cancelled_with_sale boolean NOT NULL DEFAULT false   -- annulé automatiquement avec la vente qui l'avait généré
);
CREATE INDEX ix_coupons_client ON coupons (client_id);

-- Historique de chaque coupon (créé, utilisé, libéré, annulé, rétabli).
CREATE TABLE coupon_events (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id  uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    action     text NOT NULL,
    sale_id    uuid NULL REFERENCES sales(id),
    note       text NULL,
    actor_id   uuid NULL REFERENCES users(id),
    at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_coupon_events_coupon ON coupon_events (coupon_id, at);

ALTER TABLE sales ADD COLUMN coupon_id uuid NULL REFERENCES coupons(id);

-- 3. Permissions (Patron et Chef de service par défaut).
UPDATE grades SET permissions = array_append(permissions, 'coupons.create')
WHERE name IN ('Patron', 'Chef de service') AND NOT ('coupons.create' = ANY(permissions));
UPDATE grades SET permissions = array_append(permissions, 'coupons.cancel')
WHERE name IN ('Patron', 'Chef de service') AND NOT ('coupons.cancel' = ANY(permissions));
