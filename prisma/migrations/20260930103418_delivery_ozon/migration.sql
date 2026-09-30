-- Ozon replaces CDEK and Russian Post for new requests. The old values stay:
-- requests already placed with them must keep saying how they were sent.
-- AlterEnum
ALTER TYPE "DeliveryMethod" ADD VALUE 'OZON';
