# SkyCred ⛅

A weather dashboard with a credit-score-inspired experience. Search any city to see current conditions — temperature, feels-like, condition, humidity, wind and UV — plus formatted/raw JSON views of the underlying data.

**Live:** https://credsky-mk.vercel.app

## Features (MVP)

- **City search** (P0) — retrieve current weather by city name
- **Current weather dashboard** (P0) — city, temp °C, feels-like, condition + icon, humidity, wind kph, UV index, **AQI (US EPA index with readable label)**, last-updated timestamp
- **Popular cities** (P1) — one-tap lookup for Mumbai, Delhi, Bengaluru, London, New York, Tokyo, Dubai, Singapore
- **Formatted / Raw JSON views** (P1) — inspect the exact API response, both reflecting the latest successful search
- **Copy** (P1) — copy the displayed JSON with visible confirmation and graceful fallback
- **Loading, error and empty states**, protected API key, analytics event instrumentation

## Tech

- Static HTML/CSS/JS frontend (no framework, no build step)
- Vercel Serverless Function (`api/weather.js`) proxies [WeatherAPI.com](https://www.weatherapi.com/) `/v1/current.json` so the API key never reaches the client
- WeatherAPI key stored as the `WEATHERAPI_KEY` environment variable in Vercel

## Local development

```bash
npm i -g vercel
vercel dev          # needs WEATHERAPI_KEY in .env.local
```

## Analytics events

`city_search_submitted`, `popular_city_selected`, `weather_search_success`, `weather_search_failed`, `json_view_switched`, `weather_data_copied` — logged via a `track()` sink in `app.js`, ready to swap for a real analytics provider.
