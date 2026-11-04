-- Véhicule en stock à la vente : la vente démarre directement en « Réceptionné · à livrer ».
ALTER TABLE sales ADD COLUMN from_stock boolean NOT NULL DEFAULT false;
