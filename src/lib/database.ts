import { sql } from '@vercel/postgres'
import { ProcessedCustomer } from '@/types/customer'
import { Call, CallCampaign, CallStatus, CampaignStatus } from '@/types/call'

class Database {
  private static instance: Database
  
  private constructor() {
    // Vercel Postgres uses environment variables automatically
  }
  
  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database()
    }
    return Database.instance
  }
  
  async connect(): Promise<void> {
    // No need to manually connect with @vercel/postgres
  }
  
  async disconnect(): Promise<void> {
    // No need to manually disconnect with @vercel/postgres
  }
  
  // Customer operations
  async insertCustomer(customer: ProcessedCustomer): Promise<void> {
    await sql`
      INSERT INTO customers 
      (id, name, phone, reason, email, account_number, service_type, date_left, 
       matched_services, priority, call_eligible, created_at, updated_at)
      VALUES (${customer.id}, ${customer.name}, ${customer.phone}, ${customer.reason || null}, 
              ${customer.email || null}, ${customer.accountNumber || null}, 
              ${customer.serviceType || null}, ${customer.dateLeft || null}, 
              ${JSON.stringify(customer.matchedServices)}, ${customer.priority}, 
              ${customer.callEligible}, ${customer.createdAt.toISOString()}, ${customer.updatedAt.toISOString()})
      ON CONFLICT (phone) DO UPDATE SET
        name = EXCLUDED.name,
        reason = EXCLUDED.reason,
        matched_services = EXCLUDED.matched_services,
        updated_at = EXCLUDED.updated_at
    `
  }
  
  async insertCustomers(customers: ProcessedCustomer[]): Promise<void> {
    for (const customer of customers) {
      await this.insertCustomer(customer)
    }
  }
  
  async getCustomerById(id: string): Promise<ProcessedCustomer | null> {
    const result = await sql`SELECT * FROM customers WHERE id = ${id}`
    return result.rows[0] ? this.mapRowToCustomer(result.rows[0]) : null
  }
  
  async getCustomersByServices(services: string[]): Promise<ProcessedCustomer[]> {
    const result = await sql`
      SELECT * FROM customers 
      WHERE call_eligible = true 
      ORDER BY priority DESC, created_at ASC
    `
    
    return result.rows
      .map(row => this.mapRowToCustomer(row))
      .filter(customer => 
        customer.matchedServices.some(service => services.includes(service))
      )
  }
  
  // Campaign operations
  async insertCampaign(campaign: CallCampaign): Promise<void> {
    await sql`
      INSERT INTO campaigns 
      (id, name, status, total_calls, services, customer_count, 
       max_concurrent_calls, retry_max_retries, retry_delay, 
       retry_on_busy, retry_on_no_answer, retry_on_failed, 
       bot_script, created_by, created_at, updated_at)
      VALUES (${campaign.id}, ${campaign.name}, ${campaign.status}, ${campaign.totalCalls}, 
              ${JSON.stringify(campaign.services)}, ${campaign.customerCount}, 
              ${campaign.maxConcurrentCalls}, ${campaign.retrySettings.maxRetries}, 
              ${campaign.retrySettings.retryDelay}, ${campaign.retrySettings.retryOnBusy}, 
              ${campaign.retrySettings.retryOnNoAnswer}, ${campaign.retrySettings.retryOnFailed}, 
              ${campaign.botScript}, ${campaign.createdBy || null}, 
              ${campaign.createdAt.toISOString()}, ${campaign.updatedAt.toISOString()})
    `
  }
  
  async updateCampaignStatus(id: string, status: CampaignStatus): Promise<void> {
    await sql`
      UPDATE campaigns 
      SET status = ${status}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ${id}
    `
  }
  
  async getCampaignById(id: string): Promise<CallCampaign | null> {
    const result = await sql`SELECT * FROM campaigns WHERE id = ${id}`
    return result.rows[0] ? this.mapRowToCampaign(result.rows[0]) : null
  }
  
  // Call operations
  async insertCall(call: Call): Promise<void> {
    await sql`
      INSERT INTO calls 
      (id, customer_id, customer_name, customer_phone, campaign_id, status, 
       scheduled_at, max_retries, services, created_at, updated_at)
      VALUES (${call.id}, ${call.customerId}, ${call.customerName}, ${call.customerPhone}, 
              ${call.campaignId}, ${call.status}, ${call.scheduledAt.toISOString()}, ${call.maxRetries}, 
              ${JSON.stringify(call.services)}, ${call.createdAt.toISOString()}, ${call.updatedAt.toISOString()})
    `
  }
  
  async updateCallStatus(id: string, status: CallStatus, updates?: Partial<Call>): Promise<void> {
    await sql`
      UPDATE calls 
      SET status = ${status}, 
          updated_at = CURRENT_TIMESTAMP,
          twilio_sid = ${updates?.twilioSid || null},
          started_at = ${updates?.startedAt ? updates.startedAt.toISOString() : null},
          ended_at = ${updates?.endedAt ? updates.endedAt.toISOString() : null},
          duration = ${updates?.duration || null},
          transcript = ${updates?.transcript || null},
          error_message = ${updates?.errorMessage || null}
      WHERE id = ${id}
    `
  }
  
  async getCallsByStatus(status: CallStatus, limit = 100): Promise<Call[]> {
    const result = await sql`
      SELECT * FROM calls 
      WHERE status = ${status}
      ORDER BY scheduled_at ASC 
      LIMIT ${limit}
    `
    
    return result.rows.map(row => this.mapRowToCall(row))
  }
  
  async getCallsByCampaign(campaignId: string): Promise<Call[]> {
    const result = await sql`
      SELECT * FROM calls 
      WHERE campaign_id = ${campaignId}
      ORDER BY scheduled_at DESC
    `
    
    return result.rows.map(row => this.mapRowToCall(row))
  }
  
  // Helper methods
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
      matchedServices: row.matched_services || [],
      priority: row.priority,
      callEligible: row.call_eligible,
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
      services: row.services || [],
      customerCount: row.customer_count,
      startedAt: new Date(row.started_at || row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      estimatedDuration: row.estimated_duration,
      maxConcurrentCalls: row.max_concurrent_calls,
      retrySettings: {
        maxRetries: row.retry_max_retries,
        retryDelay: row.retry_delay,
        retryOnBusy: row.retry_on_busy,
        retryOnNoAnswer: row.retry_on_no_answer,
        retryOnFailed: row.retry_on_failed
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
      keyIssues: row.key_issues || [],
      resolution: row.resolution,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      services: row.services || [],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }
}

export default Database