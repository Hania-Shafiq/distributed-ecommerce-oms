/**
 * components/Footer.jsx
 * Simple site footer with brand colors.
 */
export default function Footer() {
  return (
    <footer className="bg-shadow-grey text-ash-grey text-sm py-6 mt-auto">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-3">
        <p className="font-semibold">
          <span className="text-sea-green">OMS</span>Store — Distributed E-Commerce
        </p>
        <p>© {new Date().getFullYear()} All rights reserved.</p>
        <div className="flex gap-4">
          <a href="#" className="hover:text-white transition-colors">Privacy</a>
          <a href="#" className="hover:text-white transition-colors">Terms</a>
          <a href="#" className="hover:text-white transition-colors">Contact</a>
        </div>
      </div>
    </footer>
  );
}
