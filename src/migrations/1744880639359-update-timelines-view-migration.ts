import { MigrationInterface, QueryRunner } from 'typeorm';

export class updateTimelinesViewMigration1744880639359
  implements MigrationInterface
{
  name = 'updateTimelinesViewMigration1744880639359';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "schema" = $3`,
      ['VIEW', 'timelines_view', 'public'],
    );
    await queryRunner.query(`DROP VIEW "timelines_view"`);
    await queryRunner.query(`CREATE VIEW "timelines_view" AS select preventive_maintenances.id as id, pm_type::text as type, work_title as name, pmas.asset_id as asset_id, NULL::uuid as area_id, status, due_date, detail, NULL::integer as quantity, NULL::uuid AS user_id, NULL::character varying AS user_first_name, NULL::character varying AS user_last_name, NULL::character varying AS user_email, preventive_maintenances.created_at, preventive_maintenances.updated_at, COUNT(comments.id) as comments_count from preventive_maintenances left join comments on preventive_maintenances.id::text = comments.reference_id left join preventive_maintenance_assets pmas on pmas.preventive_maintenance_id = preventive_maintenances.id where is_future = false group by preventive_maintenances.id, pmas.asset_id union select preventive_maintenances.id as id, pm_type::text as type, work_title as name, NULL::uuid as asset_id, pmar.area_id as area_id, status, due_date, detail, NULL::integer as quantity, NULL::uuid AS user_id, NULL::character varying AS user_first_name, NULL::character varying AS user_last_name, NULL::character varying AS user_email, preventive_maintenances.created_at, preventive_maintenances.updated_at, COUNT(comments.id) as comments_count from preventive_maintenances left join comments on preventive_maintenances.id::text = comments.reference_id left join preventive_maintenance_areas pmar on pmar.preventive_maintenance_id = preventive_maintenances.id where is_future = false group by preventive_maintenances.id, pmar.area_id union select project_spare_parts.id as id, 'SPARE_PART' as type, spare_parts.part_number as name, asset_id, area_id, null as status, moh.created_at as due_date, spare_parts.description as detail, quantity, authentication_user.id as user_id, authentication_user.first_name as user_first_name, authentication_user.last_name as user_last_name, authentication_user.email as user_email, moh.created_at, moh.updated_at, 0 as comments_count from manage_order_histories moh left join authentication_user on user_id = authentication_user.id left join project_spare_parts on project_spare_part_id = project_spare_parts.id left join spare_parts on project_spare_parts.spare_part_id = spare_parts.id where quantity_types = 'BORROW';
`);
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES (DEFAULT, $1, DEFAULT, $2, $3, $4)`,
      [
        'public',
        'VIEW',
        'timelines_view',
        "select preventive_maintenances.id as id, pm_type::text as type, work_title as name, pmas.asset_id as asset_id, NULL::uuid as area_id, status, due_date, detail, NULL::integer as quantity, NULL::uuid AS user_id, NULL::character varying AS user_first_name, NULL::character varying AS user_last_name, NULL::character varying AS user_email, preventive_maintenances.created_at, preventive_maintenances.updated_at, COUNT(comments.id) as comments_count from preventive_maintenances left join comments on preventive_maintenances.id::text = comments.reference_id left join preventive_maintenance_assets pmas on pmas.preventive_maintenance_id = preventive_maintenances.id where is_future = false group by preventive_maintenances.id, pmas.asset_id union select preventive_maintenances.id as id, pm_type::text as type, work_title as name, NULL::uuid as asset_id, pmar.area_id as area_id, status, due_date, detail, NULL::integer as quantity, NULL::uuid AS user_id, NULL::character varying AS user_first_name, NULL::character varying AS user_last_name, NULL::character varying AS user_email, preventive_maintenances.created_at, preventive_maintenances.updated_at, COUNT(comments.id) as comments_count from preventive_maintenances left join comments on preventive_maintenances.id::text = comments.reference_id left join preventive_maintenance_areas pmar on pmar.preventive_maintenance_id = preventive_maintenances.id where is_future = false group by preventive_maintenances.id, pmar.area_id union select project_spare_parts.id as id, 'SPARE_PART' as type, spare_parts.part_number as name, asset_id, area_id, null as status, moh.created_at as due_date, spare_parts.description as detail, quantity, authentication_user.id as user_id, authentication_user.first_name as user_first_name, authentication_user.last_name as user_last_name, authentication_user.email as user_email, moh.created_at, moh.updated_at, 0 as comments_count from manage_order_histories moh left join authentication_user on user_id = authentication_user.id left join project_spare_parts on project_spare_part_id = project_spare_parts.id left join spare_parts on project_spare_parts.spare_part_id = spare_parts.id where quantity_types = 'BORROW';",
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "schema" = $3`,
      ['VIEW', 'timelines_view', 'public'],
    );
    await queryRunner.query(`DROP VIEW "timelines_view"`);
    await queryRunner.query(`CREATE VIEW "timelines_view" AS SELECT
  preventive_maintenances.id as id, pm_type::text as type, work_title as name, asset_id, area_id, status, due_date, detail, null as quantity, null as user_id, null as user_first_name, null as user_last_name, null as user_email, preventive_maintenances.created_at, preventive_maintenances.updated_at, COUNT(comments.id) as comments_count  
  FROM preventive_maintenances left join comments on preventive_maintenances.id::text = comments.reference_id where is_future = false group by preventive_maintenances.id
  UNION
  SELECT project_spare_parts.id as id, 'SPARE_PART' as type, spare_parts.part_number as name, asset_id, null as area_id, null as status, moh.created_at as due_date, spare_parts.description as detail, quantity,authentication_user.id as user_id,authentication_user.first_name as user_first_name, authentication_user.last_name as user_last_name, authentication_user.email as user_email,moh.created_at, moh.updated_at, 0 as comments_count
  FROM manage_order_histories moh
  left join authentication_user on user_id = authentication_user.id 
  left join project_spare_parts on project_spare_part_id = project_spare_parts.id 
  left join spare_parts  on project_spare_parts.spare_part_id  = spare_parts.id 
  where quantity_types = 'BORROW';`);
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES (DEFAULT, $1, DEFAULT, $2, $3, $4)`,
      [
        'public',
        'VIEW',
        'timelines_view',
        "SELECT\n  preventive_maintenances.id as id, pm_type::text as type, work_title as name, asset_id, area_id, status, due_date, detail, null as quantity, null as user_id, null as user_first_name, null as user_last_name, null as user_email, preventive_maintenances.created_at, preventive_maintenances.updated_at, COUNT(comments.id) as comments_count  \n  FROM preventive_maintenances left join comments on preventive_maintenances.id::text = comments.reference_id where is_future = false group by preventive_maintenances.id\n  UNION\n  SELECT project_spare_parts.id as id, 'SPARE_PART' as type, spare_parts.part_number as name, asset_id, null as area_id, null as status, moh.created_at as due_date, spare_parts.description as detail, quantity,authentication_user.id as user_id,authentication_user.first_name as user_first_name, authentication_user.last_name as user_last_name, authentication_user.email as user_email,moh.created_at, moh.updated_at, 0 as comments_count\n  FROM manage_order_histories moh\n  left join authentication_user on user_id = authentication_user.id \n  left join project_spare_parts on project_spare_part_id = project_spare_parts.id \n  left join spare_parts  on project_spare_parts.spare_part_id  = spare_parts.id \n  where quantity_types = 'BORROW';",
      ],
    );
  }
}
