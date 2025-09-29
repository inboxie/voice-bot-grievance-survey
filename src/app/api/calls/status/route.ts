import { NextRequest, NextResponse } from 'next/server'
import { CallOrchestrator } from '@/lib/call-orchestrator'
import Database from '@/lib/database'
import { ApiResponse, CallStatusResponse, PaginatedResponse } from '@/types/api'
import { Call, CallStatus } from '@/types/call'

/**
 * Get call status and campaign progress
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const campaignId = url.searchParams.get('campaignId')
    const callId = url.searchParams.get('callId')
    const status = url.searchParams.get('status') as CallStatus | null
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const sortBy = url.searchParams.get('sortBy') || 'scheduledAt'
    const sortOrder = url.searchParams.get('sortOrder') || 'desc'
    
    // Validate parameters
    if (limit > 500) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Limit cannot exceed 500',
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    const db = Database.getInstance()
    await db.connect()
    
    // Handle single call status request
    if (callId) {
      const calls = await db.getCallsByCampaign('')
      const call = calls.find(c => c.id === callId)
      
      if (!call) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Call not found',
          timestamp: new Date().toISOString()
        }, { status: 404 })
      }
      
      return NextResponse.json<ApiResponse<any>>({
        success: true,
        data: {
          call: formatCallForResponse(call),
          campaign: await getCampaignSummary(call.campaignId)
        },
        timestamp: new Date().toISOString()
      })
    }
    
    // Handle campaign-specific status request
    if (campaignId) {
      const orchestrator = new CallOrchestrator()
      const campaignStatus = await orchestrator.getCampaignStatus(campaignId)
      
      if (!campaignStatus) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Campaign not found',
          timestamp: new Date().toISOString()
        }, { status: 404 })
      }
      
      const calls = await db.getCallsByCampaign(campaignId)
      
      // Apply status filter
      const filteredCalls = status 
        ? calls.filter(call => call.status === status)
        : calls
      
      // Apply sorting
      const sortedCalls = sortCalls(filteredCalls, sortBy, sortOrder)
      
      // Apply pagination
      const paginatedCalls = sortedCalls.slice(offset, offset + limit)
      
      const response: CallStatusResponse = {
        calls: paginatedCalls.map(formatCallForResponse),
        pagination: {
          total: filteredCalls.length,
          limit,
          offset,
          hasMore: offset + limit < filteredCalls.length
        },
        summary: {
          totalCalls: calls.length,
          completedCalls: calls.filter(c => c.status === 'completed').length,
          failedCalls: calls.filter(c => ['failed', 'cancelled'].includes(c.status)).length,
          inProgressCalls: calls.filter(c => ['calling', 'ringing', 'answered'].includes(c.status)).length
        }
      }
      
      return NextResponse.json<ApiResponse<CallStatusResponse>>({
        success: true,
        data: response,
        message: `Campaign ${campaignId} status retrieved`,
        timestamp: new Date().toISOString()
      })
    }
    
    // Handle general status request (all campaigns)
    const allCalls = status 
      ? await db.getCallsByStatus(status, limit + offset)
      : await getAllCalls(limit + offset)
    
    // Apply sorting and pagination
    const sortedCalls = sortCalls(allCalls, sortBy, sortOrder)
    const paginatedCalls = sortedCalls.slice(offset, offset + limit)
    
    // Get summary statistics
    const summary = await getOverallSummary()
    
    const response: CallStatusResponse = {
      calls: paginatedCalls.map(formatCallForResponse),
      pagination: {
        total: allCalls.length,
        limit,
        offset,
        hasMore: offset + limit < allCalls.length
      },
      summary
    }
    
    return NextResponse.json<ApiResponse<CallStatusResponse>>({
      success: true,
      data: response,
      message: 'Call status retrieved successfully',
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Call status API error:', error)
    
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve call status',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

/**
 * Update call status (for manual intervention)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { callId, status, reason } = body
    
    if (!callId || !status) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Missing required fields: callId and status',
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    // Validate status
    const validStatuses: CallStatus[] = [
      'pending', 'calling', 'ringing', 'answered', 'completed', 'failed', 'cancelled', 'voicemail', 'retry'
    ]
    
    if (!validStatuses.includes(status)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    const db = Database.getInstance()
    await db.connect()
    
    // Update call status
    const updates: Partial<Call> = {}
    if (reason) {
      updates.errorMessage = reason
    }
    
    if (status === 'completed') {
      updates.endedAt = new Date()
    }
    
    await db.updateCallStatus(callId, status, updates)
    
    return NextResponse.json<ApiResponse<{ callId: string; status: CallStatus }>>({
      success: true,
      data: { callId, status },
      message: `Call status updated to ${status}`,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Call status update error:', error)
    
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update call status',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

/**
 * Cancel calls (bulk operation)
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { campaignId, callIds } = body
    
    if (!campaignId && (!callIds || !Array.isArray(callIds))) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Must provide either campaignId or array of callIds',
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    const orchestrator = new CallOrchestrator()
    
    if (campaignId) {
      // Cancel entire campaign
      await orchestrator.cancelCampaign(campaignId)
      
      return NextResponse.json<ApiResponse<{ campaignId: string }>>({
        success: true,
        data: { campaignId },
        message: 'Campaign cancelled successfully',
        timestamp: new Date().toISOString()
      })
    } else {
      // Cancel specific calls
      const db = Database.getInstance()
      await db.connect()
      
      let cancelledCount = 0
      
      for (const callId of callIds) {
        try {
          await db.updateCallStatus(callId, 'cancelled')
          cancelledCount++
        } catch (error) {
          console.error(`Failed to cancel call ${callId}:`, error)
        }
      }
      
      return NextResponse.json<ApiResponse<{ cancelledCount: number; totalRequested: number }>>({
        success: true,
        data: { cancelledCount, totalRequested: callIds.length },
        message: `${cancelledCount} calls cancelled successfully`,
        timestamp: new Date().toISOString()
      })
    }
    
  } catch (error) {
    console.error('Call cancellation error:', error)
    
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel calls',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

/**
 * Format call object for API response
 */
function formatCallForResponse(call: Call) {
  return {
    id: call.id,
    customerName: call.customerName,
    customerPhone: call.customerPhone,
    status: call.status,
    scheduledAt: call.scheduledAt.toISOString(),
    startedAt: call.startedAt?.toISOString(),
    endedAt: call.endedAt?.toISOString(),
    duration: call.duration,
    transcript: call.transcript,
    summary: call.summary,
    sentiment: call.sentiment,
    keyIssues: call.keyIssues,
    errorMessage: call.errorMessage,
    retryCount: call.retryCount,
    maxRetries: call.maxRetries,
    services: call.services,
    campaignId: call.campaignId
  }
}

/**
 * Sort calls by specified field and order
 */
function sortCalls(calls: Call[], sortBy: string, sortOrder: string): Call[] {
  return calls.sort((a, b) => {
    let aValue: any
    let bValue: any
    
    switch (sortBy) {
      case 'scheduledAt':
        aValue = a.scheduledAt.getTime()
        bValue = b.scheduledAt.getTime()
        break
      case 'startedAt':
        aValue = a.startedAt?.getTime() || 0
        bValue = b.startedAt?.getTime() || 0
        break
      case 'duration':
        aValue = a.duration || 0
        bValue = b.duration || 0
        break
      case 'customerName':
        aValue = a.customerName.toLowerCase()
        bValue = b.customerName.toLowerCase()
        break
      case 'status':
        aValue = a.status
        bValue = b.status
        break
      default:
        aValue = a.scheduledAt.getTime()
        bValue = b.scheduledAt.getTime()
    }
    
    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : aValue < bValue ? -1 : 0
    } else {
      return aValue < bValue ? 1 : aValue > bValue ? -1 : 0
    }
  })
}

/**
 * Get all calls with limit
 */
async function getAllCalls(limit: number): Promise<Call[]> {
  const db = Database.getInstance()
  
  // Get calls from all statuses
  const statuses: CallStatus[] = ['pending', 'calling', 'ringing', 'answered', 'completed', 'failed', 'cancelled', 'voicemail', 'retry']
  const allCalls: Call[] = []
  
  for (const status of statuses) {
    const calls = await db.getCallsByStatus(status, Math.ceil(limit / statuses.length))
    allCalls.push(...calls)
  }
  
  return allCalls.slice(0, limit)
}

/**
 * Get campaign summary
 */
async function getCampaignSummary(campaignId: string) {
  const db = Database.getInstance()
  const campaign = await db.getCampaignById(campaignId)
  const calls = await db.getCallsByCampaign(campaignId)
  
  return {
    id: campaign?.id,
    name: campaign?.name,
    status: campaign?.status,
    totalCalls: calls.length,
    completedCalls: calls.filter(c => c.status === 'completed').length,
    failedCalls: calls.filter(c => ['failed', 'cancelled'].includes(c.status)).length,
    inProgressCalls: calls.filter(c => ['calling', 'ringing', 'answered'].includes(c.status)).length
  }
}

/**
 * Get overall summary statistics
 */
async function getOverallSummary() {
  const db = Database.getInstance()
  
  const pendingCalls = await db.getCallsByStatus('pending', 1000)
  const completedCalls = await db.getCallsByStatus('completed', 1000)
  const failedCalls = await db.getCallsByStatus('failed', 1000)
  const callingCalls = await db.getCallsByStatus('calling', 1000)
  const ringingCalls = await db.getCallsByStatus('ringing', 1000)
  const answeredCalls = await db.getCallsByStatus('answered', 1000)
  
  const totalCalls = pendingCalls.length + completedCalls.length + failedCalls.length + 
                   callingCalls.length + ringingCalls.length + answeredCalls.length
  
  return {
    totalCalls,
    completedCalls: completedCalls.length,
    failedCalls: failedCalls.length,
    inProgressCalls: callingCalls.length + ringingCalls.length + answeredCalls.length
  }
}

// Handle other methods
export async function POST() {
  return NextResponse.json<ApiResponse<null>>({
    success: false,
    error: 'Method not allowed. Use GET to retrieve call status.',
    timestamp: new Date().toISOString()
  }, { status: 405 })
}