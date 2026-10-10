ALTER TABLE "Order"
  ADD COLUMN "isBill" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "checkoutKey" TEXT,
  ADD COLUMN "checkoutFingerprint" TEXT,
  ADD COLUMN "amountReceived" DECIMAL(14,2),
  ADD COLUMN "change" DECIMAL(14,2),
  ADD COLUMN "storeSnapshot" JSONB,
  ADD COLUMN "customerSnapshot" JSONB;

ALTER TABLE "OrderItem"
  ADD COLUMN "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "productName" TEXT,
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "hsnCode" TEXT,
  ADD COLUMN "unit" TEXT;

CREATE UNIQUE INDEX "Order_checkoutKey_key" ON "Order"("checkoutKey");
CREATE INDEX "Order_isBill_createdAt_idx" ON "Order"("isBill", "createdAt");
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_discount_nonnegative" CHECK ("discount" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_bill_completed" CHECK (
  NOT "isBill" OR (
    "status" = 'DELIVERED' AND "paymentStatus" = 'PAID' AND "stockDeducted"
    AND "checkoutKey" IS NOT NULL AND "checkoutFingerprint" IS NOT NULL
    AND "storeSnapshot" IS NOT NULL AND "customerSnapshot" IS NOT NULL
    AND ("paymentMethod" <> 'CASH' OR ("amountReceived" IS NOT NULL AND "change" IS NOT NULL AND "amountReceived" >= "total" AND "change" = "amountReceived" - "total"))
  )
);
