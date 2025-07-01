import { AfterLoad, ViewColumn, ViewEntity } from 'typeorm';
import { S3 } from '@common/helpers/s3';

const {
  env: {
    AWS_S3_BUCKET_NAME,
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_S3_REGION,
  },
} = process;

const s3 = new S3(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_REGION);

@ViewEntity({
  expression: `SELECT preventive_maintenances.id AS id, task_category::text AS type, work_title AS name, image_url as image_url, pmas.asset_id AS asset_id, NULL::uuid AS area_id, status, due_date, detail, NULL::INTEGER AS quantity, NULL::uuid AS user_id, NULL::CHARACTER VARYING AS user_first_name, NULL::CHARACTER VARYING AS user_last_name, NULL::CHARACTER VARYING AS user_email, preventive_maintenances.created_at, preventive_maintenances.updated_at, count(comments.id) AS comments_count FROM preventive_maintenances LEFT JOIN comments ON preventive_maintenances.ID::text = comments.reference_id LEFT JOIN preventive_maintenance_assets pmas ON pmas.preventive_maintenance_id = preventive_maintenances.id WHERE is_future = FALSE GROUP BY preventive_maintenances.id, pmas.asset_id UNION SELECT preventive_maintenances.id AS id, task_category::text AS type, work_title AS name, image_url as image_url, NULL::uuid AS asset_id, pmar.area_id AS area_id, status, due_date, detail, NULL::INTEGER AS quantity, NULL::uuid AS user_id, NULL::CHARACTER VARYING AS user_first_name, NULL::CHARACTER VARYING AS user_last_name, NULL::CHARACTER VARYING AS user_email, preventive_maintenances.created_at, preventive_maintenances.updated_at, count(comments.id) AS comments_count FROM preventive_maintenances LEFT JOIN comments ON preventive_maintenances.ID::text = comments.reference_id LEFT JOIN preventive_maintenance_areas pmar ON pmar.preventive_maintenance_id = preventive_maintenances.id WHERE is_future = FALSE GROUP BY preventive_maintenances.id, pmar.area_id UNION SELECT project_spare_parts.id AS id, 'SPARE_PART' AS type, spare_parts.part_number AS name, spare_parts.image_url as image_url, asset_id, area_id, NULL AS status, moh.created_at AS due_date, spare_parts.description AS detail, quantity, authentication_user.id AS user_id, authentication_user.first_name AS user_first_name, authentication_user.last_name AS user_last_name, authentication_user.email AS user_email, moh.created_at, moh.updated_at, 0 AS comments_count FROM manage_order_histories moh LEFT JOIN authentication_user ON user_id = authentication_user.id LEFT JOIN project_spare_parts ON project_spare_part_id = project_spare_parts.id LEFT JOIN spare_parts ON project_spare_parts.spare_part_id = spare_parts.id WHERE quantity_types = 'BORROW';
`,
  name: 'timelines_view',
})
export class TimelinesView {
  @ViewColumn({
    name: 'id',
  })
  id: string;

  @ViewColumn()
  type: string;

  @ViewColumn()
  name: string;

  @ViewColumn({
    name: 'image_url',
  })
  imageUrl: string;

  @ViewColumn({
    name: 'asset_id',
  })
  assetId: string;

  @ViewColumn({
    name: 'area_id',
  })
  areaId: string;

  @ViewColumn({
    name: 'status',
  })
  status: string;

  @ViewColumn({
    name: 'due_date',
  })
  dueDate: string;

  @ViewColumn({
    name: 'detail',
  })
  detail: string;

  @ViewColumn({
    name: 'quantity',
  })
  quantity: number;

  @ViewColumn({
    name: 'user_id',
  })
  userId: string;

  @ViewColumn({
    name: 'user_first_name',
  })
  userFirstName: string;

  @ViewColumn({
    name: 'user_last_name',
  })
  userLastName: string;

  @ViewColumn({
    name: 'user_email',
  })
  userEmail: string;

  @ViewColumn({
    name: 'comments_count',
  })
  commentsCount: number;

  @ViewColumn({
    name: 'created_at',
  })
  createdAt: Date;

  @ViewColumn({
    name: 'updated_at',
  })
  updatedAt: Date;

  @AfterLoad()
  async populateSignedURLs() {
    if (this.imageUrl) {
      const signedUrl = await s3.privateSignedUrl(
        AWS_S3_BUCKET_NAME,
        this.imageUrl,
        604800,
      );
      this.imageUrl = signedUrl;
    } else {
      this.imageUrl = this.imageUrl;
    }
  }
}
