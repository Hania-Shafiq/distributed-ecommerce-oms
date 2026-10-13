/**
 * utils/formatError.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Formats errors into clean, friendly messages for users.
 * Strips away raw backend traces, HTTP status codes, socket errors,
 * database details, and internal architectural references.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function formatError(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;

  // If already a simple friendly string
  if (typeof err === 'string') {
    return sanitizeTechnicalString(err, fallback);
  }

  // Handle FastAPI / backend validation errors: detail can be an array of objects
  const responseData = err?.response?.data;
  if (responseData) {
    if (typeof responseData.detail === 'string') {
      return sanitizeTechnicalString(responseData.detail, fallback);
    }
    if (Array.isArray(responseData.detail)) {
      // E.g. [{ msg: 'Password too short' }]
      const messages = responseData.detail
        .map(item => item?.msg || item?.message)
        .filter(Boolean);
      if (messages.length > 0) {
        return messages.join('. ');
      }
    }
    if (typeof responseData.message === 'string') {
      return sanitizeTechnicalString(responseData.message, fallback);
    }
  }

  // Handle HTTP status codes
  const status = err?.response?.status;
  if (status === 404) {
    return 'The requested resource was not found.';
  }
  if (status === 401 || status === 403) {
    return 'You do not have permission to perform this action. Please sign in.';
  }
  if (status >= 500) {
    return 'Our servers are experiencing high load. Please try again in a moment.';
  }

  // Handle Axios / Network errors
  if (err.code === 'ERR_NETWORK' || (err.message && err.message.toLowerCase().includes('network error'))) {
    return 'Unable to connect to the store network. Please check your internet connection.';
  }

  if (err.message) {
    return sanitizeTechnicalString(err.message, fallback);
  }

  return fallback;
}

/**
 * Filter out strings that look like raw code errors, stack traces, or internal URLs
 */
function sanitizeTechnicalString(text, fallback) {
  if (!text) return fallback;

  const technicalKeywords = [
    'err_',
    'internal server error',
    'econnrefused',
    'traceback',
    'exception',
    'status code 5',
    'status code 4',
    'axioserror',
    'null pointer',
    'sql',
    'port 800',
    'microservice',
    'localhost',
  ];

  const lower = text.toLowerCase();
  const isTechnical = technicalKeywords.some(kw => lower.includes(kw));

  if (isTechnical) {
    return fallback;
  }

  return text;
}
