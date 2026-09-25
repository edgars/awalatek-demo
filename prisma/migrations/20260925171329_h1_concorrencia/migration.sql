-- CreateTable
CREATE TABLE "ProcessoLock" (
    "nome" TEXT NOT NULL PRIMARY KEY,
    "dono" TEXT NOT NULL,
    "adquiridoEm" DATETIME NOT NULL
);
