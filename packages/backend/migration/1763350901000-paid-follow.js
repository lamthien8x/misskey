/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class PaidFollow1763350901000 {
    name = 'PaidFollow1763350901000'

    /**
     * @param {import('typeorm').QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "followPriceMonthly" integer NOT NULL DEFAULT 0`);

        await queryRunner.query(`CREATE TABLE "paid_follow" (
            "id" varchar(32) NOT NULL,
            "followerId" varchar(32) NOT NULL,
            "followeeId" varchar(32) NOT NULL,
            "amount" integer NOT NULL,
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
            CONSTRAINT "PK_paid_follow_id" PRIMARY KEY ("id"),
            CONSTRAINT "FK_paid_follow_follower" FOREIGN KEY ("followerId") REFERENCES "user"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_paid_follow_followee" FOREIGN KEY ("followeeId") REFERENCES "user"("id") ON DELETE CASCADE
        )`);

        await queryRunner.query(`CREATE INDEX "IDX_paid_follow_pair" ON "paid_follow" ("followerId", "followeeId")`);
        await queryRunner.query(`CREATE INDEX "IDX_paid_follow_expires" ON "paid_follow" ("expiresAt")`);
    }

    /**
     * @param {import('typeorm').QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_paid_follow_expires"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_paid_follow_pair"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "paid_follow"`);
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "followPriceMonthly"`);
    }
}