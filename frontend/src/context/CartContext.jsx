/**
 * context/CartContext.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side cart state — no backend involved yet (Order Service routes TBD).
 * Cart items are persisted to localStorage so they survive page refreshes.
 *
 * USAGE:
 *   import { useCart } from '../context/CartContext';
 *   const { cartItems, addToCart, removeFromCart, clearCart, cartTotal } = useCart();
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState(() => {
    try {
      const stored = localStorage.getItem('oms_cart');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Persist cart to localStorage on every change
  useEffect(() => {
    localStorage.setItem('oms_cart', JSON.stringify(cartItems));
  }, [cartItems]);

  /**
   * Add a product to the cart, or increment quantity if already present.
   * @param {Object} product - full product object from productApi
   */
  function addToCart(product) {
    setCartItems(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        // Already in cart → increment quantity
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      // New item → add with quantity 1
      return [...prev, { ...product, quantity: 1 }];
    });
  }

  /**
   * Remove one unit of a product. If quantity reaches 0, remove the item entirely.
   */
  function removeFromCart(productId) {
    setCartItems(prev =>
      prev
        .map(item =>
          item.id === productId ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter(item => item.quantity > 0)
    );
  }

  /** Remove a product from the cart completely, regardless of quantity. */
  function removeItemCompletely(productId) {
    setCartItems(prev => prev.filter(item => item.id !== productId));
  }

  /** Empty the cart (e.g. after a successful order). */
  function clearCart() {
    setCartItems([]);
  }

  /** Total number of individual units in the cart (used for badge on Navbar). */
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  /** Total price of all items. */
  const cartTotal = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const value = {
    cartItems,
    addToCart,
    removeFromCart,
    removeItemCompletely,
    clearCart,
    cartCount,
    cartTotal,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}
