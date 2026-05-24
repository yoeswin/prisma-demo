/*
  Warnings:

  - You are about to drop the column `password` on the `Room` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Room" DROP COLUMN "password";

-- CreateIndex
CREATE INDEX "Message_roomId_idx" ON "Message"("roomId");
