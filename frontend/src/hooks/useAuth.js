/**
 * hooks/useAuth.js
 * Re-export of useAuth from AuthContext for a cleaner import path.
 * Components can import from hooks/ rather than reaching into context/:
 *   import { useAuth } from '../hooks/useAuth';
 */
export { useAuth } from '../context/AuthContext';
