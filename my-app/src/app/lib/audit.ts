interface AuditProgress {
  device: 'mobile' | 'desktop';
  stage: 'starting' | 'analyzing' | 'complete';
  progress: number;
}

export async function runAudit(url: string, device: 'mobile' | 'desktop', 
  updateProgress?: (progress: AuditProgress) => void) {
  try {
    if (updateProgress) {
      updateProgress({ device, stage: 'starting', progress: 0 });
    }

    const response = await fetch('http://localhost:5000/api/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, device })
    });

    if (updateProgress) {
      updateProgress({ device, stage: 'analyzing', progress: 50 });
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Audit failed');
    }

    const result = await response.json();

    if (updateProgress) {
      updateProgress({ device, stage: 'complete', progress: 100 });
    }

    return result;
  } catch (error) {
    console.error('Audit error:', error);
    throw error;
  }
} 