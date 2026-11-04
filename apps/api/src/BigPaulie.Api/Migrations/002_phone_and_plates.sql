-- 1. Plaque requise à la livraison : réglage par catégorie (seul le terrestre a des plaques).
ALTER TABLE vehicle_categories ADD COLUMN requires_plate boolean NOT NULL DEFAULT true;
UPDATE vehicle_categories SET requires_plate = false WHERE label IN ('Maritime', 'Aérien');

-- 2. Téléphones : on ne garde que les chiffres (format de saisie 5209250963).
UPDATE clients
SET data = jsonb_set(data, '{telephone}', to_jsonb(regexp_replace(data->>'telephone', '\D', '', 'g')))
WHERE data ? 'telephone' AND jsonb_typeof(data->'telephone') = 'string';

UPDATE field_definitions
SET help = 'Saisir les 10 chiffres, ex : 5209250963'
WHERE entity = 'client' AND key = 'telephone' AND help IS NULL;
