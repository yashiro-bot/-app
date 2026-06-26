-- CreateTable
CREATE TABLE "user" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "openid" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MANAGER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "lat" REAL,
    "lng" REAL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "cigar_spec" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit_per_box" INTEGER NOT NULL DEFAULT 25,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "customer_assignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "manager_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "assigned_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_assignment_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_assignment_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "collection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "manager_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "client_uuid" TEXT NOT NULL,
    "gps_lat" REAL,
    "gps_lng" REAL,
    "gps_accuracy" REAL,
    "distance_to_customer_m" REAL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "photo_urls" TEXT NOT NULL DEFAULT '[]',
    "collected_at" DATETIME NOT NULL,
    "synced_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "collection_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "collection_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "collection_detail" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "collection_id" INTEGER NOT NULL,
    "cigar_spec_id" INTEGER NOT NULL,
    "sales_qty" INTEGER NOT NULL DEFAULT 0,
    "actual_stock_loose" INTEGER NOT NULL DEFAULT 0,
    "counted_stock_loose" INTEGER NOT NULL DEFAULT 0,
    "actual_stock_boxed" INTEGER NOT NULL DEFAULT 0,
    "counted_stock_boxed" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "collection_detail_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "collection_detail_cigar_spec_id_fkey" FOREIGN KEY ("cigar_spec_id") REFERENCES "cigar_spec" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_openid_key" ON "user"("openid");

-- CreateIndex
CREATE UNIQUE INDEX "customer_code_key" ON "customer"("code");

-- CreateIndex
CREATE INDEX "customer_code_status_idx" ON "customer"("code", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cigar_spec_code_key" ON "cigar_spec"("code");

-- CreateIndex
CREATE UNIQUE INDEX "customer_assignment_manager_id_customer_id_key" ON "customer_assignment"("manager_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_client_uuid_key" ON "collection"("client_uuid");

-- CreateIndex
CREATE INDEX "collection_manager_id_collected_at_idx" ON "collection"("manager_id", "collected_at");

-- CreateIndex
CREATE INDEX "collection_customer_id_collected_at_idx" ON "collection"("customer_id", "collected_at");

-- CreateIndex
CREATE UNIQUE INDEX "collection_detail_collection_id_cigar_spec_id_key" ON "collection_detail"("collection_id", "cigar_spec_id");
