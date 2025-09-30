import sqlite3 from 'sqlite3'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { Customer, ProcessedCustomer } from '@/types/customer'
import { Call, CallCampaign, CallStatus, CampaignStatus } from '@/types/call'

// SQLite database wrapper with async/await support
class DatabaseWrapper {
  private db: sqlite3.Database
  
  constructor(dbPath: string) {
    this.db = new sqlite3.Database(dbPath)
    
    // Promisify database methods
    this.run = promisify(this.db.run.bind(this.db))
    this.get = promisify(this.db.get.bind(this.db))
    this.all = promisify(this.db.all.bind(this.db))
  }
  
  run: (sql: string, params?: any[]) => Promise<sqlite3.RunResult>
  get: (sql: string, params?: any[]) => Promise<any>
  all: (sql: string, params?: any[]) => Promise<any[]>
  
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}

class Database {
  private static instance: Database
  private db: DatabaseWrapper | null = null
  private dbPath: string
  
  private constructor() {
    // Ensure database directory exists - use /tmp for serverless
    const dbDir = path.join('/tmp', 'database')
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    
    this.dbPath = process.env.DATABASE_PATH || path.join(dbDir, 'voice_bot.db')
  }
  
  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database()
    }
    return Database.instance
  }
  
  async connect(): Promise<void> {
    if (this.db) return
    
    this.db = new DatabaseWrapper(this.dbPath)
    await this.createTables()
  }
  
  async disconnect(): Promise<void> {
    if (this.db) {
      await this.db.close()
      this.db = null
    }
  }
  
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    
    // Customers table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        reason TEXT,
        email TEXT,
        account_number TEXT,
        service_type TEXT,
        date_left TEXT,
        matched_services TEXT,
        priority TEXT CHECK(priority IN ('high', 'medium', 'low')),
        call_eligible INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    // Campaigns table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT CHECK(status IN ('draft', 'running', 'paused', 'completed', 'cancelled', 'error')) DEFAULT 'draft',
        total_calls INTEGER DEFAULT 0,
        completed_calls INTEGER DEFAULT 0,
        successful_calls INTEGER DEFAULT 0,
        failed_calls INTEGER DEFAULT 0,
        services TEXT, -- JSON array
        customer_count INTEGER DEFAULT 0,
        started_at DATETIME,
        completed_at DATETIME,
        estimated_duration INTEGER, -- in seconds
        max_concurrent_calls INTEGER DEFAULT 5,
        retry_max_retries INTEGER DEFAULT 3,
        retry_delay INTEGER DEFAULT 5, -- minutes
        retry_on_busy INTEGER DEFAULT 1,
        retry_on_no_answer INTEGER DEFAULT 1,
        retry_on_failed INTEGER DEFAULT 1,
        bot_script TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    // Calls table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS calls (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        status TEXT CHECK(status IN ('pending', 'calling', 'ringing', 'answered', 'completed', 'failed', 'cancelled', 'voicemail', 'retry')) DEFAULT 'pending',
        twilio_sid TEXT,
        scheduled_at DATETIME NOT NULL,
        started_at DATETIME,
        ended_at DATETIME,
        duration INTEGER, -- in seconds
        transcript TEXT,
        summary TEXT,
        sentiment TEXT CHECK(sentiment IN ('positive', 'negative', 'neutral')),
        key_issues TEXT, -- JSON array
        resolution TEXT,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        services TEXT, -- JSON array
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers (id),
        FOREIGN KEY (campaign_id) REFERENCES campaigns (id)
      )
    `)
    
    // Create indexes for better performance
    await this.db.run('CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone)')
    await this.db.run('CREATE INDEX IF NOT EXISTS idx_customers_priority ON customers (priority)')
    await this.db.run('CREATE INDEX IF NOT EXISTS idx_calls_status ON calls (status)')
    await this.db.run('CREATE INDEX IF NOT EXISTS idx_calls_campaign ON calls (campaign_id)')
    await this.db.run('CREATE INDEX IF NOT EXISTS idx_calls_customer ON calls (customer_id)')
    await this.db.run('CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status)')
  }
  
  // Customer operations
  async insertCustomer(customer: ProcessedCustomer): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    
    await this.db.run(`
      INSERT OR REPLACE INTO customers 
      (id, name, phone, reason, email, account_number, service_type, date_left, 
       matched_services, priority, call_eligible, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      customer.id,
      customer.name,
      customer.phone,
      customer.reason,
      customer.email || null,
      customer.accountNumber || null,
      customer.serviceType || null,
      customer.dateLeft || null,
      JSON.stringify(customer.matchedServices),
      customer.priority,
      customer.callEligible ? 1 : 0,
      customer.createdAt.toISOString(),
      customer.updatedAt.toISOString()
    ])
  }
  
  async insertCustomers(customers: ProcessedCustomer[]): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    
    for (const customer of customers) {
      await this.insertCustomer(customer)
    }
  }
  
  async getCustomerById(id: string): Promise<ProcessedCustomer | null> {
    if (!this.db) throw new Error('Database not connected')
    
    const row = await this.db.get('SELECT * FROM customers WHERE id = ?', [id])
    return row ? this.mapRowToCustomer(row) : null
  }
  
  async getCustomersByServices(services: string[]): Promise<ProcessedCustomer[]> {
    if (!this.db) throw new Error('Database not connected')
    
    const rows = await this.db.all(`
      SELECT * FROM customers 
      WHERE call_eligible = 1 
      ORDER BY priority DESC, created_at ASC
    `)
    
    return rows
      .map(row => this.mapRowToCustomer(row))
      .filter(customer => {
        return customer.matchedServices.some(service => services.includes(service))
      })
  }
  
  // Campaign operations
  async insertCampaign(campaign: CallCampaign): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    
    await this.db.run(`
      INSERT INTO campaigns 
      (id, name, status, total_calls, services, customer_count, 
       max_concurrent_calls, retry_max_retries, retry_delay, 
       retry_on_busy, retry_on_no_answer, retry_on_failed, 
       bot_script, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.totalCalls,
      JSON.stringify(campaign.services),
      campaign.customerCount,
      campaign.maxConcurrentCalls,
      campaign.retrySettings.maxRetries,
      campaign.retrySettings.retryDelay,
      campaign.retrySettings.retryOnBusy ? 1 : 0,
      campaign.retrySettings.retryOnNoAnswer ? 1 : 0,
      campaign.retrySettings.retryOnFailed ? 1 : 0,
      campaign.botScript,
      campaign.createdBy || null,
      campaign.createdAt.toISOString(),
      campaign.updatedAt.toISOString()
    ])
  }
  
  async updateCampaignStatus(id: string, status: CampaignStatus): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    
    await this.db.run(`
      UPDATE campaigns 
      SET status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [status, id])
  }
  
  async getCampaignById(id: string): Promise<CallCampaign | null> {
    if (!this.db) throw new Error('Database not connected')
    
    const row = await this.db.get('SELECT * FROM campaigns WHERE id = ?', [id])
    return row ? this.mapRowToCampaign(row) : null
  }
  
  // Call operations
  async insertCall(call: Call): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    
    await this.db.run(`
      INSERT INTO calls 
      (id, customer_id, customer_name, customer_phone, campaign_id, status, 
       scheduled_at, max_retries, services, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      call.id,
      call.customerId,
      call.customerName,
      call.customerPhone,
      call.campaignId,
      call.status,
      call.scheduledAt.toISOString(),
      call.maxRetries,
      JSON.stringify(call.services),
      call.createdAt.toISOString(),
      call.updatedAt.toISOString()
    ])
  }
  
  async updateCallStatus(id: string, status: CallStatus, updates?: Partial<Call>): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    
    let sql = 'UPDATE calls SET status = ?, updated_at = CURRENT_TIMESTAMP'
    const params: any[] = [status]
    
    if (updates?.twilioSid) {
      sql += ', twilio_sid = ?'
      params.push(updates.twilioSid)
    }
    
    if (updates?.startedAt) {
      sql += ', started_at = ?'
      params.push(updates.startedAt.toISOString())
    }
    
    if (updates?.endedAt) {
      sql += ', ended_at = ?'
      params.push(updates.endedAt.toISOString())
    }
    
    if (updates?.duration) {
      sql += ', duration = ?'
      params.push(updates.duration)
    }
    
    if (updates?.transcript) {
      sql += ', transcript = ?'
      params.push(updates.transcript)
    }
    
    if (updates?.errorMessage) {
      sql += ', error_message = ?'
      params.push(updates.errorMessage)
    }
    
    sql += ' WHERE id = ?'
    params.push(id)
    
    await this.db.run(sql, params)
  }
  
  async getCallsByStatus(status: CallStatus, limit = 100): Promise<Call[]> {
    if (!this.db) throw new Error('Database not connected')
    
    const rows = await this.db.all(`
      SELECT * FROM calls 
      WHERE status = ? 
      ORDER BY scheduled_at ASC 
      LIMIT ?
    `, [status, limit])
    
    return rows.map(row => this.mapRowToCall(row))
  }
  
  async getCallsByCampaign(campaignId: string): Promise<Call[]> {
    if (!this.db) throw new Error('Database not connected')
    
    const rows = await this.db.all(`
      SELECT * FROM calls 
      WHERE campaign_id = ? 
      ORDER BY scheduled_at DESC
    `, [campaignId])
    
    return rows.map(row => this.mapRowToCall(row))
  }
  
  // Helper methods for mapping database rows to objects
  private mapRowToCustomer(row: any): ProcessedCustomer {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      reason: row.reason,
      email: row.email,
      accountNumber: row.account_number,
      serviceType: row.service_type,
      dateLeft: row.date_left,
      matchedServices: JSON.parse(row.matched_services || '[]'),
      priority: row.priority,
      callEligible: row.call_eligible === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }
  
  private mapRowToCampaign(row: any): CallCampaign {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      totalCalls: row.total_calls,
      completedCalls: row.completed_calls,
      successfulCalls: row.successful_calls,
      failedCalls: row.failed_calls,
      services: JSON.parse(row.services || '[]'),
      customerCount: row.customer_count,
      startedAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      estimatedDuration: row.estimated_duration,
      maxConcurrentCalls: row.max_concurrent_calls,
      retrySettings: {
        maxRetries: row.retry_max_retries,
        retryDelay: row.retry_delay,
        retryOnBusy: row.retry_on_busy === 1,
        retryOnNoAnswer: row.retry_on_no_answer === 1,
        retryOnFailed: row.retry_on_failed === 1
      },
      botScript: row.bot_script,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }
  
  private mapRowToCall(row: any): Call {
    return {
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      campaignId: row.campaign_id,
      status: row.status,
      twilioSid: row.twilio_sid,
      scheduledAt: new Date(row.scheduled_at),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      endedAt: row.ended_at ? new Date(row.ended_at) : undefined,
      duration: row.duration,
      transcript: row.transcript,
      summary: row.summary,
      sentiment: row.sentiment,
      keyIssues: row.key_issues ? JSON.parse(row.key_issues) : undefined,
      resolution: row.resolution,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      services: JSON.parse(row.services || '[]'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }
}

export default Database