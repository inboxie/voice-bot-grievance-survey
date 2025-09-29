import { NextRequest, NextResponse } from 'next/server'
import { CallOrchestrator } from '@/lib/call-orchestrator'
import { ApiResponse, StartCampaignRequest, StartCampaignResponse } from '@/types/api'
import { ProcessedCustomer } from '@/types/customer'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: StartCampaignRequest = await request.json()
    
    // Validate required fields
    if (!body.customers || !Array.isArray(body.customers) || body.customers.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'No customers provided',
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    if (!body.services || !Array.isArray(body.services) || body.services.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'No services selected',
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    // Validate customer data - only name and phone required now
    const invalidCustomers = body.customers.filter(customer => 
      !customer.name || !customer.phone
    )
    
    if (invalidCustomers.length > 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `${invalidCustomers.length} customers have missing required data (name or phone)`,
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    // Validate services
    const validServices = [
      'credit-card', 'personal-banking', 'loans', 'mortgage', 
      'business-banking', 'investment', 'mobile-online', 'customer-service'
    ]
    
    const invalidServices = body.services.filter(service => !validServices.includes(service))
    if (invalidServices.length > 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `Invalid services: ${invalidServices.join(', ')}`,
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    // Convert customers to ProcessedCustomer format
    const processedCustomers: ProcessedCustomer[] = body.customers.map(customer => ({
      id: uuidv4(),
      name: customer.name.trim(),
      phone: customer.phone.trim(),
      reason: customer.reason?.trim(), // Optional now
      matchedServices: body.services, // Use selected services directly
      priority: 'medium', // Default priority
      callEligible: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }))
    
    // All customers are eligible now (no filtering by reason)
    const eligibleCustomers = processedCustomers
    
    if (eligibleCustomers.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'No eligible customers found.',
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    // Validate environment variables
    const requiredEnvVars = [
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN', 
      'TWILIO_PHONE_NUMBER',
      'OPENAI_API_KEY'
    ]
    
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar])
    if (missingEnvVars.length > 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `Missing required configuration: ${missingEnvVars.join(', ')}`,
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }
    
    // Create campaign configuration
    const campaignConfig = {
      name: `Campaign ${new Date().toLocaleString()}`,
      services: body.services,
      customers: eligibleCustomers,
      maxConcurrentCalls: Math.min(body.settings?.maxConcurrentCalls || 5, 10), // Max 10 concurrent calls
      retrySettings: {
        maxRetries: body.settings?.retrySettings?.maxRetries || 3,
        retryDelay: Math.max(body.settings?.retrySettings?.retryDelay || 5, 1), // Min 1 minute delay
        retryOnBusy: true,
        retryOnNoAnswer: true,
        retryOnFailed: true
      },
      botScript: body.settings?.botScript || generateDefaultBotScript()
    }
    
    // Start the campaign
    const orchestrator = new CallOrchestrator()
    const result = await orchestrator.startCampaign(campaignConfig)
    
    // Calculate estimated duration (rough estimate: 3-5 minutes per call)
    const avgCallDuration = 4 * 60 // 4 minutes in seconds
    const estimatedDuration = Math.ceil(
      (eligibleCustomers.length * avgCallDuration) / campaignConfig.maxConcurrentCalls
    )
    
    const response: StartCampaignResponse = {
      campaignId: result.campaignId,
      callsScheduled: result.callsScheduled,
      estimatedDuration,
      status: 'running'
    }
    
    return NextResponse.json<ApiResponse<StartCampaignResponse>>({
      success: true,
      data: response,
      message: `Campaign started successfully. ${result.callsScheduled} calls scheduled for ${eligibleCustomers.length} customers.`,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Start campaign API error:', error)
    
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start campaign',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

/**
 * Generate default bot script
 */
function generateDefaultBotScript(): string {
  const bankName = process.env.BANK_NAME || 'Your Bank'
  const botName = process.env.BOT_NAME || 'Customer Care Assistant'
  
  return `You are ${botName} from ${bankName}. Your role is to listen empathetically to customer feedback about their experience. Be understanding, ask follow-up questions, and make them feel heard. Do not try to solve problems - just gather their feedback and understand their perspective.`
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json<ApiResponse<null>>({
    success: false,
    error: 'Method not allowed. Use POST to start a campaign.',
    timestamp: new Date().toISOString()
  }, { status: 405 })
}

export async function PUT() {
  return NextResponse.json<ApiResponse<null>>({
    success: false,
    error: 'Method not allowed',
    timestamp: new Date().toISOString()
  }, { status: 405 })
}

export async function DELETE() {
  return NextResponse.json<ApiResponse<null>>({
    success: false,
    error: 'Method not allowed',
    timestamp: new Date().toISOString()
  }, { status: 405 })
}