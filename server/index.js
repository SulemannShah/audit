import express from 'express';
import cors from 'cors';
import chromeLauncher from 'chrome-launcher';

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Track active audits
let activeAudit = null;

async function runLighthouse(url, device = 'mobile') {
  let chrome;
  try {
    console.log(`Starting ${device} audit for ${url}`);
    chrome = await chromeLauncher.launch({
      chromeFlags: [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions'
      ]
    });

    const { default: lighthouse } = await import('lighthouse');
    
    const config = {
      extends: 'lighthouse:default',
      settings: {
        formFactor: device,
        screenEmulation: {
          mobile: device === 'mobile',
          width: device === 'mobile' ? 360 : 1350,
          height: device === 'mobile' ? 640 : 940,
          deviceScaleFactor: device === 'mobile' ? 2 : 1,
        },
        throttling: {
          cpuSlowdownMultiplier: device === 'mobile' ? 4 : 1,
          throughputKbps: device === 'mobile' ? 1638 : 10240,
          rttMs: device === 'mobile' ? 150 : 40,
        }
      }
    };

    console.log(`Running Lighthouse for ${device}...`);
    const runnerResult = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'info',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo']
    }, config);

    if (!runnerResult?.lhr) {
      throw new Error('Lighthouse audit failed to return results');
    }

    const { categories, audits } = runnerResult.lhr;
    console.log(`Completed ${device} audit for ${url}`);

    return {
      performance: Math.round((categories.performance?.score || 0) * 100),
      accessibility: Math.round((categories.accessibility?.score || 0) * 100),
      seo: Math.round((categories.seo?.score || 0) * 100),
      bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
      metrics: {
        firstContentfulPaint: (audits['first-contentful-paint']?.numericValue || 0) / 1000,
        largestContentfulPaint: (audits['largest-contentful-paint']?.numericValue || 0) / 1000,
        totalBlockingTime: audits['total-blocking-time']?.numericValue || 0,
        cumulativeLayoutShift: audits['cumulative-layout-shift']?.numericValue || 0,
        speedIndex: (audits['speed-index']?.numericValue || 0) / 1000
      }
    };
  } catch (error) {
    console.error(`Error in ${device} audit:`, error);
    throw error;
  } finally {
    if (chrome) {
      console.log('Closing Chrome...');
      await chrome.kill();
    }
  }
}

app.post('/api/audit', async (req, res) => {
  try {
    const { url, device = 'mobile' } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL
    let validUrl;
    try {
      validUrl = new URL(url);
      if (!['http:', 'https:'].includes(validUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Cancel any active audit
    if (activeAudit) {
      console.log('Cancelling previous audit...');
      activeAudit.abort();
    }

    // Start new audit
    console.log(`Starting new audit for ${url} on ${device}`);
    activeAudit = { url, device, abort: () => {} };

    const result = await runLighthouse(validUrl.href, device);
    activeAudit = null;

    res.json(result);
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to run audit'
    });
  }
});

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 