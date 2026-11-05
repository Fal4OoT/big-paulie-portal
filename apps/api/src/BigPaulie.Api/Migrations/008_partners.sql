-- Partenariats (ex : garage de mécanique / customisation).
CREATE TABLE partners (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL,
    active            boolean NOT NULL DEFAULT true,
    discount_percent  int  NOT NULL DEFAULT 10 CHECK (discount_percent BETWEEN 1 AND 100),
    window_hours      int  NOT NULL DEFAULT 24 CHECK (window_hours BETWEEN 1 AND 720),
    category_ids      uuid[] NOT NULL DEFAULT '{}',   -- catégories éligibles (vide = toutes)
    client_terms      text NOT NULL DEFAULT '',       -- ce que le client obtient (affiché aux vendeurs)
    contract_terms    text NOT NULL DEFAULT '',       -- ce que le partenaire offre à nos employés
    channel_id        text NULL,                      -- salon Discord du partenaire (nouveaux véhicules éligibles)
    created_at        timestamptz NOT NULL DEFAULT now()
);

-- Un grade peut représenter les employés d'un partenaire (accès limité à l'espace partenaire).
ALTER TABLE grades ADD COLUMN partner_id uuid NULL REFERENCES partners(id) ON DELETE SET NULL;

-- Customisations validées par le partenaire.
CREATE TABLE partner_validations (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id    uuid NOT NULL REFERENCES partners(id),
    sale_id       uuid NOT NULL REFERENCES sales(id),
    amount        numeric(14,2) NULL CHECK (amount IS NULL OR amount >= 0),  -- montant facturé, réduction comprise
    note          text NULL,
    validated_by  uuid NULL REFERENCES users(id),
    validated_at  timestamptz NOT NULL DEFAULT now(),
    cancelled_by  uuid NULL REFERENCES users(id),
    cancelled_at  timestamptz NULL,
    cancel_reason text NULL
);
CREATE UNIQUE INDEX ux_partner_validation ON partner_validations (partner_id, sale_id) WHERE cancelled_at IS NULL;
CREATE INDEX ix_partner_validations ON partner_validations (partner_id, validated_at DESC);
CREATE INDEX ix_sales_delivered ON sales (delivered_at) WHERE status = 'DELIVERED';

-- Permissions : consulter les partenariats (concession) et annuler une validation (Patron).
UPDATE grades SET permissions = array_append(permissions, 'partners.view')
WHERE NOT is_staff AND partner_id IS NULL AND NOT ('partners.view' = ANY(permissions));
UPDATE grades SET permissions = array_append(permissions, 'partners.cancel')
WHERE name = 'Patron' AND NOT ('partners.cancel' = ANY(permissions));
