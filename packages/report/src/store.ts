/** Persistence for joint situation reports, so dossiers can be rebuilt later. */

import { MongoClient, type Collection, type Document } from 'mongodb'
import type { JointSituationReport } from '@sps/shared'

export interface ReportStoreConfig {
  mongodbUri: string
  dbName: string
  collection?: string
}

export class ReportStore {
  private client: MongoClient | null = null
  private readonly collectionName: string

  constructor(private readonly config: ReportStoreConfig) {
    this.collectionName = config.collection ?? 'joint_reports'
  }

  private async collection(): Promise<Collection<Document>> {
    if (!this.client) {
      this.client = new MongoClient(this.config.mongodbUri)
      await this.client.connect()
    }
    return this.client.db(this.config.dbName).collection(this.collectionName)
  }

  async saveReports(runId: string, reports: JointSituationReport[]): Promise<void> {
    const collection = await this.collection()
    await collection.deleteMany({ runId })
    if (reports.length) {
      await collection.insertMany(reports.map((report) => ({ ...report })))
    }
  }

  async getReports(runId: string): Promise<JointSituationReport[]> {
    const collection = await this.collection()
    const docs = await collection.find({ runId }).sort({ tick: 1 }).toArray()
    return docs.map((doc) => {
      const { _id, ...report } = doc
      return report as unknown as JointSituationReport
    })
  }

  async close(): Promise<void> {
    await this.client?.close()
    this.client = null
  }
}
