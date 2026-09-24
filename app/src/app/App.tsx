import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import Analysis from '../ui/screens/Analysis';
import Done from '../ui/screens/Done';
import Home from '../ui/screens/Home';
import Learn from '../ui/screens/Learn';
import Player from '../ui/screens/Player';
import Review from '../ui/screens/Review';
import Settings from '../ui/screens/Settings';
import { useEffect } from 'react';
import { ConfettiLayer, ToastLayer } from '../ui/Celebrate';
import { setFeedbackPrefs } from '../ui/motion';
import { StoreProvider, useStore } from './store';

const ICON: Record<string, string> = {
  home: 'M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5z',
  learn: 'M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z',
  review: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4',
  analysis: 'M5 20V10M12 20V4M19 20v-7',
};
const TABS = [
  { to: '/', label: 'ホーム', icon: 'home' },
  { to: '/learn', label: '学習', icon: 'learn' },
  { to: '/review', label: '復習', icon: 'review' },
  { to: '/analysis', label: '分析', icon: 'analysis' },
];

function Shell() {
  const loc = useLocation();
  const { settings } = useStore();
  useEffect(() => { setFeedbackPrefs({ haptics: settings.hapticsOn, sound: settings.soundOn }); }, [settings.hapticsOn, settings.soundOn]);
  const focus = loc.pathname.startsWith('/play') || loc.pathname.startsWith('/done');
  return (
    <>
      <main className={focus ? 'focus' : ''}>
        <div key={loc.pathname.split('/')[1] || 'home'} className="route-enter">
        <Routes location={loc}>
          <Route path="/" element={<Home />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/review" element={<Review />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/play/:sid" element={<Player />} />
          <Route path="/done/:sid" element={<Done />} />
        </Routes>
        </div>
      </main>
      <ConfettiLayer />
      <ToastLayer />
      {!focus && (
        <nav className="tabbar">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end className={({ isActive }) => (isActive ? 'on' : '')}>
              <svg viewBox="0 0 24 24" aria-hidden><path d={ICON[t.icon]} /></svg>{t.label}
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
