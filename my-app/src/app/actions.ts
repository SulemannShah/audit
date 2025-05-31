'use server'

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

    const response = await fetch('http://localhost:3000/api/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, device })
    });

    if (updateProgress) {
      updateProgress({ device, stage: 'analyzing', progress: 50 });
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Audit failed');
    }

    if (updateProgress) {
      updateProgress({ device, stage: 'complete', progress: 100 });
    }

    return data;
  } catch (error) {
    console.error('Audit error:', error);
    throw error;
  }
} 