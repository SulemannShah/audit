'use client';
import { useState } from 'react';
import Image from "next/image";
import { runAudit } from './lib/audit';
import { ValueLoader } from './components/ValueLoader';


interface AuditResult {
  performance: number;
  accessibility: number;
  seo: number;
  bestPractices: number;
  metrics: {
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    totalBlockingTime: number;
    cumulativeLayoutShift: number;
    speedIndex: number;
  };
}

interface AuditProgress {
  device: 'mobile' | 'desktop';
  stage: 'starting' | 'loading' | 'analyzing' | 'complete';
  progress: number;
}

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="bg-white shadow-md dark:bg-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <span className="text-2xl font-bold text-blue-600">AuditTool</span>
            </div>
          </div>
          
          {/* Desktop menu */}
          <div className="hidden md:flex items-center space-x-4">
            <a href="#" className="text-gray-700 hover:text-blue-600 dark:text-gray-300 px-3 py-2">
              Home
            </a>
            <a href="#" className="text-gray-700 hover:text-blue-600 dark:text-gray-300 px-3 py-2">
              About
            </a>
            <a href="#" className="text-gray-700 hover:text-blue-600 dark:text-gray-300 px-3 py-2">
              Contact Us
            </a>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-gray-700 hover:text-blue-600 dark:text-gray-300"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {isOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <a href="#" className="block text-gray-700 hover:text-blue-600 dark:text-gray-300 px-3 py-2">
              Home
            </a>
            <a href="#" className="block text-gray-700 hover:text-blue-600 dark:text-gray-300 px-3 py-2">
              About
            </a>
            <a href="#" className="block text-gray-700 hover:text-blue-600 dark:text-gray-300 px-3 py-2">
              Contact Us
            </a>
          </div>
        </div>
      )}
    </header>
  );
};

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{mobile?: AuditResult; desktop?: AuditResult}>({});
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'mobile' | 'desktop'>('mobile');

  const truncateDecimals = (value: number, decimals: number): string => {
    const factor = Math.pow(10, decimals);
    const truncated = Math.floor(value * factor) / factor;
    return truncated.toFixed(decimals);
  };

  const handleAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults({});
    
    try {
      let urlToTest = url;
      if (!/^https?:\/\//i.test(url)) {
        urlToTest = `https://${url}`;
      }

      // Run mobile audit first
      const mobileResult = await runAudit(urlToTest, 'mobile');
      setResults({ mobile: mobileResult });

      // Run desktop audit
      const desktopResult = await runAudit(urlToTest, 'desktop');
      setResults(prev => ({ ...prev, desktop: desktopResult }));

    } catch (err) {
      console.error('Audit error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const switchDevice = (newDevice: 'mobile' | 'desktop') => {
    setActiveTab(newDevice);
  };

  const activeResult = results[activeTab];

  const formatMetric = (value: number | undefined, decimals: number = 1, unit: string = '') => {
    if (typeof value !== 'number') return '0' + (unit ? ` ${unit}` : '');
    return value.toFixed(decimals) + (unit ? ` ${unit}` : '');
  };

  // Update the CircularProgress component to show raw values
  const CircularProgress = ({ value, label, loading }: { value: number; label: string; loading?: boolean }) => {
    const getScoreColor = (score: number) => {
      if (score >= 90) return 'text-green-500';
      if (score >= 50) return 'text-orange-500';
      return 'text-red-500';
    };

    const color = getScoreColor(value);
    
    return (
      <div className="flex flex-col items-center">
        <div className="relative">
          {loading ? (
            <div className="w-24 h-24 rounded-full animate-pulse bg-gray-200 dark:bg-gray-700" />
          ) : (
            <div className="relative inline-flex">
              <div className="w-24 h-24">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle
                    className="text-gray-200 stroke-current"
                    strokeWidth="10"
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                  />
                  <circle
                    className={`stroke-current ${color}`}
                    strokeWidth="10"
                    strokeLinecap="round"
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 * (1 - value / 100)}
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <span className={`text-2xl font-bold ${color}`}>
                    {value}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        <p className="mt-2 font-medium">{label}</p>
      </div>
    );
  };

  // Update the Core Web Vitals section
  const CoreWebVitals = ({ metrics, loading }: { metrics?: AuditResult['metrics'], loading?: boolean }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
      <h3 className="text-xl font-semibold mb-4">Core Web Vitals</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div>
          <p className="font-medium text-gray-600 dark:text-gray-300">
            First Contentful Paint
          </p>
          {loading ? (
            <ValueLoader />
          ) : (
            <p className="text-2xl font-bold text-blue-600">
              {truncateDecimals(metrics?.firstContentfulPaint || 0, 2)}s
            </p>
          )}
        </div>
        <div>
          <p className="font-medium text-gray-600 dark:text-gray-300">
            Largest Contentful Paint
          </p>
          {loading ? (
            <ValueLoader />
          ) : (
            <p className="text-2xl font-bold text-blue-600">
              {truncateDecimals(metrics?.largestContentfulPaint || 0, 2)}s
            </p>
          )}
        </div>
        <div>
          <p className="font-medium text-gray-600 dark:text-gray-300">
            Total Blocking Time
          </p>
          {loading ? (
            <ValueLoader />
          ) : (
            <p className="text-2xl font-bold text-blue-600">
              {Math.floor(metrics?.totalBlockingTime || 0)}ms
            </p>
          )}
        </div>
        <div>
          <p className="font-medium text-gray-600 dark:text-gray-300">
            Cumulative Layout Shift
          </p>
          {loading ? (
            <ValueLoader />
          ) : (
            <p className="text-2xl font-bold text-blue-600">
              {truncateDecimals(metrics?.cumulativeLayoutShift || 0, 3)}
            </p>
          )}
        </div>
        <div>
          <p className="font-medium text-gray-600 dark:text-gray-300">
            Speed Index
          </p>
          {loading ? (
            <ValueLoader />
          ) : (
            <p className="text-2xl font-bold text-blue-600">
              {truncateDecimals(metrics?.speedIndex || 0, 2)}s
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-4xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-8 text-center">Website Audit Tool</h1>
        
        <form onSubmit={handleAudit} className="mb-8">
          <div className="flex gap-4 flex-col md:flex-row">
            <input
              type="text"
              value={url}
              onChange={(e) => {
                // Remove leading/trailing spaces
                const value = e.target.value.trim();
                setUrl(value);
                setError(null);
              }}
              placeholder="Enter website URL (e.g. example.com)"
              required
              className={`flex-1 px-4 py-2 rounded-md border ${
                error 
                  ? 'border-red-500 dark:border-red-700' 
                  : 'border-gray-300 dark:border-gray-700'
              }`}
              aria-invalid={error ? 'true' : 'false'}
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400"
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>
        </form>

        {error && (
          <div className="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100 p-4 rounded-md mb-8">
            {error}
        </div>
        )}

        {(results.mobile || results.desktop || loading) && (
          <>
            <div className="flex justify-center gap-4 mb-8">
              <button
                onClick={() => switchDevice('mobile')}
                className={`px-4 py-2 rounded-md ${
                  activeTab === 'mobile' ? 'bg-blue-600 text-white' : 'bg-gray-100'
                }`}
              >
                Mobile
              </button>
              <button
                onClick={() => switchDevice('desktop')}
                className={`px-4 py-2 rounded-md ${
                  activeTab === 'desktop' ? 'bg-blue-600 text-white' : 'bg-gray-100'
                }`}
              >
                Desktop
              </button>
            </div>

            <div className="space-y-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <CircularProgress 
                  value={activeResult?.performance || 0} 
                  label="Performance" 
                  loading={loading && !activeResult}
                />
                <CircularProgress 
                  value={activeResult?.accessibility || 0} 
                  label="Accessibility" 
                  loading={loading && !activeResult}
                />
                <CircularProgress 
                  value={activeResult?.bestPractices || 0} 
                  label="Best Practices" 
                  loading={loading && !activeResult}
                />
                <CircularProgress 
                  value={activeResult?.seo || 0} 
                  label="SEO" 
                  loading={loading && !activeResult}
                />
              </div>

              <CoreWebVitals 
                metrics={activeResult?.metrics} 
                loading={loading && !activeResult}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
