/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddMaxHelpPackagesPerUser1763350902000 {
    name = 'AddMaxHelpPackagesPerUser1763350902000'

    /**
     * @param {import('typeorm').QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "maxHelpPackagesPerUser" integer NOT NULL DEFAULT 0`);
    }

    /**
     * @param {import('typeorm').QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "maxHelpPackagesPerUser"`);
    }
}
