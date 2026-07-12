const API_BASE_URL = process.env.QA_API_BASE_URL ?? 'http://localhost:3000/v1';
const WEB_BASE_URL = process.env.QA_WEB_BASE_URL ?? 'http://localhost:3001';

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

describe('FleetFlow stack smoke (e2e)', () => {
  const runLiveStack = process.env.QA_RUN_LIVE_STACK === 'true';

  const maybeIt = runLiveStack ? it : it.skip;

  maybeIt('API health/live is reachable', async () => {
    const { status, body } = await fetchJson(`${API_BASE_URL}/health/live`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: 'ok', service: 'fleetflow-api' });
  });

  maybeIt('API health/ready is reachable', async () => {
    const { status, body } = await fetchJson(`${API_BASE_URL}/health/ready`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: 'ready', service: 'fleetflow-api' });
  });

  maybeIt('Web portal home is reachable', async () => {
    const response = await fetch(WEB_BASE_URL);
    expect(response.status).toBe(200);
  });
});
