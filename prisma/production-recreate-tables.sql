-- DESTRUCTIVE — THIS SCRIPT DROPS EVERY WISESPLIT TABLE AND ALL DATA IN THEM. Run it MANUALLY, by hand, against the PRODUCTION database only, after taking a backup. It is NOT run by the app and NOT run by any tooling.
-- ============================================================================
-- Wisesplit — recreate the production schema in the multi-currency shape.
--
-- WHAT THIS DOES
--   Drops the 7 tables and recreates them empty, so the new multi-currency schema
--   (a per-group `Currency` table, plus a REQUIRED currency on every Expense and
--   Settlement) is installed cleanly. **All existing rows are destroyed.** This is
--   the accepted plan: the amount columns gain a required currency that existing
--   rows cannot supply, so a lossless in-place migration is not possible and the
--   data is being discarded on purpose.
--
-- HOW TO RUN
--   1. TAKE A BACKUP FIRST:   mysqldump -h <host> -u <user> -p <db> > backup.sql
--   2. Select your Wisesplit database (this file does NOT pick one):
--        mysql  -h <host> -u <user> -p <database> < production-recreate-tables.sql
--        (or paste the whole file into phpMyAdmin / HeidiSQL / DBeaver after
--         selecting the database)
--   3. The final SELECTs print what you created — check all 7 rows read
--      utf8mb4_bin and the money columns read decimal(12,2)/(5,2).
--
-- It contains NO `CREATE DATABASE` and NO `USE`, so it will not touch anything
-- else on the server. The DROP order below is FOREIGN-KEY-SAFE (children before
-- parents) so it runs without disabling FK checks.
--
-- The DDL is identical to `tables.sql` (the DDL of record); that file carries the
-- full reasoning. Two properties are load-bearing and must not be dropped by a
-- GUI import: utf8mb4 (4-byte; the app stores emoji LITERALLY) and utf8mb4_bin
-- (case-SENSITIVE; the server default would make "Bob" and "bob" collide on the
-- UNIQUE(groupId, name) constraints).
--
-- After this, each group must have at least one currency (SGD is seeded
-- automatically by the app when a group is created). Tables are otherwise empty.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. DROP — children before parents, so no FK is ever left dangling.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `ExpenseShare`;
DROP TABLE IF EXISTS `Settlement`;
DROP TABLE IF EXISTS `Expense`;
DROP TABLE IF EXISTS `Currency`;
DROP TABLE IF EXISTS `Category`;
DROP TABLE IF EXISTS `GroupMember`;
DROP TABLE IF EXISTS `Group`;


-- ---------------------------------------------------------------------------
-- 2. CREATE — parents before children.
-- ---------------------------------------------------------------------------

-- Group ---------------------------------------------------------------------
CREATE TABLE `Group` (
  `id`        VARCHAR(191) NOT NULL,
  `slug`      VARCHAR(191) NOT NULL,
  `name`      VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `Group_slug_key` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- GroupMember ---------------------------------------------------------------
--   UNIQUE(groupId, name) is what stops duplicate member names in one group; it
--   is case-sensitive only under utf8mb4_bin.
CREATE TABLE `GroupMember` (
  `id`        VARCHAR(191) NOT NULL,
  `token`     VARCHAR(191) NOT NULL,
  `name`      VARCHAR(191) NOT NULL,
  `groupId`   VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `GroupMember_token_key` (`token`),
  UNIQUE KEY `GroupMember_groupId_name_key` (`groupId`, `name`),
  CONSTRAINT `GroupMember_groupId_fkey`
    FOREIGN KEY (`groupId`) REFERENCES `Group` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Category ------------------------------------------------------------------
CREATE TABLE `Category` (
  `id`      VARCHAR(191) NOT NULL,
  `emoji`   VARCHAR(191) NOT NULL,
  `name`    VARCHAR(191) NOT NULL,
  `groupId` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Category_groupId_name_key` (`groupId`, `name`),
  CONSTRAINT `Category_groupId_fkey`
    FOREIGN KEY (`groupId`) REFERENCES `Group` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Currency — NEW ------------------------------------------------------------
--   A currency this group has enabled (ISO 4217 code from lib/currencies.ts).
--   Identity is the code ALONE. UNIQUE(groupId, code) mirrors Category. SGD is
--   seeded into every new group by the app and is never deletable; any other
--   code may be deleted only while unused.
CREATE TABLE `Currency` (
  `id`      VARCHAR(191) NOT NULL,
  `code`    VARCHAR(191) NOT NULL,
  `groupId` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Currency_groupId_code_key` (`groupId`, `code`),
  CONSTRAINT `Currency_groupId_fkey`
    FOREIGN KEY (`groupId`) REFERENCES `Group` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Expense -------------------------------------------------------------------
--   `amount` is DECIMAL(12,2) — exact decimal, never a float.
--   `currencyId` is NEW and REQUIRED; RESTRICT, so an in-use currency cannot be
--   deleted. `splitType` is NULLABLE ON PURPOSE (NULL means "unknown", not
--   "equal").
CREATE TABLE `Expense` (
  `id`          VARCHAR(191)  NOT NULL,
  `description` VARCHAR(191)  NOT NULL,
  `amount`      DECIMAL(12,2) NOT NULL,
  `paidById`    VARCHAR(191)  NOT NULL,
  `groupId`     VARCHAR(191)  NOT NULL,
  `categoryId`  VARCHAR(191)  NULL,
  `currencyId`  VARCHAR(191)  NOT NULL,
  `date`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt`   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `splitType`   VARCHAR(191)  NULL,
  PRIMARY KEY (`id`),
  KEY `Expense_groupId_createdAt_idx` (`groupId`, `createdAt`),
  KEY `Expense_paidById_idx` (`paidById`),
  KEY `Expense_categoryId_idx` (`categoryId`),
  KEY `Expense_currencyId_idx` (`currencyId`),
  CONSTRAINT `Expense_groupId_fkey`
    FOREIGN KEY (`groupId`) REFERENCES `Group` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Expense_paidById_fkey`
    FOREIGN KEY (`paidById`) REFERENCES `GroupMember` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Expense_categoryId_fkey`
    FOREIGN KEY (`categoryId`) REFERENCES `Category` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Expense_currencyId_fkey`
    FOREIGN KEY (`currencyId`) REFERENCES `Currency` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- ExpenseShare --------------------------------------------------------------
CREATE TABLE `ExpenseShare` (
  `id`         VARCHAR(191)  NOT NULL,
  `expenseId`  VARCHAR(191)  NOT NULL,
  `memberId`   VARCHAR(191)  NOT NULL,
  `amount`     DECIMAL(12,2) NOT NULL,
  `percentage` DECIMAL(5,2)  NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ExpenseShare_expenseId_memberId_key` (`expenseId`, `memberId`),
  KEY `ExpenseShare_memberId_idx` (`memberId`),
  CONSTRAINT `ExpenseShare_expenseId_fkey`
    FOREIGN KEY (`expenseId`) REFERENCES `Expense` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ExpenseShare_memberId_fkey`
    FOREIGN KEY (`memberId`) REFERENCES `GroupMember` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Settlement ----------------------------------------------------------------
--   `currencyId` is NEW and REQUIRED; RESTRICT, so an in-use currency cannot be
--   deleted. paidById PAID, receivedById RECEIVED.
CREATE TABLE `Settlement` (
  `id`           VARCHAR(191)  NOT NULL,
  `groupId`      VARCHAR(191)  NOT NULL,
  `paidById`     VARCHAR(191)  NOT NULL,
  `receivedById` VARCHAR(191)  NOT NULL,
  `currencyId`   VARCHAR(191)  NOT NULL,
  `amount`       DECIMAL(12,2) NOT NULL,
  `createdAt`    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Settlement_groupId_createdAt_idx` (`groupId`, `createdAt`),
  KEY `Settlement_paidById_idx` (`paidById`),
  KEY `Settlement_receivedById_idx` (`receivedById`),
  KEY `Settlement_currencyId_idx` (`currencyId`),
  CONSTRAINT `Settlement_groupId_fkey`
    FOREIGN KEY (`groupId`) REFERENCES `Group` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Settlement_paidById_fkey`
    FOREIGN KEY (`paidById`) REFERENCES `GroupMember` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Settlement_receivedById_fkey`
    FOREIGN KEY (`receivedById`) REFERENCES `GroupMember` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Settlement_currencyId_fkey`
    FOREIGN KEY (`currencyId`) REFERENCES `Currency` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;


-- ---------------------------------------------------------------------------
-- 3. VERIFY — prints what you created.
-- ---------------------------------------------------------------------------
-- Expect 7 rows, every one utf8mb4_bin.
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;

-- Money columns must be: Expense.amount decimal(12,2), ExpenseShare.amount
-- decimal(12,2), ExpenseShare.percentage decimal(5,2), Settlement.amount
-- decimal(12,2). If any reads `double`, the wrong file was used.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME IN ('amount', 'percentage')
ORDER BY TABLE_NAME, COLUMN_NAME;

-- The two new required currency columns must both read varchar(191) NOT NULL.
SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME = 'currencyId'
ORDER BY TABLE_NAME;
