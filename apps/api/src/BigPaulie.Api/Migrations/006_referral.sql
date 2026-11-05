-- Parrainage : un client peut avoir un parrain (un seul), lui-même client.
ALTER TABLE clients ADD COLUMN sponsor_id uuid NULL REFERENCES clients(id);
ALTER TABLE clients ADD COLUMN sponsor_set_at timestamptz NULL;
ALTER TABLE clients ADD COLUMN sponsor_set_by uuid NULL REFERENCES users(id);
ALTER TABLE clients ADD CONSTRAINT ck_clients_not_own_sponsor CHECK (sponsor_id IS NULL OR sponsor_id <> id);
CREATE INDEX ix_clients_sponsor ON clients (sponsor_id) WHERE sponsor_id IS NOT NULL;

-- Coupons de parrainage : l'un pour le filleul (GODCHILD), l'autre pour le parrain (SPONSOR).
ALTER TABLE coupons DROP CONSTRAINT coupons_source_check;
ALTER TABLE coupons ADD CONSTRAINT coupons_source_check CHECK (source IN ('MANUAL', 'LOYALTY', 'REFERRAL'));
ALTER TABLE coupons ADD COLUMN referral_godchild_id uuid NULL REFERENCES clients(id);
ALTER TABLE coupons ADD COLUMN referral_role text NULL CHECK (referral_role IN ('GODCHILD', 'SPONSOR'));
CREATE INDEX ix_coupons_referral ON coupons (referral_godchild_id) WHERE referral_godchild_id IS NOT NULL;

-- Permission : enregistrer un parrainage (tous les grades de la concession, pas le Staff en lecture seule).
UPDATE grades SET permissions = array_append(permissions, 'referrals.manage')
WHERE NOT is_staff AND NOT ('referrals.manage' = ANY(permissions));
