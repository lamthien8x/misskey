/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Column, Index, PrimaryColumn, JoinColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('paid_follow')
export class MiPaidFollow {
  @PrimaryColumn(id())
  public id: string;

  @Column({ ...id() })
  public followerId: MiUser['id'];

  @Column({ ...id() })
  public followeeId: MiUser['id'];

  @ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'followerId' })
  public follower: MiUser | null;

  @ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'followeeId' })
  public followee: MiUser | null;

  @Column('integer', { comment: 'Paid amount for 30 days follow subscription.' })
  public amount: number;

  @Column('timestamp with time zone', { default: () => 'now()' })
  public createdAt: Date;

  @Index()
  @Column('timestamp with time zone')
  public expiresAt: Date;

  constructor(data: Partial<MiPaidFollow>) {
    if (data == null) return;
    for (const [k, v] of Object.entries(data)) {
      (this as any)[k] = v;
    }
  }
}