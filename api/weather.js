// Vercel Serverless Function — proxies WeatherAPI.com so the API key stays server-side.
const WEATHER_API_BASE = 'https://api.weatherapi.com/v1/current.json';

module.exports = async (req, res) => {
  // Basic CORS + method guard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: { message: 'Method not allowed. Use GET.' } });
  }

  const query = String((req.query && (req.query.q || req.query.city)) || '').trim();
  if (!query) {
    return res.status(400).json({ error: { message: 'Please provide a city name. Example: /api/weather?q=Mumbai' } });
  }

  const apiKey = process.env.WEATHERAPI_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'Weather API key is not configured on the server.' } });
  }

  const url = `${WEATHER_API_BASE}?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&aqi=yes`;

  try {
    const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
    let data = null;
    try { data = await upstream.json(); } catch { /* non-JSON upstream response */ }

    if (!upstream.ok) {
      const status = upstream.status;
      let message = 'Weather service returned an unexpected error. Please try again.';

      if (data && data.error && data.error.message) {
        message = data.error.message;
      }
      if (status === 400) {
        message = (data && data.error && data.error.message) || 'We could not find that city. Please check the spelling and try again.';
      } else if (status === 401 || status === 403) {
        message = 'Weather service authentication failed or the plan quota is exceeded. Please try again later.';
      } else if (status === 429) {
        message = 'Too many requests right now. Please wait a moment and try again.';
      }

      return res.status(status >= 500 ? 502 : status).json({
        error: { message, status },
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({
      error: { message: 'Could not reach the weather service. Please check your connection and try again.' },
    });
  }
};
