import { BaseEntity } from '@common/entities/base.entity';
import { Organization } from 'modules/organizations/entities/organization.entity';
import { Project } from 'modules/projects/entities/project.entity';
import { User } from 'modules/users/entities/user.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { ContractManagementDocument } from './contract-management-document.entity';
import { ContractManagementStatusTypes } from '../models/contract-management-status-types.enum';

@Entity('contract_managements')
@Index(['project', 'organization', 'contactUser'])
export class ContractManagement extends BaseEntity<ContractManagement> {
  @ManyToOne(() => Project, (pro) => pro.id, { nullable: false })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne(() => Organization, (Organization) => Organization.id, {
    nullable: false,
  })
  @JoinColumn({ name: 'preferred_supplier_id' })
  organization: Organization;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

  @Column({
    name: 'contract_number',
    type: 'varchar',
    nullable: true,
    length: 255,
  })
  contractNumber: string;

  @Column({
    name: 'contract_amount',
    type: 'decimal',
    nullable: false,
    default: 0,
    transformer: {
      to: (value: number) => value, // stored directly in DB
      from: (value: string) => parseFloat(value), // string → number when reading from DB
    },
  })
  contractAmount: number;

  @Column({
    name: 'status',
    type:'enum',
    enum:ContractManagementStatusTypes,
    default: ContractManagementStatusTypes.OPEN,
  })
  status: ContractManagementStatusTypes;

  @Column({ name: 'comments', type: 'text', nullable: true })
  comments: string;

  @Column({
    name: 'start_date',
    type: 'timestamp',
    nullable: false,
  })
  startDate: Date;

  @Column({
    name: 'endDate',
    type: 'timestamp',
    nullable: false,
  })
  endDate: Date;

  @Column({
    name: 'is_recurring',
    type: 'bool',
    nullable: false,
    default: false,
  })
  isRecurring: boolean;

  @Column({
    name: 'soft_deleted_at',
    type: 'timestamp',
    nullable: true,
  })
  softDeletedAt: Date;

  @Column({ name: 'is_active', type: 'bool', nullable: false, default: true })
  isActive: boolean;

  @ManyToOne(() => User, (user) => user.id, { nullable: false })
  @JoinColumn({ name: 'contact_user_id' })
  contactUser: User;

  @OneToMany(
    () => ContractManagementDocument,
    (irDocument) => irDocument.contractManagement,
  )
  documents: ContractManagementDocument[];

  constructor(entity: Partial<ContractManagement>) {
    super(entity);
    Object.assign(this, entity);
  }
}
