/* Runtime config — loaded before app.js.
   Web (same-origin server): leave API_BASE empty.
   Native iOS (Capacitor): the web assets are bundled in the app, so API calls
   must target your deployed backend. Set API_BASE to that HTTPS URL, e.g.:
     window.GAS_API_BASE = 'https://api.yourgasapp.com';
*/
window.GAS_API_BASE = window.GAS_API_BASE || '';
