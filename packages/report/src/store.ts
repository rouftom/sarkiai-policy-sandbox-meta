/** Persistence for joint situation reports, so dossiers can be rebuilt later. */

import { MongoClient, type Collection, type Document } from 'mongodb'
import type { JointSituationReport } from '@sps/shared'
import { mongoPoolOptions } from '@sps/shared'

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
      this.client = new MongoClient(this.config.mongodbUri, mongoPoolOptions())
      await this.client.connect()
    }
    return this.client.db(this.config.dbName).collection(this.collectionName)
  }

  async saveReports(runId: string, reports: JointSituationReport[], userId?: string): Promise<void> {
    const collection = await this.collection()
    // Scoped delete: one operator's re-run must not erase another operator's
    // report for a colliding run id.
    await collection.deleteMany(userId ? { runId, userId } : { runId })
    if (reports.length) {
      await collection.insertMany(
        reports.map((report) => ({ ...report, ...(userId ? { userId } : {}) })),
      )
    }
  }

  async getReports(runId: string, userId?: string): Promise<JointSituationReport[]> {
    const collection = await this.collection()
    const filter = userId ? { runId, userId } : { runId }
    const docs = await collection.find(filter).sort({ tick: 1 }).toArray()
    return docs.map((doc) => {
      const { _id, userId: _userId, ...report } = doc
      return report as unknown as JointSituationReport
    })
  }

  async close(): Promise<void> {
    await this.client?.close()
    this.client = null
  }
}
