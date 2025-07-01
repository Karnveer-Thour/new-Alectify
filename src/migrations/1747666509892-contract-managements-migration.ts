import { MigrationInterface, QueryRunner } from 'typeorm';

export class contractManagementsMigration1747666509892
  implements MigrationInterface
{
  name = 'contractManagementsMigration1747666509892';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "contract_managements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "description" text, "contract_number" character varying(255), "contract_amount" numeric NOT NULL DEFAULT '0', "comments" text, "start_date" TIMESTAMP NOT NULL, "endDate" TIMESTAMP NOT NULL, "is_recurring" boolean NOT NULL DEFAULT false, "soft_deleted_at" TIMESTAMP, "is_active" boolean NOT NULL DEFAULT true, "project_id" uuid NOT NULL, "preferred_supplier_id" uuid NOT NULL, "contact_user_id" uuid NOT NULL, CONSTRAINT "PK_d512c90b020443d4b97a544de30" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d5b477c7e84e77db4d9fc337c0" ON "contract_managements" ("project_id", "preferred_supplier_id", "contact_user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "contract_management_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "file_name" character varying NOT NULL, "file_path" text NOT NULL, "file_type" character varying NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "soft_deleted_at" TIMESTAMP, "comment" character varying, "recovered_at" TIMESTAMP, "contract_management_id" uuid NOT NULL, "deleted_by" uuid, "recovered_by" uuid, "uploaded_by" uuid NOT NULL, CONSTRAINT "PK_935b3cca8cba7d90a03ea576d84" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "contract_managements" ADD CONSTRAINT "FK_cbef62fbcfe1d5618f07fd7deb3" FOREIGN KEY ("project_id") REFERENCES "master_projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "contract_managements" ADD CONSTRAINT "FK_6fd51f14d66d37250819eba6639" FOREIGN KEY ("preferred_supplier_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "contract_managements" ADD CONSTRAINT "FK_42074176a9a16b30d5d3adf10cc" FOREIGN KEY ("contact_user_id") REFERENCES "authentication_user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "contract_management_documents" ADD CONSTRAINT "FK_5349284d02dcddc7c9ca4ada956" FOREIGN KEY ("contract_management_id") REFERENCES "contract_managements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "contract_management_documents" ADD CONSTRAINT "FK_b03709fd5d802d979cea75bd607" FOREIGN KEY ("deleted_by") REFERENCES "authentication_user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "contract_management_documents" ADD CONSTRAINT "FK_f727c9e3ae8e030d0372974e862" FOREIGN KEY ("recovered_by") REFERENCES "authentication_user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "contract_management_documents" ADD CONSTRAINT "FK_43c2eba4ecd93f0d8194fc7761b" FOREIGN KEY ("uploaded_by") REFERENCES "authentication_user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contract_management_documents" DROP CONSTRAINT "FK_43c2eba4ecd93f0d8194fc7761b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contract_management_documents" DROP CONSTRAINT "FK_f727c9e3ae8e030d0372974e862"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contract_management_documents" DROP CONSTRAINT "FK_b03709fd5d802d979cea75bd607"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contract_management_documents" DROP CONSTRAINT "FK_5349284d02dcddc7c9ca4ada956"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contract_managements" DROP CONSTRAINT "FK_42074176a9a16b30d5d3adf10cc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contract_managements" DROP CONSTRAINT "FK_6fd51f14d66d37250819eba6639"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contract_managements" DROP CONSTRAINT "FK_cbef62fbcfe1d5618f07fd7deb3"`,
    );
    await queryRunner.query(`DROP TABLE "contract_management_documents"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d5b477c7e84e77db4d9fc337c0"`,
    );
    await queryRunner.query(`DROP TABLE "contract_managements"`);
  }
}
