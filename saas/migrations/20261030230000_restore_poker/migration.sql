ALTER TABLE "Participant" ADD COLUMN "isObserving" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Participant" SET "isObserving" = true WHERE "role" = 'OBSERVER';
ALTER TABLE "Round" ALTER COLUMN "deck" SET DEFAULT '0,1/2,1,2,3,5,8,13,21,34,55,89,?';
-- Only expand the original beta default. Keep existing coffee votes valid.
UPDATE "Round" SET "deck" = '0,1/2,1,2,3,5,8,13,21,34,55,89,?,coffee'
WHERE "deck" = '0,1,2,3,5,8,13,21,?,coffee';
