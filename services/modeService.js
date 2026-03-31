'use strict';

/**
 * modeService.js
 * --------------
 * Single source of truth for the platform runtime mode.
 *
 * Modes:
 *   'test'    — All sends go to TEST_EMAIL only. Default on startup.
 *   'live'    — Sends go to the selected segment/list. Must be explicitly activated.
 *   'offline' — All sends are blocked entirely.
 *
 * The mode resets to 'test' on every redeploy (safe default).
 * It is changed at runtime via POST /api/mode from the dashboard.
 *
 * Usage in controllers:
 *   const modeService = require('../services/modeService');
 *   if (modeService.isOffline()) { return res.status(503)... }
 *   const finalRecipients = modeService.isTestMode()
 *     ? [{ email: modeService.getTestEmail() }]
 *     : recipients;
 */

let _mode = 'test'; // 'test' | 'live' | 'offline'

/** Return the current mode string. */
function getMode() {
  return _mode;
}

/**
 * Set the mode. Throws if mode is invalid or if switching to 'live'
 * without the confirmed flag.
 */
function setMode(mode, confirmed) {
  if (!['test', 'live', 'offline'].includes(mode)) {
    throw new Error(`Invalid mode "${mode}". Must be test, live, or offline.`);
  }
  if (mode === 'live' && confirmed !== true) {
    throw new Error('Switching to live requires confirmed = true.');
  }
  _mode = mode;
  console.log(`\u26a0\ufe0f  [modeService] Runtime mode changed to: ${mode.toUpperCase()}`);
}

/** True when all sends should be blocked. */
function isOffline() {
  return _mode === 'offline';
}

/**
 * True when sends should go to TEST_EMAIL only.
 * This is true in 'test' mode AND in 'offline' mode (offline blocks entirely,
 * but if somehow a send slips through, it should never hit real contacts).
 */
function isTestMode() {
  return _mode !== 'live';
}

/** The test email address from the environment. */
function getTestEmail() {
  return process.env.TEST_EMAIL || 'harrison@artisan.com.au';
}

module.exports = { getMode, setMode, isOffline, isTestMode, getTestEmail };
