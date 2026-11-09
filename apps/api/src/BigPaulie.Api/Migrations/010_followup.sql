-- v1.14.0 : suivi des appels et rendez-vous de livraison, note interne client, anniversaires, nouvelles permissions.

-- 1. Nouvelles permissions, données aux grades qui faisaient déjà l'équivalent.
UPDATE grades SET permissions = array_append(permissions, 'referrals.override')
WHERE lower(trim(name)) = 'patron' AND NOT ('referrals.override' = ANY (permissions));

UPDATE grades SET permissions = array_append(permissions, 'clients.note')
WHERE 'clients.edit' = ANY (permissions) AND NOT ('clients.note' = ANY (permissions));

UPDATE grades SET permissions = array_append(permissions, 'sales.contact')
WHERE 'sales.advance' = ANY (permissions) AND NOT ('sales.contact' = ANY (permissions));

-- 2. Note interne sur la fiche client (avec alerte facultative au moment d'une vente).
ALTER TABLE clients
    ADD COLUMN internal_note   text        NULL,
    ADD COLUMN note_alert      boolean     NOT NULL DEFAULT false,
    ADD COLUMN note_updated_at timestamptz NULL,
    ADD COLUMN note_updated_by uuid        NULL REFERENCES users(id);

-- 3. Suivi des appels au client (facultatif : ne bloque jamais un changement de statut).
CREATE TABLE sale_contacts (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id        uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    outcome        text NOT NULL CHECK (outcome IN ('NO_ANSWER', 'MESSAGE', 'REACHED', 'APPOINTMENT')),
    note           text NULL,
    appointment_at timestamptz NULL,
    actor_id       uuid NULL REFERENCES users(id),
    at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_sale_contacts_sale ON sale_contacts (sale_id, at DESC);

-- Rendez-vous de livraison convenu avec le client (facultatif).
ALTER TABLE sales ADD COLUMN delivery_at timestamptz NULL;

-- 4. Coupons d'anniversaire (un par client et par année).
ALTER TABLE coupons DROP CONSTRAINT coupons_source_check;
ALTER TABLE coupons ADD CONSTRAINT coupons_source_check CHECK (source IN ('MANUAL', 'LOYALTY', 'REFERRAL', 'BIRTHDAY'));
ALTER TABLE coupons ADD COLUMN birthday_year int NULL;
CREATE UNIQUE INDEX ux_coupons_birthday ON coupons (client_id, birthday_year) WHERE source = 'BIRTHDAY';

-- 5. Fiche du guide : suivi client.
INSERT INTO training_sheets (title, category, sort_order, published, content) VALUES
('Suivi client : appels, rendez-vous, notes, anniversaires', 'Guide du portail', 11, true, $md$
# Suivi client

Tout ce qui est décrit ici est **facultatif** : rien n'empêche jamais de faire avancer une vente.

## Noter un appel
Dans la **Tournée**, colonne « à livrer », clique sur 📞 à droite du véhicule (ou **Noter un appel** sur la fiche de la vente) :

- **Pas de réponse** / **Message laissé** : le prochain collègue voit que le client a déjà été appelé, quand et par qui.
- **Client joint** : il a répondu, sans rendez-vous précis.
- **RDV pris** : indique l'heure du rendez-vous de livraison (heure de Paris).

Le dernier appel s'affiche sous le véhicule dans la tournée. L'historique complet est sur la fiche de la vente.

Astuce : clique sur le numéro du client pour le copier (10 chiffres, prêt à composer).

## Rendez-vous de livraison
Un véhicule avec rendez-vous affiche **🕘 RDV 21h30**, dans la tournée comme dans le tableau Discord, et passe en tête de la colonne « à livrer ».
Le rendez-vous se modifie ou se retire sur la fiche de la vente, bloc « Appels & rendez-vous ».

## Note interne du client
Sur la fiche client, bloc **Note interne** : client VIP, mauvais payeur, consignes particulières…

- Elle n'est visible que par les employés.
- Coche **Alerte** pour qu'elle s'affiche en avertissement rouge à chaque nouvel achat, sur la fiche de la vente et dans la tournée (🛡️).

## Anniversaires
Le tableau de bord liste les anniversaires des 7 prochains jours, avec le numéro du client : c'est le bon moment pour l'appeler.
Si le Patron l'a activé, un **coupon d'anniversaire** est créé automatiquement le jour J.

## Clients à relancer
Dans **Analyse**, en bas de page : les clients qui n'ont rien acheté depuis X semaines, les plus gros acheteurs d'abord. C'est une liste d'appels toute prête pour les moments calmes.

## Objectifs de la semaine
Quand le Patron a fixé des objectifs (ventes, livraisons, nouveaux clients), leur progression du lundi au dimanche s'affiche sur le tableau de bord et dans le récap Discord.
$md$);
