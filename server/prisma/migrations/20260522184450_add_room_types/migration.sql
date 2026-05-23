-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "password" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'open';
