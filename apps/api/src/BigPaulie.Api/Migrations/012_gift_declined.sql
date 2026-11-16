-- v1.16.0 : le client peut refuser le cadeau de livraison (on garde la trace du refus).
ALTER TABLE sales ADD COLUMN gift_declined boolean NOT NULL DEFAULT false;
