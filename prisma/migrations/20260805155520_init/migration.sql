-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "totalPages" INTEGER NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "pagesPerDay" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);
