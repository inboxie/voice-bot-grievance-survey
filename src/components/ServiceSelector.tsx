'use client'

interface ServiceSelectorProps {
  selectedServices: string[]
  onServicesChange: (services: string[]) => void
}

const bankingServices = [
  {
    id: 'credit-card',
    name: 'Credit Card',
    description: 'Customers who closed their credit cards or had credit-related issues',
    keywords: ['credit card', 'card', 'credit', 'limit', 'interest rate', 'annual fee']
  },
  {
    id: 'personal-banking',
    name: 'Personal Banking',
    description: 'Checking/savings account closures and personal banking services',
    keywords: ['account', 'checking', 'savings', 'personal banking', 'fees', 'branch']
  },
  {
    id: 'loans',
    name: 'Loans',
    description: 'Personal loans, auto loans, and other lending products',
    keywords: ['loan', 'personal loan', 'auto loan', 'lending', 'interest', 'payment']
  },
  {
    id: 'mortgage',
    name: 'Mortgage',
    description: 'Home loans and mortgage-related services',
    keywords: ['mortgage', 'home loan', 'refinance', 'property', 'house']
  },
  {
    id: 'business-banking',
    name: 'Business Banking',
    description: 'Business accounts and commercial banking services',
    keywords: ['business', 'commercial', 'business account', 'merchant', 'payroll']
  },
  {
    id: 'investment',
    name: 'Investment Services',
    description: 'Investment accounts, wealth management, and advisory services',
    keywords: ['investment', 'wealth', 'portfolio', 'advisor', 'trading', 'retirement']
  },
  {
    id: 'mobile-online',
    name: 'Mobile & Online Banking',
    description: 'Digital banking platform and mobile app issues',
    keywords: ['mobile', 'online', 'app', 'digital', 'website', 'login', 'technology']
  },
  {
    id: 'customer-service',
    name: 'Customer Service',
    description: 'General service quality and customer experience issues',
    keywords: ['service', 'support', 'staff', 'wait time', 'help', 'experience', 'rude']
  }
]

export default function ServiceSelector({ selectedServices, onServicesChange }: ServiceSelectorProps) {
  const handleServiceToggle = (serviceId: string) => {
    if (selectedServices.includes(serviceId)) {
      onServicesChange(selectedServices.filter(id => id !== serviceId))
    } else {
      onServicesChange([...selectedServices, serviceId])
    }
  }

  const handleSelectAll = () => {
    if (selectedServices.length === bankingServices.length) {
      onServicesChange([])
    } else {
      onServicesChange(bankingServices.map(service => service.id))
    }
  }

  return (
    <div className="space-y-4">
      {/* Select All Button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">
          Banking Services ({selectedServices.length} selected)
        </h3>
        <button
          onClick={handleSelectAll}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          {selectedServices.length === bankingServices.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      {/* Service Grid */}
      <div className="grid grid-cols-1 gap-3">
        {bankingServices.map((service) => {
          const isSelected = selectedServices.includes(service.id)
          return (
            <div
              key={service.id}
              onClick={() => handleServiceToggle(service.id)}
              className={`relative rounded-lg border p-4 cursor-pointer transition-all ${
                isSelected
                  ? 'border-primary-300 bg-primary-50 ring-2 ring-primary-500'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleServiceToggle(service.id)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </div>
                <div className="ml-3 flex-1">
                  <label className="block text-sm font-medium text-gray-900 cursor-pointer">
                    {service.name}
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    {service.description}
                  </p>
                  <div className="mt-2">
                    <div className="flex flex-wrap gap-1">
                      {service.keywords.slice(0, 4).map((keyword, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                        >
                          {keyword}
                        </span>
                      ))}
                      {service.keywords.length > 4 && (
                        <span className="text-xs text-gray-400">
                          +{service.keywords.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Selection Summary */}
      {selectedServices.length > 0 && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="text-sm font-medium text-blue-900 mb-2">
            Selected Services:
          </h4>
          <div className="flex flex-wrap gap-1">
            {selectedServices.map(serviceId => {
              const service = bankingServices.find(s => s.id === serviceId)
              return service ? (
                <span
                  key={serviceId}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                >
                  {service.name}
                </span>
              ) : null
            })}
          </div>
          <p className="text-xs text-blue-700 mt-2">
            Customers will be filtered based on their reason for leaving matching these service keywords.
          </p>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
        <p className="font-medium text-gray-700 mb-1">How it works:</p>
        <p>
          The system will match customer "Reason for Leaving" text against the keywords for each selected service. 
          Only customers whose reasons contain these keywords will be called for the survey.
        </p>
      </div>
    </div>
  )
}