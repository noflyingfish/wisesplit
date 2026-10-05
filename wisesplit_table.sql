-- ============================================================================
-- Wisesplit — paste-ready schema for a NEW, EMPTY database.
--
-- Copy this whole file into your database GUI (phpMyAdmin / HeidiSQL / DBeaver)
-- and run it against the database you created for Wisesplit. It contains no
-- CREATE DATABASE, no USE and no DROP, so it will not touch anything else on the
-- server — select the database in the GUI first.
--
-- Safe to run more than once: every statement is CREATE TABLE IF NOT EXISTS.
--
-- The DDL below is IDENTICAL to tables.sql (same columns, types, keys and
-- collation). tables.sql carries the full reasoning; the notes here are short.
-- Two properties are load-bearing and must not be dropped by a GUI import:
--   * utf8mb4      — 4-byte encoding; the app stores emoji LITERALLY.
--   * utf8mb4_bin  — case-SENSITIVE; the server default is case-insensitive and
--                    would make "Bob" and "bob" collide on UNIQUE(groupId, name).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Group
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Group` (
  `id`        VARCHAR(191) NOT NULL,
  `slug`      VARCHAR(191) NOT NULL,
  `name`      VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `Group_slug_key` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;


-- ---------------------------------------------------------------------------
-- GroupMember
--   `token` is the per-member secret used by the /u/<token> invite link.
--   UNIQUE(groupId, name) is why the collation must be case-sensitive.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `GroupMember` (
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


-- ---------------------------------------------------------------------------
-- Category
--   `emoji` holds the icon literally (🍕 🚗 🎉) — see charset note above.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Category` (
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


-- ---------------------------------------------------------------------------
-- Expense
--   `amount` is DECIMAL(12,2) — exact decimal, never a float.
--   `splitType` is NULLABLE ON PURPOSE: NULL means "unknown — fall back to the
--   share-shape heuristic", NOT "equal". Do not add a default.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Expense` (
  `id`          VARCHAR(191)  NOT NULL,
  `description` VARCHAR(191)  NOT NULL,
  `amount`      DECIMAL(12,2) NOT NULL,
  `paidById`    VARCHAR(191)  NOT NULL,
  `groupId`     VARCHAR(191)  NOT NULL,
  `categoryId`  VARCHAR(191)  NULL,
  `date`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt`   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `splitType`   VARCHAR(191)  NULL,
  PRIMARY KEY (`id`),
  KEY `Expense_groupId_createdAt_idx` (`groupId`, `createdAt`),
  KEY `Expense_paidById_idx` (`paidById`),
  KEY `Expense_categoryId_idx` (`categoryId`),
  CONSTRAINT `Expense_groupId_fkey`
    FOREIGN KEY (`groupId`) REFERENCES `Group` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Expense_paidById_fkey`
    FOREIGN KEY (`paidById`) REFERENCES `GroupMember` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Expense_categoryId_fkey`
    FOREIGN KEY (`categoryId`) REFERENCES `Category` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;


-- ---------------------------------------------------------------------------
-- ExpenseShare
--   `percentage` is the whole-number percentage the user typed, for
--   "percentage" expenses only, and NULL everywhere else.
--   Both FKs are CASCADE.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ExpenseShare` (
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


-- ---------------------------------------------------------------------------
-- Settlement
--   paidById is the member who PAID; receivedById is the member who RECEIVED.
--   Both are RESTRICT, so a member referenced by a settlement cannot be deleted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Settlement` (
  `id`           VARCHAR(191)  NOT NULL,
  `groupId`      VARCHAR(191)  NOT NULL,
  `paidById`     VARCHAR(191)  NOT NULL,
  `receivedById` VARCHAR(191)  NOT NULL,
  `amount`       DECIMAL(12,2) NOT NULL,
  `createdAt`    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Settlement_groupId_createdAt_idx` (`groupId`, `createdAt`),
  KEY `Settlement_paidById_idx` (`paidById`),
  KEY `Settlement_receivedById_idx` (`receivedById`),
  CONSTRAINT `Settlement_groupId_fkey`
    FOREIGN KEY (`groupId`) REFERENCES `Group` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Settlement_paidById_fkey`
    FOREIGN KEY (`paidById`) REFERENCES `GroupMember` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Settlement_receivedById_fkey`
    FOREIGN KEY (`receivedById`) REFERENCES `GroupMember` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;


-- ============================================================================
-- VERIFICATION — runs last and prints what you just created.
-- Expect six rows, every one utf8mb4_bin, and the four money columns below.
-- ============================================================================
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;

-- Money columns must be: Expense.amount decimal(12,2), ExpenseShare.amount
-- decimal(12,2), ExpenseShare.percentage decimal(5,2), Settlement.amount
-- decimal(12,2). If any reads `double`, the wrong file was loaded.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME IN ('amount', 'percentage')
ORDER BY TABLE_NAME, COLUMN_NAME;

-- Decimal exactness probe — the whole point of DECIMAL over DOUBLE. Must return 1.
SELECT CAST('0.1' AS DECIMAL(12,2)) + CAST('0.2' AS DECIMAL(12,2)) = 0.3 AS decimal_is_exact;
