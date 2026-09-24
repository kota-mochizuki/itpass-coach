import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import Analysis from '../ui/screens/Analysis';
import Done from '../ui/screens/Done';
import Home from '../ui/screens/Home';
import Learn from '../ui/screens/Learn';
import Player from '../ui/screens/Player';
import Review from '../ui/screens/Review';
import Settings from '../ui/screens/Settings';
import { StoreProvider } from './store';

const TABS = [
  { to: '/', label: 'ホーム', icon: '⌂' },
  { to: '/learn', label: '学習', icon: '✎' },
  { to: '/review', label: '復習', icon: '↺' },
  { to: '/analysis', label: '分析', icon: '▤' },
  { to: '/settings', label: '設定', icon: '⚙' },
];

function Shell() {
  const loc = useLocation();
  const focus = loc.pathname.startsWith('/play') || loc.pathname.startsWith('/done');
  return (
    <>
      <main className={focus ? 'focus' : ''}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/review" element={<Review />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/play/:sid" element={<Player />} />
          <Route path="/done/:sid" element={<Done />} />
        </Routes>
      </main>
      {!focus && (
        <nav className="tabbar">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end className={({ isActive }) => (isActive ? 'on' : '')}>
              <span aria-hidden>{t.icon}</span>{t.label}
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <HashRouter><Shell /></HashRouter>
    </StoreProvider>
  );
}
