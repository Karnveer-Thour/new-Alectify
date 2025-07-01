import {
  OnQueueActive,
  OnQueueCompleted,
  Process,
  Processor,
} from '@nestjs/bull';
import { Job } from 'bull';
import { SparePartsService } from '../spare-parts.service';

@Processor('spareParts')
export class SparePartsConsumer {
  constructor(private readonly sparePartsService: SparePartsService) {}

  @Process({ name: 'sendSparePartsUpdateNotifications', concurrency: 5 })
  async sendSparePartsUpdateNotifications(job: Job) {
    try {
      // sendSparePartsUpdateNotifications
      await this.sparePartsService.sendSparePartsNotifications(
        job.data.projectSparePart,
        job.data.project,
        job.data.user,
        job.data.messageText,
      );
    } catch (error) {
      console.log('error when sendSparePartsUpdateNotifications: ', error);
    }
    return { done: true };
  }

  @Process({ name: 'sendSparePartsEmail', concurrency: 5 })
  async sendSparePartsEmail(job: Job) {
    try {
      // sendSparePartsUpdateNotifications
      await this.sparePartsService.sendSparePartsEmail(
        job.data.project,
        job.data.subject,
        job.data.emailBody,
      );
    } catch (error) {
      console.log('error when sendSparePartsUpdateNotifications: ', error);
    }
    return { done: true };
  }

  @OnQueueActive()
  onActive(job: Job<unknown>) {
    console.log(`Starting job ${job.id}: ${job.name}`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job<unknown>) {
    console.log(`Job ${job.id}: ${job.name} has been finished`);
  }
}
