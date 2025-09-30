import { createClient } from '@supabase/supabase-js'
import { ProcessedCustomer } from '@/types/customer'
import { Call, CallCampaign, CallStatus, CampaignStatus } from '@/types/call'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qocnqfblhtgppiauthta.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseKey)

class Database {
  private static instance: Database
  
  private constructor() {}
  
  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database()
    }
    return Database.instance
  }
  
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  
  async insertCustomer(customer: ProcessedCustomer): Promise<void> {
    const { error } = await supabase
      .from('customers')
      .upsert({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        reason: customer.reason,
        email: customer.email,
        account_number: customer.accountNumber,
        service_type: customer.serviceType,
        date_left: customer.dateLeft,
        matched_services: customer.matchedServices,
        priority: customer.priority,
        call_eligible: customer.callEligible,
        created_at: customer.createdAt.toISOString(),
        updated_at: customer.updatedAt.toISOString()
      }, {
        onConflict: 'phone'
      })
    
    if (error) throw error
  }
  
  async insertCustomers(customers: ProcessedCustomer[]): Promise<void> {
    for (const customer of customers) {
      await this.insertCustomer(customer)
    }
  }
  
  async getCustomerById(id: string): Promise<ProcessedCustomer | null> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) throw error
    return data ? this.mapRowToCustomer(data) : null
  }
  
  async getCustomersByServices(services: string[]): Promise<ProcessedCustomer[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('call_eligible', true)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
    
    if (error) throw error
    
    return (data || [])
      .map(row => this.mapRowToCustomer(row))
      .filter(customer => 
        customer.matchedServices.some(service => services.includes(service))
      )
  }
  
  async insertCampaign(campaign: CallCampaign): Promise<void> {
    const { error } = await supabase
      .from('campaigns')
      .insert({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        total_calls: campaign.totalCalls,
        services: campaign.services,
        customer_count: campaign.customerCount,
        max_concurrent_calls: campaign.maxConcurrentCalls,
        retry_max_retries: campaign.retrySettings.maxRetries,
        retry_delay: campaign.retrySettings.retryDelay,
        retry_on_busy: campaign.retrySettings.retryOnBusy,
        retry_on_no_answer: campaign.retrySettings.retryOnNoAnswer,
        retry_on_failed: campaign.retrySettings.retryOnFailed,
        bot_script: campaign.botScript,
        created_by: campaign.createdBy,
        created_at: campaign.createdAt.toISOString(),
        updated_at: campaign.updatedAt.toISOString()
      })
    
    if (error) throw error
  }
  
  async updateCampaignStatus(id: string, status: CampaignStatus): Promise<void> {
    const { error } = await supabase
      .from('campaigns')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
    
    if (error) throw error
  }
  
  async getCampaignById(id: string): Promise<CallCampaign | null> {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) throw error
    return data ? this.mapRowToCampaign(data) : null
  }
  
  async insertCall(call: Call): Promise<void> {
    const { error } = await supabase
      .from('calls')
      .insert({
        id: call.id,
        customer_id: call.customerId,
        customer_name: call.customerName,
        customer_phone: call.customerPhone,
        campaign_id: call.campaignId,
        status: call.status,
        scheduled_at: call.scheduledAt.toISOString(),
        max_retries: call.maxRetries,
        services: call.services,
        created_at: call.createdAt.toISOString(),
        updated_at: call.updatedAt.toISOString()
      })
    
    if (error) throw error
  }
  
  async getCallById(id: string): Promise<Call | null> {
    const { data, error } = await supabase
      .from('calls')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      console.error('Error fetching call:', error)
      return null
    }
    
    return data ? this.mapRowToCall(data) : null
  }
  
  async updateCallStatus(id: string, status: CallStatus, updates?: Partial<Call>): Promise<void> {
    const { error } = await supabase
      .from('calls')
      .update({
        status,
        updated_at: new Date().toISOString(),
        twilio_sid: updates?.twilioSid,
        started_at: updates?.startedAt?.toISOString(),
        ended_at: updates?.endedAt?.toISOString(),
        duration: updates?.duration,
        transcript: updates?.transcript,
        error_message: updates?.errorMessage
      })
      .eq('id', id)
    
    if (error) throw error
  }
  
  async getCallsByStatus(status: CallStatus, limit = 100): Promise<Call[]> {
    const { data, error } = await supabase
      .from('calls')
      .select('*')
      .eq('status', status)
      .order('scheduled_at', { ascending: true })
      .limit(limit)
    
    if (error) throw error
    return (data || []).map(row => this.mapRowToCall(row))
  }
  
  async getCallsByCampaign(campaignId: string): Promise<Call[]> {
    const { data, error } = await supabase
      .from('calls')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('scheduled_at', { ascending: false })
    
    if (error) throw error
    return (data || []).map(row => this.mapRowToCall(row))
  }
  
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