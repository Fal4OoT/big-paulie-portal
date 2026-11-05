-- 1. Fiches de formation (contenu en Markdown simple).
CREATE TABLE training_sheets (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title       text NOT NULL,
    category    text NULL,
    content     text NOT NULL DEFAULT '',
    published   boolean NOT NULL DEFAULT false,
    sort_order  int NOT NULL DEFAULT 0,
    created_by  uuid NULL REFERENCES users(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  uuid NULL REFERENCES users(id),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_training_category ON training_sheets (category, sort_order, title);

-- 2. Cadeau remis à la livraison (libellé figé au moment de la livraison).
ALTER TABLE sales ADD COLUMN gift text NULL;

-- 3. Permissions : tout le monde lit les formations, le Patron les gère.
UPDATE grades SET permissions = array_append(permissions, 'training.view')
WHERE NOT ('training.view' = ANY(permissions));
UPDATE grades SET permissions = array_append(permissions, 'training.manage')
WHERE name = 'Patron' AND NOT ('training.manage' = ANY(permissions));

-- 4. Paliers de cadeaux par défaut (désactivés, montants à régler dans la configuration).
UPDATE settings
SET value = value || '{
  "giftsEnabled": false,
  "giftTiers": [
    {"label": "Bouteille de vin", "min": 0, "max": null, "choices": ["Blanc", "Rouge"]},
    {"label": "Bouteille de champagne", "min": 0, "max": null, "choices": []}
  ]
}'::jsonb
WHERE key = 'portal' AND NOT (value ? 'giftTiers');
