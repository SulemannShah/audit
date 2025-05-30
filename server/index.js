import express from 'express';
import cors from 'cors';
import chromeLauncher from 'chrome-launcher';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Cache for storing recent results
const cache = new Map();
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

// Add a semaphore to limit concurrent audits
let isAuditRunning = false;

async function runLighthouse(url, device = 'mobile') {
  let chrome;
  try {
    console.log(`[${device}] Starting Chrome...`);
    chrome = await chromeLauncher.launch({
      chromeFlags: [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-software-rasterizer',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-features=TranslateUI',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-first-run'
      ]
    });
    console.log(`[${device}] Chrome launched`);

    const { default: lighthouse } = await import('lighthouse');

    const config = {
      extends: 'lighthouse:default',
      settings: {
        formFactor: device,
        screenEmulation: device === 'mobile' ? {
          mobile: true,
          width: 360,
          height: 640,
          deviceScaleFactor: 2,
          disabled: false,
        } : {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false,
        },
        throttling: {
          throughputKbps: device === 'mobile' ? 1638 : 10240,
          rttMs: device === 'mobile' ? 150 : 40,
          cpuSlowdownMultiplier: device === 'mobile' ? 4 : 1,
          requestLatencyMs: device === 'mobile' ? 150 : 0,
          downloadThroughputKbps: device === 'mobile' ? 1638 : 10240,
          uploadThroughputKbps: device === 'mobile' ? 750 : 2048,
        },
        maxWaitForFcp: 15000,
        maxWaitForLoad: 35000,
        pauseAfterFcpMs: 1000,
        pauseAfterLoadMs: 1000,
        networkQuietThresholdMs: 1000,
        cpuQuietThresholdMs: 1000,
        throttlingMethod: 'simulate',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      },
    };

    const options = {
      logLevel: 'info',
      output: 'json',
      port: chrome.port,
    };

    console.log(`[${device}] Starting page load...`);
    const runnerResult = await lighthouse(url, options, config);

    if (!runnerResult || !runnerResult.lhr) {
      throw new Error(`Failed to get results for ${device} audit`);
    }

    console.log(`[${device}] Page loaded, analyzing...`);
    const { categories, audits } = runnerResult.lhr;

    // Validate required data
    if (!categories || !audits) {
      throw new Error(`Missing required audit data for ${device}`);
    }

    // Extract metrics with detailed logging and validation
    console.log(`[${device}] Extracting metrics...`);
    const metrics = {
      firstContentfulPaint: (audits['first-contentful-paint']?.numericValue || 0) / 1000,
      largestContentfulPaint: (audits['largest-contentful-paint']?.numericValue || 0) / 1000,
      totalBlockingTime: Math.round(audits['total-blocking-time']?.numericValue || 0),
      cumulativeLayoutShift: Number(audits['cumulative-layout-shift']?.numericValue || 0),
      speedIndex: (audits['speed-index']?.numericValue || 0) / 1000,
    };

    // Validate metrics
    Object.entries(metrics).forEach(([key, value]) => {
      if (typeof value !== 'number' || isNaN(value)) {
        console.warn(`[${device}] Invalid metric value for ${key}: ${value}`);
        metrics[key] = 0;
      }
    });

    console.log(`[${device}] Analysis complete`);
    return {
      performance: Math.round((categories.performance?.score || 0) * 100),
      accessibility: Math.round((categories.accessibility?.score || 0) * 100),
      seo: Math.round((categories.seo?.score || 0) * 100),
      bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
      metrics
    };
  } catch (error) {
    console.error(`[${device}] Error:`, error);
    throw new Error(`${device} audit failed: ${error.message}`);
  } finally {
    if (chrome) {
      try {
        console.log(`[${device}] Cleaning up...`);
        await chrome.kill();
      } catch (error) {
        console.error(`[${device}] Failed to cleanup Chrome:`, error);
      }
    }
  }
}

// Add retry mechanism for more reliable results
async function runLighthouseWithRetry(url, device, maxRetries = 3) {
  let lastError;
  let attempts = 0;

  while (attempts < maxRetries) {
    attempts++;
    try {
      console.log(`[${device}] Attempt ${attempts} of ${maxRetries}`);
      const result = await runLighthouse(url, device);
      
      // Validate result
      if (!result || typeof result.performance !== 'number') {
        throw new Error('Invalid result structure');
      }

      return result;
    } catch (error) {
      console.error(`[${device}] Attempt ${attempts} failed:`, error);
      lastError = error;
      
      // Wait before retry
      if (attempts < maxRetries) {
        const delay = attempts * 2000; // Increasing delay between retries
        console.log(`[${device}] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`${device} audit failed after ${maxRetries} attempts: ${lastError.message}`);
}

function getMedianResult(results) {
  const sorted = results.sort((a, b) => b.performance - a.performance);
  return sorted[Math.floor(sorted.length / 2)];
}

async function runLighthouseWithMedian(url, device, runs = 3) {
  const results = [];
  
  for (let i = 0; i < runs; i++) {
    const result = await runLighthouse(url, device);
    results.push(result);
  }

  return getMedianResult(results);
}

app.post('/api/audit', async (req, res) => {
  try {
    const { url, device = 'mobile' } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'URL is required' 
      });
    }

    // Validate URL format
    let validUrl;
    try {
      validUrl = new URL(url);
      if (!['http:', 'https:'].includes(validUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch (e) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Invalid URL format. Please include http:// or https://' 
      });
    }

    if (!['mobile', 'desktop'].includes(device)) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Device must be either mobile or desktop' 
      });
    }

    const cacheKey = `${url}-${device}`;
    const cachedResult = cache.get(cacheKey);
    
    if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_DURATION) {
      return res.json(cachedResult.data);
    }

    while (isAuditRunning) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    isAuditRunning = true;

    try {
      console.log(`Starting ${device} audit for ${url}`);
      // Use retry mechanism
      const result = await runLighthouseWithRetry(validUrl.href, device);
      console.log(`Completed ${device} audit for ${url}`);
      
      cache.set(cacheKey, {
        timestamp: Date.now(),
        data: result
      });

      res.json(result);
    } finally {
      isAuditRunning = false;
    }
  } catch (error) {
    console.error('API error:', error);
    isAuditRunning = false;
    res.status(500).json({ 
      error: 'Audit Error',
      message: error.message || 'Failed to run audit'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 