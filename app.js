/* SkyCred — client logic */
(function () {
  'use strict';

  /* ---------------- Analytics instrumentation (privacy-friendly stub) ----------------
     Events: city_search_submitted, popular_city_selected, weather_search_success,
             weather_search_failed, json_view_switched, weather_data_copied          */
  function track(eventName, props) {
    var payload = Object.assign({ event: eventName, ts: new Date().toISOString() }, props || {});
    // Console sink for the MVP; swap in a real analytics provider without touching call sites.
    if (window.console && console.info) {
      console.info('[analytics]', JSON.stringify(payload));
    }
  }

  /* ---------------- Popular cities ---------------- */
  var POPULAR_CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'London', 'New York', 'Tokyo', 'Dubai', 'Singapore'];

  /* ---------------- State ---------------- */
  var state = {
    lastResponse: null,      // latest successful API response (single source of truth)
    jsonView: 'formatted',   // 'formatted' | 'raw'
    lastRequestSeq: 0        // guards against out-of-order responses
  };

  /* ---------------- Element refs ---------------- */
  var form = document.getElementById('search-form');
  var input = document.getElementById('city-input');
  var searchBtn = document.getElementById('search-btn');
  var popularList = document.getElementById('popular-list');
  var statusBox = document.getElementById('status');
  var statusText = document.getElementById('status-text');
  var dashboard = document.getElementById('dashboard');
  var dataCard = document.getElementById('data-card');

  var dialTemp = document.getElementById('dial-temp');
  var heroLocation = document.getElementById('hero-location');
  var heroCountry = document.getElementById('hero-country');
  var conditionIcon = document.getElementById('condition-icon');
  var conditionText = document.getElementById('condition-text');
  var feelsLike = document.getElementById('feels-like');
  var lastUpdated = document.getElementById('last-updated');
  var metricHumidity = document.getElementById('metric-humidity');
  var metricWind = document.getElementById('metric-wind');
  var metricUV = document.getElementById('metric-uv');

  var tabFormatted = document.getElementById('tab-formatted');
  var tabRaw = document.getElementById('tab-raw');
  var jsonCode = document.querySelector('#json-view .json-code');
  var copyBtn = document.getElementById('copy-btn');
  var copyLabel = document.getElementById('copy-label');

  /* ---------------- Helpers ---------------- */
  function setLoading(isLoading, message) {
    if (isLoading) {
      statusBox.hidden = false;
      statusBox.classList.remove('status--error');
      statusBox.classList.add('status--loading');
      statusText.textContent = message || 'Fetching weather…';
      searchBtn.disabled = true;
      searchBtn.textContent = 'Loading…';
    } else {
      searchBtn.disabled = false;
      searchBtn.textContent = 'Get Weather';
    }
  }

  function showError(message) {
    statusBox.hidden = false;
    statusBox.classList.remove('status--loading');
    statusBox.classList.add('status--error');
    statusText.textContent = message;
    searchBtn.disabled = false;
    searchBtn.textContent = 'Get Weather';
  }

  function clearStatus() {
    statusBox.hidden = true;
    statusText.textContent = '';
    statusBox.classList.remove('status--loading', 'status--error');
  }

  function safe(value, fallback) {
    return (value === null || value === undefined || value === '') ? fallback : value;
  }

  function renderWeather(data) {
    var loc = data.location || {};
    var cur = data.current || {};
    var cond = cur.condition || {};

    dialTemp.textContent = safe(cur.temp_c, '--') + '°';
    heroLocation.textContent = safe(loc.name, 'Unknown location');
    heroCountry.textContent = [loc.region, loc.country].filter(Boolean).join(', ') || '—';
    conditionIcon.src = cond.icon ? (cond.icon.indexOf('//') === 0 ? 'https:' + cond.icon : cond.icon) : '';
    conditionIcon.alt = cond.text || 'Weather condition icon';
    conditionText.textContent = safe(cond.text, '—');
    feelsLike.textContent = safe(cur.feelslike_c, '—') + '°C';
    lastUpdated.textContent = safe(cur.last_updated, '—');
    metricHumidity.textContent = safe(cur.humidity, '—');
    metricWind.textContent = safe(cur.wind_kph, '—');
    metricUV.textContent = safe(cur.uv, '—');

    dashboard.hidden = false;
    dataCard.hidden = false;
  }

  function renderJson() {
    if (!state.lastResponse) return;
    jsonCode.textContent = state.jsonView === 'formatted'
      ? JSON.stringify(state.lastResponse, null, 2)
      : JSON.stringify(state.lastResponse);
  }

  function setJsonView(view) {
    if (state.jsonView === view) return;
    state.jsonView = view;
    var isFormatted = view === 'formatted';
    tabFormatted.classList.toggle('is-active', isFormatted);
    tabRaw.classList.toggle('is-active', !isFormatted);
    tabFormatted.setAttribute('aria-selected', String(isFormatted));
    tabRaw.setAttribute('aria-selected', String(!isFormatted));
    renderJson();
    track('json_view_switched', { view: view });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for older browsers / restricted permissions
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('execCommand copy failed'));
      } catch (e) { reject(e); }
    });
  }

  function flashCopySuccess() {
    copyBtn.classList.add('copy-btn--done');
    copyLabel.textContent = 'Copied ✓';
    setTimeout(function () {
      copyBtn.classList.remove('copy-btn--done');
      copyLabel.textContent = 'Copy JSON';
    }, 1800);
  }

  /* ---------------- Core: fetch weather ---------------- */
  function fetchWeather(city, source) {
    var trimmed = (city || '').trim();
    if (!trimmed) {
      showError('Please enter a city name to search.');
      return;
    }

    var seq = ++state.lastRequestSeq;
    clearStatus();
    setLoading(true, 'Fetching weather for “' + trimmed + '”…');

    fetch('/api/weather?q=' + encodeURIComponent(trimmed))
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, status: res.status, body: body };
        });
      })
      .then(function (result) {
        if (seq !== state.lastRequestSeq) return; // a newer search superseded this one

        if (!result.ok) {
          var msg = (result.body && result.body.error && result.body.error.message) ||
            'Something went wrong while fetching the weather. Please try again.';
          showError(msg);
          // Keep the previous successful dashboard visible; never show misleading values.
          track('weather_search_failed', { query: trimmed, source: source, status: result.status, reason: msg });
          return;
        }

        state.lastResponse = result.body;
        setLoading(false);
        clearStatus();
        renderWeather(result.body);
        renderJson();
        track('weather_search_success', {
          query: trimmed,
          source: source,
          city: result.body && result.body.location ? result.body.location.name : trimmed,
          latencyMs: null
        });
      })
      .catch(function () {
        if (seq !== state.lastRequestSeq) return;
        showError('Network error. Please check your connection and try again.');
        track('weather_search_failed', { query: trimmed, source: source, status: 0, reason: 'network_error' });
      });
  }

  /* ---------------- Events ---------------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var value = input.value;
    if (!value.trim()) {
      showError('Please enter a city name to search.');
      return;
    }
    track('city_search_submitted', { query: value.trim() });
    fetchWeather(value, 'search');
  });

  POPULAR_CITIES.forEach(function (city) {
    var li = document.createElement('li');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = city;
    btn.addEventListener('click', function () {
      input.value = city;
      track('popular_city_selected', { city: city });
      fetchWeather(city, 'popular');
    });
    li.appendChild(btn);
    popularList.appendChild(li);
  });

  tabFormatted.addEventListener('click', function () { setJsonView('formatted'); });
  tabRaw.addEventListener('click', function () { setJsonView('raw'); });

  copyBtn.addEventListener('click', function () {
    if (!state.lastResponse) return;
    var text = state.jsonView === 'formatted'
      ? JSON.stringify(state.lastResponse, null, 2)
      : JSON.stringify(state.lastResponse);
    copyText(text)
      .then(function () {
        flashCopySuccess();
        track('weather_data_copied', { view: state.jsonView, city: state.lastResponse && state.lastResponse.location ? state.lastResponse.location.name : null });
      })
      .catch(function () {
        copyLabel.textContent = 'Copy failed';
        setTimeout(function () { copyLabel.textContent = 'Copy JSON'; }, 1800);
      });
  });

  /* ---------------- Init ---------------- */
  // Default query per FR-10: Mumbai
  fetchWeather('Mumbai', 'default');
})();
