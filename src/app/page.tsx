'use client'

import { useState } from 'react'
import FileUpload from '@/components/FileUpload'
import ServiceSelector from '@/components/ServiceSelector'

export default function HomePage() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [campaignStatus, setCampaignStatus] = useState<string>('')

  const handleFileUpload = async (file: File) => {
    setUploadedFile(file)
    setIsProcessing(true)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        throw new Error('Upload failed')
      }
      
      const data = await response.json()
      setCustomers(data.data.customers)
      setCampaignStatus(`Uploaded ${data.data.customers.length} customers successfully`)
    } catch (error) {
      setCampaignStatus('Upload failed. Please try again.')
      console.error('Upload error:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleStartCampaign = async () => {
    if (!customers.length || !selectedServices.length) {
      setCampaignStatus('Please upload customers and select services first')
      return
    }

    setIsProcessing(true)
    setCampaignStatus('Starting call campaign...')

    try {
      const response = await fetch('/api/calls/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customers: customers,
          services: selectedServices,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to start campaign')
      }

      const data = await response.json()
      setCampaignStatus(`Campaign started! ${data.data.callsScheduled} calls scheduled.`)
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 2000)
      
    } catch (error) {
      setCampaignStatus('Failed to start campaign. Please try again.')
      console.error('Campaign start error:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Customer Grievance Voice Survey
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Upload your customer data and select which services to target for automated voice surveys. 
          Our AI bot will call customers empathetically to understand their concerns.
        </p>
      </div>

      {/* Status Message */}
      {campaignStatus && (
        <div className={`card ${campaignStatus.includes('failed') || campaignStatus.includes('Failed') 
          ? 'border-error-200 bg-error-50' 
          : 'border-success-200 bg-success-50'
        }`}>
          <p className={`text-sm font-medium ${
            campaignStatus.includes('failed') || campaignStatus.includes('Failed')
              ? 'text-error-800' 
              : 'text-success-800'
          }`}>
            {campaignStatus}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Step 1: File Upload */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Step 1: Upload Customer Data
          </h2>
          <p className="text-gray-600 mb-6">
            Upload an Excel file with customer information. Required columns: Name and Phone Number
          </p>
          
          <FileUpload 
            onFileSelect={handleFileUpload} 
            isProcessing={isProcessing}
          />
          
          {customers.length > 0 && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Uploaded Data Preview:</h3>
              <p className="text-sm text-gray-600 mb-2">
                {customers.length} customers loaded
              </p>
              <div className="max-h-32 overflow-y-auto">
                {customers.slice(0, 3).map((customer: any, index: number) => (
                  <div key={index} className="text-xs text-gray-500 border-b border-gray-200 py-1">
                    {customer.name} - {customer.phone}
                  </div>
                ))}
                {customers.length > 3 && (
                  <p className="text-xs text-gray-400 py-1">
                    ...and {customers.length - 3} more
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Service Selection */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Step 2: Select Target Services
          </h2>
          <p className="text-gray-600 mb-6">
            Choose which banking services to focus the survey on. The bot will ask customers about these specific services.
          </p>
          
          <ServiceSelector 
            selectedServices={selectedServices}
            onServicesChange={setSelectedServices}
          />
        </div>
      </div>

      {/* Start Campaign Button */}
      {customers.length > 0 && selectedServices.length > 0 && (
        <div className="text-center">
          <button
            onClick={handleStartCampaign}
            disabled={isProcessing}
            className={`btn-primary text-lg px-8 py-3 ${
              isProcessing ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isProcessing ? 'Starting Campaign...' : 'Start Voice Survey Campaign'}
          </button>
          <p className="text-sm text-gray-500 mt-2">
            This will begin calling {customers.length} customers for the selected services
          </p>
        </div>
      )}

      {/* Instructions */}
      <div className="card bg-blue-50 border-blue-200">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">
          How it works:
        </h3>
        <ol className="list-decimal list-inside space-y-2 text-blue-800">
          <li>Upload Excel file with customer phone numbers and names</li>
          <li>Select which banking services to target (Credit Card, Personal Banking, etc.)</li>
          <li>Click "Start Campaign" to begin automated voice surveys</li>
          <li>The AI bot will call customers and discover their reasons for leaving</li>
          <li>Monitor progress and view transcripts in the Dashboard</li>
        </ol>
      </div>
    </div>
  )
}