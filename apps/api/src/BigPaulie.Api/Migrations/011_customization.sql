-- v1.15.0 : détail des customisations validées par les garages partenaires (tout est facultatif).
ALTER TABLE partner_validations
    ADD COLUMN cosmetic           boolean       NOT NULL DEFAULT false,
    ADD COLUMN cosmetic_amount    numeric(14,2) NULL CHECK (cosmetic_amount IS NULL OR cosmetic_amount >= 0),
    ADD COLUMN performance        boolean       NOT NULL DEFAULT false,
    ADD COLUMN performance_amount numeric(14,2) NULL CHECK (performance_amount IS NULL OR performance_amount >= 0),
    ADD COLUMN engine             int           NULL CHECK (engine BETWEEN 1 AND 6),
    ADD COLUMN turbo              boolean       NOT NULL DEFAULT false,
    ADD COLUMN transmission       int           NULL CHECK (transmission BETWEEN 1 AND 6),
    ADD COLUMN suspension         int           NULL CHECK (suspension BETWEEN 1 AND 6),
    ADD COLUMN brakes             int           NULL CHECK (brakes BETWEEN 1 AND 6),
    ADD COLUMN updated_by         uuid          NULL REFERENCES users(id),
    ADD COLUMN updated_at         timestamptz   NULL;

-- Guide : détail de la customisation (si la fiche n'a pas été modifiée entre-temps, sinon rien ne change).
UPDATE training_sheets
SET content = replace(content,
    '- Quand la customisation est faite, ils la **valident** avec le montant facturé.',
    '- Quand la customisation est faite, ils la **valident**. Tout est facultatif : **Cosmétique** (avec son montant), **Performance** (avec son montant et les pièces : Moteur, Transmission, Suspension et Freins du niveau 1 à 6, Turbo), et le **montant total**, calculé tout seul mais modifiable. Le bouton **Full perf** coche toutes les pièces au niveau maximum.
- En cas d''oubli ou d''erreur, ils peuvent **modifier** une customisation déjà validée : la modification est tracée.')
WHERE title = 'Partenariat customisation';
