ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_stock_nonnegative" CHECK ("currentStock" >= 0 AND "reservedStock" >= 0 AND "reservedStock" <= "currentStock");
ALTER TABLE "Product" ADD CONSTRAINT "Product_prices_nonnegative" CHECK ("costPrice" >= 0 AND "sellingPrice" >= 0 AND "gstPercentage" BETWEEN 0 AND 100);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_balance_consistent" CHECK ("previousStock" + "quantity" = "newStock" AND "previousStock" >= 0 AND "newStock" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_nonnegative" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "taxableAmount" >= 0 AND "taxAmount" >= 0 AND "total" >= 0);
