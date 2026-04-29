// Inline script that runs before React hydrates. Reads the saved theme from
// localStorage (or falls back to the OS preference) and toggles the `dark`
// class on <html> so the page paints with the right palette on first frame.
export function ThemeBootstrap() {
  const code = `
(function(){
  try {
    var saved = localStorage.getItem('retro:theme') || 'system';
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = saved === 'dark' || (saved === 'system' && prefersDark);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
